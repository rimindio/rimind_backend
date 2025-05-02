import Elysia, { error } from "elysia";
import { userService } from "./user.service";
import { t } from "elysia";

export const userController = new Elysia()
	.use(userService)
	.get("/challenge", ({ userService }) => userService.getChallenge(), {
		response: "user.challenge.response",
	})
	.post(
		"/login",
		async ({ jwt, cookie: { accessToken }, body, userService }) => {
			let user: { id: string; wallet: string } | undefined | null = null;

			try {
				user = await userService.verifyAndAuthenticate(
					body.address,
					body.message,
					body.nonce,
					body.signature,
				);
			} catch (e) {
				return error(401, { message: (e as Error).message });
			}

			if (!user) {
				return error(401, { message: "Invalid data" });
			}

			const token = await jwt.sign({
				id: user.id,
				wallet: user.wallet,
			});

			accessToken?.set({
				value: token,
				httpOnly: true,
				path: "/",
				secure: process.env.NODE_ENV === "production",
			});

			return {
				message: "Logged in successfully",
			};
		},
		{
			body: "user.login.request",
			response: {
				200: "user.login.response",
				401: t.Object({ message: t.String() }),
			},
		},
	)
	.get("/me", ({ user }) => user, { isLoggedIn: true });
