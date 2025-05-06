import Elysia, { error } from "elysia";
import { client, dbschema } from "@/database";
import { chatgptModel } from "./chat.model";
import { jwt } from "@elysiajs/jwt";
import { OpenAI } from "@llamaindex/openai";
import { Settings } from "@llamaindex/core/global";
import type { ChatMessage } from "@llamaindex/core/llms";
import { ChatMemoryBuffer } from "@llamaindex/core/memory";
import { SimpleChatEngine } from "@llamaindex/core/chat-engine";
import { uuid as $uuid } from "@/../dbschema/edgeql-js/modules/std";

export class ChatGPTService {
	async createConversation(userId: string) {
		const conversation = await dbschema
			.select(
				dbschema.insert(dbschema.Conversation, {
					owner: dbschema.assert_single(
						dbschema.select(dbschema.User, (user) => ({
							filter: dbschema.op(user.id, "=", $uuid(userId)),
						})),
					),
				}),
				(inserted) => ({
					id: true,
					created_at: true,
				}),
			)
			.run(client);

		return {
			id: conversation.id,
			created_at: conversation.created_at,
		};
	}

	async getConversations(userId: string) {
		const conversations = await dbschema
			.select(dbschema.Conversation, (conversation) => ({
				id: true,
				created_at: true,
				filter: dbschema.op(conversation.owner.id, "=", $uuid(userId)),
				order_by: {
					expression: conversation.created_at,
					direction: "DESC",
				},
			}))
			.run(client);

		return conversations;
	}

	async getConversation(conversationId: string, userId: string) {
		// First, we verify that the conversation exists and belongs to the user
		const [conversation] = await dbschema
			.select(dbschema.Conversation, (conversation) => ({
				id: true,
				created_at: true,
				filter: dbschema.op(
					dbschema.op(conversation.id, "=", $uuid(conversationId)),
					"and",
					dbschema.op(conversation.owner.id, "=", $uuid(userId)),
				),
			}))
			.run(client);

		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Then we fetch the messages with a separate query and sort them
		const messages = await dbschema
			.select(dbschema.Message, (message) => ({
				id: true,
				content: true,
				created_at: true,
				message_type: true,
				filter: dbschema.op(
					message.conversation.id,
					"=",
					$uuid(conversationId),
				),
				order_by: {
					expression: message.created_at,
					direction: "ASC",
				},
			}))
			.run(client);

		// Assemble the final object to return
		return {
			id: conversation.id,
			created_at: conversation.created_at,
			messages,
		};
	}

	async addMessage(conversationId: string, userId: string, content: string) {
		// First verify the conversation belongs to the user
		const [conversation] = await dbschema
			.select(dbschema.Conversation, (conversation) => ({
				id: true,
				filter: dbschema.op(
					dbschema.op(conversation.id, "=", $uuid(conversationId)),
					"and",
					dbschema.op(conversation.owner.id, "=", $uuid(userId)),
				),
			}))
			.run(client);

		if (!conversation) {
			throw new Error("Conversation not found");
		}

		// Add user message
		const userMessage = await dbschema
			.select(
				dbschema.insert(dbschema.Message, {
					content,
					message_type: "user",
					conversation: dbschema
						.select(dbschema.Conversation, (c) => ({
							filter: dbschema.op(c.id, "=", $uuid(conversationId)),
						}))
						.assert_single(),
				}),
				(m) => ({
					id: true,
					content: true,
					created_at: true,
					message_type: true,
				}),
			)
			.run(client);

		// Return only the user message. AI generation and saving will happen in the controller.
		return {
			id: userMessage.id,
			content: userMessage.content,
			created_at: userMessage.created_at,
			message_type: userMessage.message_type,
		};
	}

