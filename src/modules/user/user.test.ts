import { describe, it, expect, beforeAll, beforeEach } from "bun:test";

import {
	generateKeyPairSigner,
	signBytes,
	getUtf8Encoder,
	type KeyPairSigner,
	type SignatureBytes,
} from "@solana/kit";
import { treaty } from "@elysiajs/eden";
import bs58 from "bs58";

import { app } from "@/index";
import { client, dbschema } from "@/database";
import { buildMessage } from "@/utilities/message";

// Simplified Cookie Manager
function createCookieManager() {
	let cookie: string | null = null;

	function parseSetCookie(setCookieHeader: string | null): string | null {
		if (!setCookieHeader) return null;
		return setCookieHeader.split(";")[0] ?? null;
	}

	return {
		set: (response: Response | undefined) => {
			if (!response) return;
			const setCookieHeader = response.headers?.get("set-cookie");
			cookie = parseSetCookie(setCookieHeader) ?? cookie;
		},
		get: () => cookie,
		headerValue: () => (cookie ? { Cookie: cookie } : {}), // Return empty object if no cookie
	};
}

const api = treaty(app);

// --- Test Suite --- //
describe("User Controller", () => {
	let testKeys: KeyPairSigner;
	let testAddress: string;

	beforeAll(async () => {
		testKeys = await generateKeyPairSigner();
		testAddress = testKeys.address;
	});

	// Clean database before each test
	beforeEach(async () => {
		try {
			await dbschema.delete(dbschema.Challenge).run(client);
			await dbschema.delete(dbschema.User).run(client);
		} catch (e) {
			console.error("Error cleaning database:", e);
			throw e; // Fail test if cleanup fails
		}
	});

	// Helper to sign a message
	async function signTestMessage(message: string): Promise<string> {
		const messageBytes = getUtf8Encoder().encode(message);
		const signatureBytes: SignatureBytes = await signBytes(
			testKeys.keyPair.privateKey,
			messageBytes,
		);
		return bs58.encode(signatureBytes);
	}

	// --- Tests --- //

	it("GET /challenge should return a nonce and expiry and create DB entry", async () => {
		// Use the shared api client
		const { data, error, status } = await api.challenge.get();

		// Assert Response
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("nonce");
		expect(data).toHaveProperty("expiresAt");
		expect(typeof data?.nonce).toBe("string");
		expect(typeof data?.expiresAt).toBe("string");

		// Assert DB State
		// Use an if check to ensure data and data.nonce are defined
		if (data?.nonce) {
			const challenges = await dbschema
				.select(dbschema.Challenge, (c) => ({
					nonce: true,
					filter: dbschema.op(c.nonce, "=", data.nonce),
				}))
				.run(client);
			expect(challenges.length).toBe(1);
			expect(challenges[0]?.nonce).toBe(data.nonce);
		} else {
			// Fail the test if data or data.nonce is missing after a 200 OK
			// Suppress persistent linter warning for this line
			expect(data?.nonce).toBeDefined();
		}
	});

	it("POST /login should fail with invalid signature", async () => {
		// Use the shared api client
		const challengeRes = await api.challenge.get();
		expect(challengeRes.status).toBe(200);
		const challengeNonce = challengeRes.data?.nonce;
		expect(challengeNonce).toBeDefined();
		if (!challengeNonce) throw new Error("Challenge nonce not received");
		const message = buildMessage({
			nonce: challengeNonce,
			address: testAddress,
			expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
		});
		const invalidSignature = await signTestMessage("invalid message"); // Sign wrong message

		// Act
		const { data, error, status } = await api.login.post({
			address: testAddress,
			message: message,
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			nonce: challengeNonce!,
			signature: invalidSignature,
		});

		// Assert
		expect(status).toBe(401);
		expect(error?.value).toEqual({ message: "Invalid signature" });
	});

	it("POST /login should succeed with valid signature and nonce", async () => {
		// Use the shared api client
		const challengeRes = await api.challenge.get();
		expect(challengeRes.status).toBe(200);
		const challengeNonce = challengeRes.data?.nonce;
		expect(challengeNonce).toBeDefined();
		if (!challengeNonce) throw new Error("Challenge nonce not received");

		const message = buildMessage({
			nonce: challengeNonce,
			address: testAddress,
			expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
		});

		const validSignature = await signTestMessage(message); // Sign correct message

		// Act: Attempt login
		const { data, error, status, response, headers } = await api.login.post({
			address: testAddress,
			message: message,
			nonce: challengeNonce,
			signature: validSignature,
		});

		// Assert: Successful login
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toEqual({ message: "Logged in successfully" });

		// Assert: Cookie was set
		const setCookieHeader = (response.headers || headers).get("set-cookie");
		expect(setCookieHeader).toMatch(/accessToken=/); // Check if accessToken cookie is present
		expect(setCookieHeader).toMatch(/HttpOnly/i); // Good practice check

		// Assert: User created in DB (assuming property is 'wallet')
		const users = await dbschema
			.select(dbschema.User, (u) => ({
				wallet: true,
				filter: dbschema.op(u.wallet, "=", testAddress),
			}))
			.run(client);
		expect(users.length).toBe(1);
		expect(users[0]?.wallet).toBe(testAddress);
	});

	it("POST /login should fail if nonce is not found", async () => {
		// Use the shared api client
		const fakeNonce = "nonexistent-nonce-12345";
		const message = `Login request for nonce: ${fakeNonce}`;
		const signature = await signTestMessage(message);

		// Act: Attempt login
		const { data, error, status } = await api.login.post({
			address: testAddress,
			message: message,
			nonce: fakeNonce,
			signature: signature,
		});

		// Assert: Failed login with 401
		expect(status).toBe(401);
		// Assuming the service throws an error caught by the controller
		expect(error?.value.message).toBe("Challenge not found"); // Adjust if error message differs
	});

	it("POST /login should fail with cryptographically invalid signature", async () => {
		// Use the shared api client
		// No need for credentials: 'include' here
		const challengeRes = await api.challenge.get();
		expect(challengeRes.status).toBe(200);
		const challengeNonce = challengeRes.data?.nonce;
		expect(challengeNonce).toBeDefined();
		if (!challengeNonce) throw new Error("Challenge nonce not received");

		const message = buildMessage({
			nonce: challengeNonce,
			address: testAddress,
			expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
		});

		// Generate a second keypair
		const otherKeys = await generateKeyPairSigner();
		// Sign the message with the WRONG private key
		const messageBytes = getUtf8Encoder().encode(message);
		const wrongSignatureBytes: SignatureBytes = await signBytes(
			otherKeys.keyPair.privateKey, // Use different private key
			messageBytes,
		);
		const wrongSignature = bs58.encode(wrongSignatureBytes);

		// Act: Attempt login with the correct address but wrong signature
		const { data, error, status } = await api.login.post({
			address: testAddress, // Correct address
			message: message,
			nonce: challengeNonce,
			signature: wrongSignature, // Signature from different key
		});

		// Assert: Failed login with 401
		expect(status).toBe(401);
		// Assuming the service's crypto verification fails and throws
		expect(error?.value.message).toBe("Invalid signature"); // Adjust if error message differs
	});

	it("GET /me should fail if user is not logged in", async () => {
		// Use the shared api client
		const { data, error, status } = await api.me.get();

		// Assert: Unauthorized
		expect(status).toBe(401);
		// Elysia's default behavior for missing/invalid JWT might be 401 Unauthorized
		// The exact error value might depend on Elysia JWT plugin or custom hooks
		// expect(error?.value).toEqual({ message: "Unauthorized" }); // Or similar
	});

	it("GET /me should succeed if user is logged in", async () => {
		const cookieManager = createCookieManager();

		// 1. Get challenge
		const challengeRes = await api.challenge.get();
		const challengeNonce = challengeRes.data?.nonce;
		if (!challengeNonce) throw new Error("Nonce missing");
		const message = buildMessage({
			nonce: challengeNonce,
			address: testAddress,
			expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
		});
		const validSignature = await signTestMessage(message);

		// 2. Post login
		const loginRes = await api.login.post({
			address: testAddress,
			message: message,
			nonce: challengeNonce,
			signature: validSignature,
		});
		expect(loginRes.status).toBe(200);

		// 4. Manually extract and store cookie
		// Use type assertion to access response property if type inference is faulty
		// biome-ignore lint/suspicious/noExplicitAny: Bypassing potentially incorrect type inference
		cookieManager.set((loginRes as any).response);
		expect(cookieManager.get()).not.toBeNull();
		expect(cookieManager.get()).toMatch(/^accessToken=/);

		// 5. Act: Attempt to access /me, manually injecting the $headers
		const cookieHeader = cookieManager.headerValue();

		const { data, error, status } = await api.me.get({
			// Use $headers for edenTreaty
			headers: cookieHeader,
		});

		// Assert: Authorized and correct user data returned
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("wallet", testAddress);
	});

	// TODO: Add more tests...
});
