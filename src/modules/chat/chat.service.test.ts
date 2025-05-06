import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { client, dbschema } from "@/database";
import { generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { type ChatGPTService } from "./chat.service";
import { uuid as $uuid } from "@/../dbschema/edgeql-js/modules/std";
import { app } from "@/index";

// Define message types for better typing
interface Message {
	id: string;
	content: string;
	created_at: Date;
	message_type: "user" | "ai";
}

if (!process.env.OPENAI_API_KEY) {
	console.warn("OPENAI_API_KEY is not defined");
}

describe("Chat Service - Integration Tests", () => {
	let testKeys: KeyPairSigner;
	let testAddress: string;
	let userId: string;
	let chatgptService: ChatGPTService;

	// Set up the user before all tests
	beforeAll(async () => {
		testKeys = await generateKeyPairSigner();
		testAddress = testKeys.address;
		chatgptService = app.decorator.chatgptService;
	});

	// Clear the database and create a test user before each test
	beforeEach(async () => {
		try {
			// Cleanup from previous tests
			await dbschema.delete(dbschema.Message).run(client);
			await dbschema.delete(dbschema.Conversation).run(client);
			await dbschema.delete(dbschema.Challenge).run(client);
			await dbschema.delete(dbschema.User).run(client);

			// Create a test user directly in the database
			const user = await dbschema
				.select(
					dbschema.insert(dbschema.User, {
						wallet: testAddress,
					}),
					(user) => ({
						id: true,
					}),
				)
				.run(client);

			userId = user.id;
		} catch (e) {
			console.error("Error in test setup:", e);
			throw e;
		}
	});

	// --- Tests --- //

	it("createConversation should create a new conversation", async () => {
		const conversation = await chatgptService.createConversation(userId);

		expect(conversation).toBeDefined();
		expect(conversation).toHaveProperty("id");
		expect(conversation).toHaveProperty("created_at");

		// Check the record in the database
		const conversations = await dbschema
			.select(dbschema.Conversation, (c) => ({
				id: true,
				owner: { id: true },
				filter: dbschema.op(c.id, "=", $uuid(conversation.id)),
			}))
			.run(client);

		expect(conversations.length).toBe(1);
		expect(conversations[0]?.id).toBe(conversation.id);
		expect(conversations[0]?.owner?.id).toBe(userId);
	});

	it("getConversations should return the user's list of conversations", async () => {
		// First, create a conversation
		const createRes = await chatgptService.createConversation(userId);
		expect(createRes).toBeDefined();
		expect(createRes.id).toBeDefined();

		// Retrieve the list of conversations
		const conversations = await chatgptService.getConversations(userId);

		expect(conversations).toBeDefined();
		expect(Array.isArray(conversations)).toBe(true);
		expect(conversations.length).toBeGreaterThanOrEqual(1);

		// Check the properties of the first conversation
		if (conversations.length > 0) {
			const conversation = conversations[0];
			expect(conversation).toHaveProperty("id");
			expect(conversation).toHaveProperty("created_at");
		}
	});

	it("getConversation should return a specific conversation", async () => {
		// First, create a conversation
		const createRes = await chatgptService.createConversation(userId);
		const conversationId = createRes.id;
		expect(conversationId).toBeDefined();

		// Retrieve the conversation
		const conversation = await chatgptService.getConversation(
			conversationId,
			userId,
		);

		expect(conversation).toBeDefined();
		expect(conversation).toHaveProperty("id", conversationId);
		expect(conversation).toHaveProperty("created_at");
		expect(conversation).toHaveProperty("messages");
		expect(Array.isArray(conversation.messages)).toBe(true);
	});

	it("getConversation should throw an error for a non‑existent conversation", async () => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000"; // UUID format

		await expect(
			chatgptService.getConversation(nonExistentId, userId),
		).rejects.toThrow("Conversation not found");
	});

	it("addMessage should add a user message to the conversation", async () => {
		// First, create a conversation
		const createRes = await chatgptService.createConversation(userId);
		const conversationId = createRes.id;
		expect(conversationId).toBeDefined();

		// Add the message
		const message = await chatgptService.addMessage(
			conversationId,
			userId,
			"Hello AI, this is a test message",
		);

		expect(message).toBeDefined();
		expect(message).toHaveProperty("id");
		expect(message).toHaveProperty(
			"content",
			"Hello AI, this is a test message",
		);
		expect(message).toHaveProperty("message_type", "user");

		// Verify that the message is saved
		const conversation = await chatgptService.getConversation(
			conversationId,
			userId,
		);
		expect(conversation.messages).toBeDefined();
		expect(Array.isArray(conversation.messages)).toBe(true);

		if (conversation.messages && conversation.messages.length > 0) {
			expect(conversation.messages.length).toBe(1);

			const firstMessage = conversation.messages[0];
			if (firstMessage) {
				expect(firstMessage.content).toBe("Hello AI, this is a test message");
				expect(firstMessage.message_type).toBe("user");
			} else {
				throw new Error("First message is undefined");
			}
		} else {
			throw new Error("Message not found in conversation");
		}
	});

	it("saveAIMessage should add an AI message to the conversation", async () => {
		// First, create a conversation
		const createRes = await chatgptService.createConversation(userId);
		const conversationId = createRes.id;
		expect(conversationId).toBeDefined();

		// First, add the user message
		await chatgptService.addMessage(
			conversationId,
			userId,
			"Hello AI, this is a test message",
		);

		// Save the AI response
		const aiMessage = await chatgptService.saveAIMessage(
			conversationId,
			"Hello human, this is the AI response",
		);

		expect(aiMessage).toBeDefined();
		expect(aiMessage).toHaveProperty("id");
		expect(aiMessage).toHaveProperty(
			"content",
			"Hello human, this is the AI response",
		);
		expect(aiMessage).toHaveProperty("message_type", "ai");

		// Check that both messages are saved
		const conversation = await chatgptService.getConversation(
			conversationId,
			userId,
		);
		expect(conversation.messages).toBeDefined();
		expect(Array.isArray(conversation.messages)).toBe(true);

		if (conversation.messages && conversation.messages.length >= 2) {
			expect(conversation.messages.length).toBe(2);

			const userMessage = conversation.messages[0];
			const aiResponseMessage = conversation.messages[1];

			if (userMessage && aiResponseMessage) {
				expect(userMessage.message_type).toBe("user");
				expect(aiResponseMessage.message_type).toBe("ai");
			} else {
				throw new Error("One or both messages are undefined");
			}
		} else {
			throw new Error("Not enough messages in the conversation");
		}
	});

	it("addMessage should throw an error for a non‑existent conversation", async () => {
		const nonExistentId = "00000000-0000-0000-0000-000000000000"; // UUID format

		await expect(
			chatgptService.addMessage(
				nonExistentId,
				userId,
				"This should throw an error",
			),
		).rejects.toThrow("Conversation not found");
	});

	// Tests using the OpenAI API are run only if an API key is present
	(process.env.OPENAI_API_KEY ? it : it.skip)(
		"generateAIResponseStream should return a stream of AI responses",
		async () => {
			// Create a conversation
			const createRes = await chatgptService.createConversation(userId);
			const conversationId = createRes.id;
			const userMessageContent = "Hello AI, respond with a short greeting";

			// Add a user message (needed for history in generateAIResponseStream)
			await chatgptService.addMessage(
				conversationId,
				userId,
				userMessageContent,
			);

			// Call the service method directly to obtain the stream
			const stream = await chatgptService.generateAIResponseStream(
				conversationId,
				userId,
				userMessageContent, // Pass the latest user message as in the controller
			);

			// Test the response stream
			let fullResponse = "";
			for await (const chunk of stream) {
				// Check that the chunk contains a textual response (structure depends on LlamaIndex)
				// Assume that chunk.response contains a string
				expect(typeof chunk.response).toBe("string");
				fullResponse += chunk.response;
			}

			// The complete response must contain some text
			expect(fullResponse.length).toBeGreaterThan(0);

			// Save the AI response (this step is still necessary to verify saving)
			await chatgptService.saveAIMessage(conversationId, fullResponse.trim());

			// Check that both messages are saved
			const updatedConversation = await chatgptService.getConversation(
				conversationId,
				userId,
			);

			if (
				updatedConversation.messages &&
				updatedConversation.messages.length >= 2
			) {
				expect(updatedConversation.messages.length).toBe(2);

				const userMsg = updatedConversation.messages[0];
				const aiMsg = updatedConversation.messages[1];

				if (userMsg && aiMsg) {
					expect(userMsg.message_type).toBe("user");
					expect(aiMsg.message_type).toBe("ai");
					expect(aiMsg.content).toBe(fullResponse.trim());
				} else {
					throw new Error("One or both messages are undefined");
				}
			} else {
				throw new Error(
					"Not enough messages in the conversation after processing the AI response",
				);
			}
		},
		30000,
	); // Increase the timeout to 30 seconds for the API call

	// We will also test the full cycle only when an API key is present
	(process.env.OPENAI_API_KEY ? it : it.skip)(
		"Full cycle: create a conversation, send a message, and get a response",
		async () => {
			const userMessageContent = "What is artificial intelligence?";

			// 1. Create a new conversation
			const conversation = await chatgptService.createConversation(userId);
			expect(conversation.id).toBeDefined();

			// 2. Add a user message
			const userMessage = await chatgptService.addMessage(
				conversation.id,
				userId,
				userMessageContent,
			);
			expect(userMessage.message_type).toBe("user");

			// 3. Generate an AI response via the service
			const stream = await chatgptService.generateAIResponseStream(
				conversation.id,
				userId,
				userMessageContent,
			);

			// 4. Collect responses from the stream
			let aiResponse = "";
			for await (const chunk of stream) {
				expect(typeof chunk.response).toBe("string");
				aiResponse += chunk.response;
			}
			expect(aiResponse.length).toBeGreaterThan(0);

			// 5. Save the AI response
			const savedAiMessage = await chatgptService.saveAIMessage(
				conversation.id,
				aiResponse.trim(),
			);
			expect(savedAiMessage.message_type).toBe("ai");

			// 6. Check that all messages are saved correctly
			const updatedConversation = await chatgptService.getConversation(
				conversation.id,
				userId,
			);

			if (
				updatedConversation.messages &&
				updatedConversation.messages.length >= 2
			) {
				expect(updatedConversation.messages.length).toBe(2);

				const userMsg = updatedConversation.messages[0];
				const aiMsg = updatedConversation.messages[1];

				if (userMsg && aiMsg) {
					expect(userMsg.content).toBe(userMessageContent);
					expect(aiMsg.content).toBe(aiResponse.trim());
				} else {
					throw new Error("One or both messages are undefined");
				}
			} else {
				throw new Error("Not enough messages after the full processing cycle");
			}
		},
		30000,
	); // Increase the timeout to 30 seconds for the API call
});