	// New method to save the AI message after streaming is complete
	async saveAIMessage(conversationId: string, content: string) {
		// No need to re-verify ownership here as it's an internal call after verification in the controller handler
		const aiMessage = await dbschema
			.select(
				dbschema.insert(dbschema.Message, {
					content: content,
					message_type: "ai",
					conversation: dbschema
						.select(dbschema.Conversation, (c) => ({
							filter: dbschema.op(c.id, "=", $uuid(conversationId)),
						}))
						.assert_single(),
				}),
				(m) => ({
					id: true,
					content: true,
					created_at: true,
					message_type: true,
				}),
			)
			.run(client);

		return {
			id: aiMessage.id,
			content: aiMessage.content,
			created_at: aiMessage.created_at,
			message_type: aiMessage.message_type,
		};
	}

	// Updated to use LlamaIndex OpenAI - Note: this method is no longer directly called by addMessage
	// It will be used by the controller's streaming endpoint.
	async generateAIResponseStream(
		conversationId: string,
		userId: string,
		userMessageContent: string,
	) {
		console.log(
			`DEBUG: Starting AI response generation for conversation ${conversationId}`,
		);

		try {
			// Fetch conversation history for context
			console.log(`DEBUG: Fetching conversation history`);
			const conversation = await this.getConversation(conversationId, userId);
			if (!conversation) {
				throw new Error("Conversation not found"); // Should be handled before calling this
			}
			console.log(
				`DEBUG: Found conversation with ${conversation.messages.length} messages`,
			);

			const history: ChatMessage[] = conversation.messages.map((msg) => ({
				content: msg.content,
				role: msg.message_type === "user" ? "user" : "assistant", // Map db type to LlamaIndex role
			}));
			console.log(`DEBUG: Mapped ${history.length} messages to chat history`);

			console.log(
				`DEBUG: Initializing OpenAI with API key: ${process.env.OPENAI_API_KEY ? "present" : "missing"}`,
			);
			const llm = new OpenAI({
				apiKey: process.env.OPENAI_API_KEY,
				model: "gpt-4o-mini", // Or your preferred model
				timeout: 30000, // 30 second timeout for API calls
			});
			Settings.llm = llm;

			console.log(`DEBUG: Creating chat engine`);
			const chatHistory = new ChatMemoryBuffer({ chatHistory: history });
			const chatEngine = new SimpleChatEngine({
				llm,
				memory: chatHistory,
			});

			console.log(`DEBUG: Starting chat stream`);
			// Return the stream directly
			return chatEngine.chat({ message: userMessageContent, stream: true });
		} catch (error) {
			console.error(`DEBUG: Error in generateAIResponseStream:`, error);
			throw error;
		}
	}
}

// Define the type for the service instance including derived properties
export type ChatGPTServiceInstance = ReturnType<typeof chatgptService>;

export const chatgptService = () =>
	new Elysia({ name: "chat/service" })
		.use(chatgptModel)
		.use(
			jwt({
				name: "jwt",
				secret: process.env.JWT_SECRET_KEY!,
				alg: "HS256",
				exp: "3d",
			}),
		)
		.decorate("chatgptService", new ChatGPTService())
		.derive(async ({ cookie, jwt }) => {
			if (cookie.accessToken) {
				try {
					const user = await jwt.verify(cookie.accessToken.value);
					// Ensure user is an object with id before returning
					if (user && typeof user === "object" && user.id) {
						return {
							isLoggedIn: true,
							user,
						};
					}
				} catch (err) {
					// Handle JWT verification error (e.g., expired token)
					console.error("JWT verification failed:", err);
				}
			}

			return {
				isLoggedIn: false,
				user: null, // Explicitly null when not logged in
			};
		})
		.macro({
			isLoggedIn(enabled: boolean) {
				if (!enabled) return;

				return {
					beforeHandle(s) {
						console.log("DEBUG: isLoggedIn macro", {
							user: s.user,
							isLoggedIn: s.isLoggedIn,
							cookie: s.cookie,
						});
						if (!s.user || !s.isLoggedIn) {
							return error(401, {
								success: false,
								message: "Unauthorized",
							});
						}
					},
				};
			},
		});
