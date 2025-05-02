import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		globals: true,
		environment: "node", // or 'jsdom' if needed for frontend tests later
		setupFiles: [], // We might add setup files later if needed
		// Add any other specific vitest config here
	},
});
