import Elysia, { error, t } from "elysia";
import {
	chatService,
	type ChatServiceInstance,
	ChatService,
} from "./chat.service";
import { chatModel } from "./chat.model";

// Define the user type
type AuthUser = {
	id: string;
	[key: string]: any;
};

export const chatController = new Elysia()
	.use(chatModel)
	.use(chatService)
	.group("/conversations", (app) =>
		app
			.get(
				"/",
				async ({ chatService, user, cookie, isLoggedIn }) => {
					console.log("DEBUG: /conversations GET", {
						cookie,
						user,
						isLoggedIn,
					});
					try {
						return await chatService.getConversations((user as AuthUser).id);
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
				async ({ chatService, user, cookie, isLoggedIn }) => {
					console.log("DEBUG: /conversations POST", {
						cookie,
						user,
						isLoggedIn,
					});
					try {
						return await chatService.createConversation(
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
				async ({ chatService, user, params }) => {
					try {
						return await chatService.getConversation(
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
				async ({ chatService, user, params }) => {
					try {
						const conversation = await chatService.getConversation(
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
						200: t.Array(t.Ref("chat.message")),
						401: t.Object({ message: t.String() }),
						404: t.Object({ message: t.String() }),
						500: t.Object({ message: t.String() }),
					},
				},
			)
			.post(
				"/messages",
				async function* ({
					chatService,
					user,
					params,
					body,
					set,
				}: {
					chatService: ChatService;
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

						await chatService.addMessage(
							conversationId,
							userId,
							userMessageContent,
						);

						const stream = await chatService.generateAIResponseStream(
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
							await chatService.saveAIMessage(
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
