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
		headerValue: () => (cookie ? { Cookie: cookie } : {}), 
	};
}

const api = treaty(app);


describe("User Controller", () => {
	let testKeys: KeyPairSigner;
	let testAddress: string;

	beforeAll(async () => {
		testKeys = await generateKeyPairSigner();
		testAddress = testKeys.address;
	});

	
	beforeEach(async () => {
		try {
			await dbschema.delete(dbschema.Challenge).run(client);
			await dbschema.delete(dbschema.User).run(client);
		} catch (e) {
			console.error("Error cleaning database:", e);
			throw e; 
		}
	});

	
	async function signTestMessage(message: string): Promise<string> {
		const messageBytes = getUtf8Encoder().encode(message);
		const signatureBytes: SignatureBytes = await signBytes(
			testKeys.keyPair.privateKey,
			messageBytes,
		);
		return bs58.encode(signatureBytes);
	}

	

	it("GET /challenge should return a nonce and expiry and create DB entry", async () => {
		
		const { data, error, status } = await api.challenge.get();

		
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("nonce");
		expect(data).toHaveProperty("expiresAt");
		expect(typeof data?.nonce).toBe("string");
		expect(typeof data?.expiresAt).toBe("string");

		
		
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
			
			
			expect(data?.nonce).toBeDefined();
		}
	});

	it("POST /login should fail with invalid signature", async () => {
		
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
		const invalidSignature = await signTestMessage("invalid message"); 

		
		const { data, error, status } = await api.login.post({
			address: testAddress,
			message: message,
			
			nonce: challengeNonce!,
			signature: invalidSignature,
		});

		
		expect(status).toBe(401);
		expect(error?.value).toEqual({ message: "Invalid signature" });
	});

	it("POST /login should succeed with valid signature and nonce", async () => {
		
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

		const validSignature = await signTestMessage(message); 

		
		const { data, error, status, response, headers } = await api.login.post({
			address: testAddress,
			message: message,
			nonce: challengeNonce,
			signature: validSignature,
		});

		
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toEqual({ message: "Logged in successfully" });

		
		const setCookieHeader = (response.headers || headers).get("set-cookie");
		expect(setCookieHeader).toMatch(/accessToken=/); 
		expect(setCookieHeader).toMatch(/HttpOnly/i); 

		
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
		
		const fakeNonce = "nonexistent-nonce-12345";
		const message = `Login request for nonce: ${fakeNonce}`;
		const signature = await signTestMessage(message);

		
		const { data, error, status } = await api.login.post({
			address: testAddress,
			message: message,
			nonce: fakeNonce,
			signature: signature,
		});

		
		expect(status).toBe(401);
		
		expect(error?.value.message).toBe("Challenge not found"); 
	});

	it("POST /login should fail with cryptographically invalid signature", async () => {
		
		
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

		
		const otherKeys = await generateKeyPairSigner();
		
		const messageBytes = getUtf8Encoder().encode(message);
		const wrongSignatureBytes: SignatureBytes = await signBytes(
			otherKeys.keyPair.privateKey, 
			messageBytes,
		);
		const wrongSignature = bs58.encode(wrongSignatureBytes);

		
		const { data, error, status } = await api.login.post({
			address: testAddress, 
			message: message,
			nonce: challengeNonce,
			signature: wrongSignature, 
		});

		
		expect(status).toBe(401);
		
		expect(error?.value.message).toBe("Invalid signature"); 
	});

	it("GET /me should fail if user is not logged in", async () => {
		
		const { data, error, status } = await api.me.get();

		
		expect(status).toBe(401);
		
		
		
	});

	it("GET /me should succeed if user is logged in", async () => {
		const cookieManager = createCookieManager();

		
		const challengeRes = await api.challenge.get();
		const challengeNonce = challengeRes.data?.nonce;
		if (!challengeNonce) throw new Error("Nonce missing");
		const message = buildMessage({
			nonce: challengeNonce,
			address: testAddress,
			expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
		});
		const validSignature = await signTestMessage(message);

		
		const loginRes = await api.login.post({
			address: testAddress,
			message: message,
			nonce: challengeNonce,
			signature: validSignature,
		});
		expect(loginRes.status).toBe(200);

		
		
		
		cookieManager.set((loginRes as any).response);
		expect(cookieManager.get()).not.toBeNull();
		expect(cookieManager.get()).toMatch(/^accessToken=/);

		
		const cookieHeader = cookieManager.headerValue();

		const { data, error, status } = await api.me.get({
			
			headers: cookieHeader,
		});

		
		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("wallet", testAddress);
	});

	
});
