import Elysia, { t } from "elysia";

// Create the basic message schema first
const messageSchema = t.Object({
	id: t.String(),
	content: t.String(),
	created_at: t.Date(),
	message_type: t.Union([t.Literal("user"), t.Literal("ai")]),
});

// Create the message creation schema
const messageCreateSchema = t.Object({
	content: t.String(),
});

// Create a simple conversation schema (without messages) for list views
const conversationListItemSchema = t.Object({
	id: t.String(),
	created_at: t.Date(),
});

// Instantiate Elysia and register basic schemas
const app = new Elysia({ name: "chat/model" })
	.model("chat.message", messageSchema)
	.model("chat.message.create", messageCreateSchema)
	.model("chat.conversation.list.item", conversationListItemSchema);

// After message schema is registered, create and register the array-based schemas
// Use direct reference to the schema instead of t.Ref to avoid reference issues
const messagesArraySchema = t.Array(messageSchema);
app.model("chat.messages", messagesArraySchema);

// Now create and register the conversation schema that depends on messages
const conversationSchema = t.Object({
	id: t.String(),
	created_at: t.Date(),
	messages: messagesArraySchema,
});
app.model("chat.conversation", conversationSchema);

// Finally add the conversation list schema
const conversationListSchema = t.Array(conversationListItemSchema);
app.model("chat.conversation.list", conversationListSchema);

// Add simple logging
console.log("DEBUG: Chat model initialized with schemas");

// Export schemas for direct use in controller
export {
	messageSchema,
	messageCreateSchema,
	conversationListItemSchema,
	messagesArraySchema,
	conversationSchema,
	conversationListSchema,
};

// Export as a direct instance, not a function
export const chatgptModel = app;
