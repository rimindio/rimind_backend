import Elysia, { error } from "elysia";
import { client, dbschema } from "@/database";
import { chatModel } from "./chat.model";
import { jwt } from "@elysiajs/jwt";
import { OpenAI } from "@llamaindex/openai";
import type { ChatMessage } from "@llamaindex/core/llms";
import { ChatMemoryBuffer } from "@llamaindex/core/memory";
import { SimpleChatEngine } from "@llamaindex/core/chat-engine";
import { uuid as $uuid } from "@/../dbschema/edgeql-js/modules/std";

export class ChatService {
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
		const [conversation] = await dbschema
			.select(dbschema.Conversation, (conversation) => ({
				id: true,
				created_at: true,
				messages: {
					id: true,
					content: true,
					created_at: true,
					message_type: true,
					order_by: {
						expression: dbschema.Message.created_at,
						direction: "ASC",
					},
				},
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

		return conversation;
	}

	async addMessage(conversationId: string, userId: string, content: string) {
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

		return {
			id: userMessage.id,
			content: userMessage.content,
			created_at: userMessage.created_at,
			message_type: userMessage.message_type,
		};
	}

	async saveAIMessage(conversationId: string, content: string) {
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

	async generateAIResponseStream(
		conversationId: string,
		userId: string,
		userMessageContent: string,
	) {
		const conversation = await this.getConversation(conversationId, userId);
		if (!conversation) {
			throw new Error("Conversation not found");
		}

		const history: ChatMessage[] = conversation.messages.map((msg) => ({
			content: msg.content,
			role: msg.message_type === "user" ? "user" : "assistant",
		}));

		const llm = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
			model: "gpt-4o-mini",
		});

		const chatHistory = new ChatMemoryBuffer({ chatHistory: history });
		const chatEngine = new SimpleChatEngine({
			llm,
			memory: chatHistory,
		});

		return chatEngine.chat({ message: userMessageContent, stream: true });
	}
}

export type ChatServiceInstance = ReturnType<typeof chatService>;

export const chatService = () =>
	new Elysia({ name: "chat/service" })
		.use(chatModel)
		.use(
			jwt({
				name: "jwt",
				secret: process.env.JWT_SECRET_KEY!,
				alg: "HS256",
				exp: "3d",
			}),
		)
		.decorate("chatService", new ChatService())
		.derive(async ({ cookie, jwt }) => {
			if (cookie.accessToken) {
				try {
					const user = await jwt.verify(cookie.accessToken.value);
					if (user && typeof user === "object" && user.id) {
						return {
							isLoggedIn: true,
							user,
						};
					}
				} catch (err) {
					console.error("JWT verification failed:", err);
				}
			}

			return {
				isLoggedIn: false,
				user: null,
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
