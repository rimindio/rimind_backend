import Elysia, { error } from "elysia";
import { client, dbschema } from "@/database";
import { userModel } from "./user.model";
import { validateSignature } from "@/utilities/wallet";
import { jwt } from "@elysiajs/jwt";
import { parseMessage } from "@/utilities/message";

export class UserService {
	async getChallenge() {
		const nonce = crypto.randomUUID();
		const expiresAt = new Date(Date.now() + 1000 * 60 * 5);

		await dbschema
			.insert(dbschema.Challenge, {
				expires_at: expiresAt,
				nonce,
			})
			.run(client);

		return { nonce, expiresAt };
	}

	async findUser(address: string) {
		const [user] = await dbschema
			.select(dbschema.User, (user) => ({
				wallet: true,
				id: true,
				filter: dbschema.op(user.wallet, "=", address),
			}))
			.run(client);

		return user;
	}

	async verifyAndAuthenticate(
		address: string,
		message: string,
		nonce: string,
		signature: string,
	) {
		const [challenge] = await dbschema
			.select(dbschema.Challenge, (challenge) => ({
				nonce: true,
				expires_at: true,
				limit: 1,
				filter: dbschema.op(challenge.nonce, "=", nonce),
			}))
			.run(client);

		if (!challenge) {
			throw new Error("Challenge not found");
		}

		if (challenge.expires_at < new Date()) {
			throw new Error("Challenge expired");
		}

		const parsedMessage = parseMessage<{
			nonce?: string;
			address?: string;
			expiresAt?: string;
		}>(message);

		if (!parsedMessage.nonce || parsedMessage.nonce !== nonce) {
			throw new Error("Invalid nonce");
		}

		if (!parsedMessage.address || parsedMessage.address !== address) {
			throw new Error("Invalid address");
		}

		if (
			!parsedMessage.expiresAt ||
			parsedMessage.expiresAt < new Date().toISOString()
		) {
			throw new Error("Challenge expired");
		}

		const isValid = await validateSignature(address, message, signature);

		if (isValid) {
			let user = await this.findUser(address);

			if (!user) {
				await dbschema
					.insert(dbschema.User, {
						wallet: address,
					})
					.run(client);

				user = await this.findUser(address);
			}

			return user;
		}

		throw new Error("Invalid signature");
	}
}

export const userService = () =>
	new Elysia({ name: "user/service" })
		.use(userModel)
		.use(
			jwt({
				name: "jwt",
				
				secret: process.env.JWT_SECRET_KEY!,
				alg: "HS256",
				exp: "3d",
			}),
		)
		.decorate("userService", new UserService())
		.derive(async ({ cookie, jwt }) => {
			if (cookie.accessToken) {
				const user = await jwt.verify(cookie.accessToken.value);

				return {
					isLoggedIn: true,
					user,
				};
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
