import Elysia, { t } from "elysia";

export const chatModel = () =>
	new Elysia({ name: "chat/model" })
		.model(
			"chat.message",
			t.Object({
				id: t.String(),
				content: t.String(),
				created_at: t.Date(),
				message_type: t.Union([t.Literal("user"), t.Literal("ai")]),
			}),
		)
		.model(
			"chat.conversation",
			t.Object({
				id: t.String(),
				created_at: t.Date(),
				messages: t.Array(t.Ref("chat.message")),
			}),
		)
		.model(
			"chat.conversation.list",
			t.Array(
				t.Object({
					id: t.String(),
					created_at: t.Date(),
				}),
			),
		)
		.model(
			"chat.message.create",
			t.Object({
				content: t.String(),
			}),
		);
