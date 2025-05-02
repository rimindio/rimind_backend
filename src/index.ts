import cors from "@elysiajs/cors";
import { Elysia, t } from "elysia";
import logixlysia from "logixlysia";
import { userController } from "./modules/user/user.controller";

// Configure the logging plugin for production
const setupApp = () => {
	const app = new Elysia({ name: "Rimind Backend" });

	// Only apply logger in production
	if (process.env.NODE_ENV === "production") {
		app.use(
			logixlysia({
				config: {
					showStartupMessage: true,
					startupMessageFormat: "simple",
					timestamp: {
						translateTime: "yyyy-mm-dd HH:MM:ss.SSS",
					},
					logFilePath: "./logs/example.log",
					ip: true,
					customLogFormat:
						"🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}",
				},
			}),
		);
	}

	return app
		.use(cors())
		.use(userController)
		.get("/", () => "Hello World")
		.get("/conversations", () => [])
		.get("/conversation/:id", () => {})
		.post("/conversation/:id/messages", () => {})
		.get("/conversation/:id/messages", () => []);
};

export const app = setupApp().listen(3000);
