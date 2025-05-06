import {
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterEach,
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
		headerValue: () => (cookie ? { Cookie: cookie } : {}),
	};
}

// Initialize API client with the full app
const api = treaty(app);

describe("Chat Controller", () => {
	let testKeys: KeyPairSigner;
	let testAddress: string;
	let cookieManager: ReturnType<typeof createCookieManager>;
	let userId: string;
	let conversationId: string;

	// Set up test user before all tests
	beforeAll(async () => {
		testKeys = await generateKeyPairSigner();
		testAddress = testKeys.address;
		cookieManager = createCookieManager();
	});

	// Clean database and create a test user before each test
	beforeEach(async () => {
		// Clear terminal output before each test to reduce tokens

		try {
			// Clean up from previous tests
			await dbschema.delete(dbschema.Message).run(client);
			await dbschema.delete(dbschema.Conversation).run(client);
			await dbschema.delete(dbschema.Challenge).run(client);
			await dbschema.delete(dbschema.User).run(client);

			// Login to create a user and get auth cookie
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

			// Get user ID for later tests
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

	// Helper to sign a message
	async function signTestMessage(message: string): Promise<string> {
		const messageBytes = getUtf8Encoder().encode(message);
		const signatureBytes = await signBytes(
			testKeys.keyPair.privateKey,
			messageBytes,
		);
		return bs58.encode(signatureBytes);
	}

	// --- Tests --- //

	it("POST /conversations should create a new conversation", async () => {
		// @ts-ignore - Eden API methods might have typing issues with treaty
		const { data, error, status } = await api.conversations.post(
			{},
			{
				headers: cookieManager.headerValue(),
			},
		);

		expect(status).toBe(200);
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(data).toHaveProperty("id");
		expect(data).toHaveProperty("created_at");

		// Store conversation ID for other tests
		conversationId = data?.id;

		// Verify conversation in database
		const conversations = await dbschema
			.select(dbschema.Conversation, (c) => ({
				id: true,
				owner: { id: true },
				filter: dbschema.op(
					c.id,
					"=",
					dbschema.cast(dbschema.uuid, dbschema.str(data?.id ?? "")),
				),
			}))
			.run(client);

		expect(conversations.length).toBe(1);
		expect(conversations[0]?.id).toBe(data?.id);
		expect(conversations[0]?.owner?.id).toBe(userId);
	});

	it("GET /conversations should return user's conversations", async () => {
		// Create a conversation first
		// @ts-ignore
		const createRes = await api.conversations.post(
			{},
			{
				headers: cookieManager.headerValue(),
			},
		);
		expect(createRes.status).toBe(200);
		expect(createRes.data?.id).toBeDefined();
		if (!createRes.data?.id)
			throw new Error("Conversation ID not created in test setup");

		// Get conversations
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
		// Create a conversation first
		// @ts-ignore
		const createRes = await api.conversations.post(
			{},
			{
				headers: cookieManager.headerValue(),
			},
		);
		const conversationId = createRes.data?.id;
		expect(createRes.status).toBe(200);
		expect(conversationId).toBeDefined();
		if (!conversationId)
			throw new Error("Conversation ID not created in test setup");

		// Get the conversation
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
		const nonExistentId = "00000000-0000-0000-0000-000000000000"; // Use UUID format
		// @ts-ignore
		const { data, error, status } = await api.conversation[nonExistentId].get({
			headers: cookieManager.headerValue(),
		});

		expect(status).toBe(404);
		expect(error?.value).toEqual({ message: "Conversation not found" });
	});

	it("GET /conversation/:id/messages should return conversation messages", async () => {
		// Create a conversation first
		// @ts-ignore
		const createRes = await api.conversations.post(
			{},
			{
				headers: cookieManager.headerValue(),
			},
		);
		const conversationId = createRes.data?.id;
		expect(createRes.status).toBe(200);
		expect(conversationId).toBeDefined();
		if (!conversationId)
			throw new Error("Conversation ID not created in test setup");

		// Get messages
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
		// Initially there should be no messages
		expect(data?.length).toBe(0);
	});

	it(
		"POST /conversation/:id/messages should add a message and return response",
		async () => {
			// Create a conversation first
			// @ts-ignore
			const createRes = await api.conversations.post(
				{},
				{
					headers: cookieManager.headerValue(),
				},
			);
			const conversationId = createRes.data?.id;
			expect(createRes.status).toBe(200);
			expect(conversationId).toBeDefined();
			if (!conversationId)
				throw new Error("Conversation ID not created in test setup");

			// This test is for streaming API, so we'll need to handle it differently
			// We'll use app.handle instead of fetch since edenTreaty doesn't handle streaming well
			const request = new Request(
				`http://localhost/conversation/${conversationId}/messages`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: cookieManager.get() || "",
					},
					body: JSON.stringify({ content: "Hello AI, this is a test message" }),
				},
			);
			const response = await app.handle(request);

			expect(response.status).toBe(200);
			// The Content-Type header can include both text/plain and text/event-stream for streaming responses
			expect(response.headers.get("Content-Type")).toContain(
				"text/plain; charset=utf-8",
			);

			// Read the stream with timeout protection
			const reader = response.body?.getReader();
			let receivedText = "";

			if (reader) {
				let done = false;
				const startTime = Date.now();
				const MAX_STREAM_TIME = 25000; // 25 second timeout for stream reading (less than the 30s test timeout)

				while (!done) {
					// Add timeout check to prevent infinite loops
					if (Date.now() - startTime > MAX_STREAM_TIME) {
						console.log("Stream reading timed out after 25 seconds");
						break;
					}

					const result = await reader.read();
					done = result.done;
					if (result.value) {
						receivedText += new TextDecoder().decode(result.value);
					}
				}
			}

			// We expect some text response
			expect(receivedText.length).toBeGreaterThan(0);

			// Check that messages were saved to DB
			// @ts-ignore
			const messagesRes = await api.conversation[conversationId].get({
				headers: cookieManager.headerValue(),
			});

			expect(messagesRes.status).toBe(200);
			expect(messagesRes.data?.messages?.length).toBe(2); // User message + AI response

			const messages = messagesRes.data?.messages || [];
			expect(messages[0].message_type).toBe("user");
			expect(messages[0].content).toBe("Hello AI, this is a test message");
			expect(messages[1].message_type).toBe("ai");
		},
		{ timeout: 25000 },
	);

	it("POST /conversation/:id/messages should fail with 401 if not authenticated", async () => {
		// Create a conversation first (authenticated)
		// @ts-ignore
		const createRes = await api.conversations.post(
			{},
			{
				headers: cookieManager.headerValue(),
			},
		);
		const conversationId = createRes.data?.id;
		expect(createRes.status).toBe(200);
		expect(conversationId).toBeDefined();
		if (!conversationId)
			throw new Error("Conversation ID not created in test setup");

		// Try to post a message without authentication
		const request = new Request(
			`http://localhost/conversation/${conversationId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ content: "This should fail" }),
			},
		);
		const response = await app.handle(request);

		expect(response.status).toBe(401);
	});

	it("POST /conversation/:id/messages should fail with 404 for non-existent conversation", async () => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000"; // Use UUID format

		const request = new Request(
			`http://localhost/conversation/${nonExistentId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: cookieManager.get() || "",
				},
				body: JSON.stringify({ content: "This should fail" }),
			},
		);
		const response = await app.handle(request);

		expect(response.status).toBe(404);

		const errorText = await response.text();
		expect(errorText).toContain("Conversation not found");
	});

	it(
		"Full cycle: create conversation → add message → get response → verify",
		async () => {
			// 1. Create conversation
			// @ts-ignore
			const createRes = await api.conversations.post(
				{},
				{
					headers: cookieManager.headerValue(),
				},
			);
			expect(createRes.status).toBe(200);
			const conversationId = createRes.data?.id;
			expect(conversationId).toBeDefined();
			if (!conversationId) throw new Error("Conversation ID not created");

			// 2. Add message and get streaming response
			const request = new Request(
				`http://localhost/conversation/${conversationId}/messages`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: cookieManager.get() || "",
					},
					body: JSON.stringify({ content: "Hello AI, test full cycle" }),
				},
			);
			const response = await app.handle(request);
			expect(response.status).toBe(200);

			// Read stream with timeout protection
			const reader = response.body?.getReader();
			let aiResponse = "";
			if (reader) {
				let done = false;
				const startTime = Date.now();
				const MAX_STREAM_TIME = 25000; // 25 second timeout for stream reading

				while (!done) {
					// Add timeout check to prevent infinite loops
					if (Date.now() - startTime > MAX_STREAM_TIME) {
						console.log("Stream reading timed out after 25 seconds");
						break;
					}

					const result = await reader.read();
					done = result.done;
					if (result.value) {
						aiResponse += new TextDecoder().decode(result.value);
					}
				}
			}
			expect(aiResponse.length).toBeGreaterThan(0);

			// 3. Verify conversation state
			// @ts-ignore
			const convRes = await api.conversation[conversationId].get({
				headers: cookieManager.headerValue(),
			});
			expect(convRes.status).toBe(200);
			expect(convRes.data?.messages?.length).toBe(2); // User + AI messages

			const messages = convRes.data?.messages || [];
			expect(messages[0].message_type).toBe("user");
			expect(messages[0].content).toBe("Hello AI, test full cycle");
			expect(messages[1].message_type).toBe("ai");
			expect(messages[1].content).toBe(aiResponse.trim());
		},
		{ timeout: 25000 },
	);

	it(
		"Multiple message exchange",
		async () => {
			// 1. Create conversation
			// @ts-ignore
			const createRes = await api.conversations.post(
				{},
				{
					headers: cookieManager.headerValue(),
				},
			);
			const conversationId = createRes.data?.id;
			expect(createRes.status).toBe(200);
			expect(conversationId).toBeDefined();
			if (!conversationId) throw new Error("Conversation ID not created");

			// 2. First message exchange
			const firstRequest = new Request(
				`http://localhost/conversation/${conversationId}/messages`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: cookieManager.get() || "",
					},
					body: JSON.stringify({ content: "First message" }),
				},
			);
			const firstResponse = await app.handle(firstRequest);
			expect(firstResponse.status).toBe(200);

			// Read first response with timeout protection
			let firstAiResponse = "";
			const firstReader = firstResponse.body?.getReader();
			if (firstReader) {
				let done = false;
				const startTime = Date.now();
				const MAX_STREAM_TIME = 25000; // 25 second timeout for stream reading

				while (!done) {
					// Add timeout check to prevent infinite loops
					if (Date.now() - startTime > MAX_STREAM_TIME) {
						console.log("First stream reading timed out after 25 seconds");
						break;
					}

					const result = await firstReader.read();
					done = result.done;
					if (result.value) {
						firstAiResponse += new TextDecoder().decode(result.value);
					}
				}
			}

			// 3. Second message exchange
			const secondRequest = new Request(
				`http://localhost/conversation/${conversationId}/messages`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Cookie: cookieManager.get() || "",
					},
					body: JSON.stringify({ content: "Follow up question" }),
				},
			);
			const secondResponse = await app.handle(secondRequest);
			expect(secondResponse.status).toBe(200);

			// Read second response with timeout protection
			let secondAiResponse = "";
			const secondReader = secondResponse.body?.getReader();
			if (secondReader) {
				let done = false;
				const startTime = Date.now();
				const MAX_STREAM_TIME = 25000; // 25 second timeout for stream reading

				while (!done) {
					// Add timeout check to prevent infinite loops
					if (Date.now() - startTime > MAX_STREAM_TIME) {
						console.log("Second stream reading timed out after 25 seconds");
						break;
					}

					const result = await secondReader.read();
					done = result.done;
					if (result.value) {
						secondAiResponse += new TextDecoder().decode(result.value);
					}
				}
			}

			// 4. Verify conversation has all messages
			// @ts-ignore
			const convRes = await api.conversation[conversationId].get({
				headers: cookieManager.headerValue(),
			});
			expect(convRes.status).toBe(200);
			expect(convRes.data?.messages?.length).toBe(4); // 2 user + 2 AI messages

			const messages = convRes.data?.messages || [];
			expect(messages[0].content).toBe("First message");
			expect(messages[1].content).toBe(firstAiResponse.trim());
			expect(messages[2].content).toBe("Follow up question");
			expect(messages[3].content).toBe(secondAiResponse.trim());
		},
		{ timeout: 25000 },
	);
});
