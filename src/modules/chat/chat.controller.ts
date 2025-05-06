import Elysia, { error, t } from "elysia";
import {
	chatgptService,
	type ChatGPTServiceInstance,
	ChatGPTService,
} from "./chat.service";
import { chatgptModel, messagesArraySchema } from "./chat.model";

// Define the user type
type AuthUser = {
	id: string;
	[key: string]: any;
};

export const chatgptController = new Elysia()
	.use(chatgptModel)
	.use(chatgptService)
	.group("/conversations", (app) =>
		app
			.get(
				"/",
				async ({ chatgptService, user, cookie, isLoggedIn }) => {
					console.log("DEBUG: /conversations GET", {
						cookie,
						user,
						isLoggedIn,
					});
					try {
						// We can safely assert user is of type AuthUser when isLoggedIn is true
						return await chatgptService.getConversations((user as AuthUser).id);
					} catch (e) {
						return error(500, { message: (e as Error).message });
					}
				},
				{
					isLoggedIn: true,
					response: {
						200: "chat.conversation.list",
						401: t.Object({ message: t.String() }),
						500: t.Object({ message: t.String() }),
					},
				},
			)
			.post(
				"/",
				async ({ chatgptService, user, cookie, isLoggedIn }) => {
					console.log("DEBUG: /conversations POST", {
						cookie,
						user,
						isLoggedIn,
					});
					try {
						return await chatgptService.createConversation(
							(user as AuthUser).id,
						);
					} catch (e) {
						return error(500, { message: (e as Error).message });
					}
				},
				{
					isLoggedIn: true,
					response: {
						200: t.Object({
							id: t.String(),
							created_at: t.Date(),
						}),
						401: t.Object({ message: t.String() }),
						500: t.Object({ message: t.String() }),
					},
				},
			),
	)
	.group("/conversation/:id", (app) =>
		app
			.get(
				"/",
				async ({ chatgptService, user, params }) => {
					try {
						return await chatgptService.getConversation(
							params.id,
							(user as AuthUser).id,
						);
					} catch (e) {
						if ((e as Error).message === "Conversation not found") {
							return error(404, { message: (e as Error).message });
						}
						return error(500, { message: (e as Error).message });
					}
				},
				{
					isLoggedIn: true,
					response: {
						200: "chat.conversation",
						401: t.Object({ message: t.String() }),
						404: t.Object({ message: t.String() }),
						500: t.Object({ message: t.String() }),
					},
				},
			)
			.get(
				"/messages",
				async ({ chatgptService, user, params }) => {
					console.log("DEBUG: GET /conversation/:id/messages handler called");
					try {
						const conversation = await chatgptService.getConversation(
							params.id,
							(user as AuthUser).id,
						);
						return conversation.messages || [];
					} catch (e) {
						if ((e as Error).message === "Conversation not found") {
							return error(404, { message: (e as Error).message });
						}
						return error(500, { message: (e as Error).message });
					}
				},
				{
					isLoggedIn: true,
					response: {
						200: messagesArraySchema, // Use the imported schema directly
						401: t.Object({ message: t.String() }),
						404: t.Object({ message: t.String() }),
						500: t.Object({ message: t.String() }),
					},
				},
			)
			.post(
				"/messages",
				async function* ({
					chatgptService,
					user,
					params,
					body,
					set,
				}: {
					chatgptService: ChatGPTService;
					user: any;
					params: { id: string };
					body: { content: string };
					set: { status: number; headers: Record<string, string> };
				}) {
					let fullAiResponse = "";
					let streamStarted = false;
					try {
						const conversationId = params.id;
						const userMessageContent = body.content;
						const userId = (user as AuthUser).id;

						await chatgptService.addMessage(
							conversationId,
							userId,
							userMessageContent,
						);

						const stream = await chatgptService.generateAIResponseStream(
							conversationId,
							userId,
							userMessageContent,
						);

						set.headers["Content-Type"] = "text/plain; charset=utf-8";

						for await (const chunk of stream) {
							streamStarted = true;
							const contentChunk = chunk.response;
							yield contentChunk;
							fullAiResponse += contentChunk;
						}

						if (fullAiResponse.trim()) {
							await chatgptService.saveAIMessage(
								conversationId,
								fullAiResponse.trim(),
							);
						}
					} catch (e: unknown) {
						console.error("Streaming Error:", e);
						let statusCode: number = 500;
						let errorMessage =
							e instanceof Error
								? e.message
								: "An internal error occurred during streaming.";

						if (e instanceof Error && e.message === "Conversation not found") {
							statusCode = 404;
						}

						// Set the status code on the response
						set.status = statusCode;

						if (!streamStarted) {
							yield JSON.stringify(
								error(statusCode, { message: errorMessage }),
							);
						} else {
							console.error(
								`Error after stream started: ${errorMessage}. Client connection likely closed.`,
							);
						}
					}
				},
				{
					isLoggedIn: true,
					body: "chat.message.create",
				},
			),
	);
