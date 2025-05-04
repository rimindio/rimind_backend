import {
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterEach,
	mock,
} from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "@/index";
import { client, dbschema } from "@/database";
import {
	generateKeyPairSigner,
	signBytes,
	getUtf8Encoder,
	type KeyPairSigner,
} from "@solana/kit";
import bs58 from "bs58";
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

describe("Chat Controller", () => {
	let testKeys: KeyPairSigner;
	let testAddress: string;
	let cookieManager: ReturnType<typeof createCookieManager>;
	let userId: string;
	let conversationId: string;

	beforeAll(async () => {
		testKeys = await generateKeyPairSigner();
		testAddress = testKeys.address;
		cookieManager = createCookieManager();
	});

	beforeEach(async () => {
		try {
			await dbschema.delete(dbschema.Message).run(client);
			await dbschema.delete(dbschema.Conversation).run(client);
			await dbschema.delete(dbschema.Challenge).run(client);
			await dbschema.delete(dbschema.User).run(client);

			const challengeRes = await api.challenge.get();
			const challengeNonce = challengeRes.data?.nonce;
			if (!challengeNonce) throw new Error("Nonce missing");

			const message = buildMessage({
				nonce: challengeNonce,
				address: testAddress,
				expiresAt: (challengeRes.data?.expiresAt as unknown as string) ?? "",
			});

			const signature = await signTestMessage(message);

			const loginRes = await api.login.post({
				address: testAddress,
				message: message,
				nonce: challengeNonce,
				signature: signature,
			});

			console.log("DEBUG: loginRes.status", loginRes.status);
			console.log(
				"DEBUG: loginRes.response.headers",
				(loginRes as any).response?.headers?.get("set-cookie"),
			);

			cookieManager.set((loginRes as any).response);

			const meRes = await api.me.get({
				headers: cookieManager.headerValue(),
			});
			console.log("DEBUG: meRes.status", meRes.status);
			console.log("DEBUG: meRes.data", meRes.data);
			if (meRes.data && typeof meRes.data === "object" && "id" in meRes.data) {
				userId = meRes.data.id as string;
			} else {
				throw new Error("Failed to get user ID");
			}
		} catch (e) {
			console.error("Error in test setup:", e);
			throw e;
		}
	});

	async function signTestMessage(message: string): Promise<string> {
		const messageBytes = getUtf8Encoder().encode(message);
		const signatureBytes = await signBytes(
			testKeys.keyPair.privateKey,
			messageBytes,
		);
		return bs58.encode(signatureBytes);
	}

	it("POST /conversations should create a new conversation", async () => {
		const { data, error, status } = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("created_at");

		conversationId = data?.id;

		const conversations = await dbschema
			.select(dbschema.Conversation, (c) => ({
				id: true,
				owner: { id: true },
				filter: dbschema.op(c.id, "=", data?.id),
			}))
			.run(client);

		expect(conversations.length).toBe(1);
		expect(conversations[0]?.id).toBe(data?.id);
		expect(conversations[0]?.owner?.id).toBe(userId);
	});

	it("GET /conversations should return user's conversations", async () => {
		// @ts-ignore
		const createRes = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});
		expect(createRes.status).toBe(200);

		// @ts-ignore
		const { data, error, status } = await api.conversations.get({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(Array.isArray(data)).toBe(true);
		expect(data?.length).toBeGreaterThanOrEqual(1);

		const conversation = data?.[0];
		expect(conversation).toHaveProperty("id");
		expect(conversation).toHaveProperty("created_at");
	});

	it("GET /conversation/:id should return a specific conversation", async () => {
		// @ts-ignore
		const createRes = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});
		const conversationId = createRes.data?.id;
		expect(conversationId).toBeDefined();

		// @ts-ignore
		const { data, error, status } = await api.conversation[conversationId].get({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("id", conversationId);
		expect(data).toHaveProperty("created_at");
		expect(data).toHaveProperty("messages");
		expect(Array.isArray(data?.messages)).toBe(true);
	});

	it("GET /conversation/:id should return 404 for non-existent conversation", async () => {
		const nonExistentId = "non-existent-id";
		// @ts-ignore
		const { data, error, status } = await api.conversation[nonExistentId].get({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(404);
		expect(error?.value).toEqual({ message: "Conversation not found" });
	});

	it("GET /conversation/:id/messages should return conversation messages", async () => {
		// @ts-ignore
		const createRes = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});
		const conversationId = createRes.data?.id;
		expect(conversationId).toBeDefined();

		// @ts-ignore
		const { data, error, status } = await api.conversation[
			conversationId
		].messages.get({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(Array.isArray(data)).toBe(true);

		expect(data?.length).toBe(0);
	});

	it("POST /conversation/:id/messages should add a message and return response", async () => {
		// @ts-ignore
		const createRes = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});
		const conversationId = createRes.data?.id;
		expect(conversationId).toBeDefined();

		const response = await fetch(
			`http://localhost:3000/conversation/${conversationId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookieManager.get() || "",
				},
				body: JSON.stringify({ content: "Hello AI, this is a test message" }),
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8",
		);

		const reader = response.body?.getReader();
		let receivedText = "";

		if (reader) {
			let done = false;
			while (!done) {
				const result = await reader.read();
				done = result.done;
				if (result.value) {
					receivedText += new TextDecoder().decode(result.value);
				}
			}
		}

		expect(receivedText.length).toBeGreaterThan(0);

		// @ts-ignore
		const messagesRes = await api.conversation[conversationId].messages.get({
			headers: cookieManager.headerValue(),
		});

		expect(messagesRes.status).toBe(200);
		expect(messagesRes.data?.length).toBe(2);

		const messages = messagesRes.data || [];
		expect(messages[0].message_type).toBe("user");
		expect(messages[0].content).toBe("Hello AI, this is a test message");
		expect(messages[1].message_type).toBe("ai");
	});

	it("POST /conversation/:id/messages should fail with 401 if not authenticated", async () => {
		// @ts-ignore
		const createRes = await api.conversations.post({
			headers: cookieManager.headerValue(),
		});
		const conversationId = createRes.data?.id;
		expect(conversationId).toBeDefined();

		const response = await fetch(
			`http://localhost:3000/conversation/${conversationId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content: "This should fail" }),
			},
		);

		expect(response.status).toBe(401);
	});

	it("POST /conversation/:id/messages should fail with 404 for non-existent conversation", async () => {
		const nonExistentId = "non-existent-id";

		const response = await fetch(
			`http://localhost:3000/conversation/${nonExistentId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookieManager.get() || "",
				},
				body: JSON.stringify({ content: "This should fail" }),
			},
		);

		expect(response.status).toBe(404);

		const errorText = await response.text();
		expect(errorText).toContain("Conversation not found");
	});
});
