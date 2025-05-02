import Elysia, { t } from "elysia";

export const userModel = () =>
	new Elysia({ name: "user/model" })
		.model(
			"user.challenge.response",
			t.Object({ nonce: t.String(), expiresAt: t.Date() }),
		)
		.model(
			"user.login.request",
			t.Object({
				address: t.String(),
				message: t.String(),
				signature: t.String(),
				nonce: t.String(),
			}),
		)
		.model("user.login.response", t.Object({ message: t.String() }));
