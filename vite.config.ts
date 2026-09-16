import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			version: {
				// The commit the image was built from, so every rollout publishes a
				// distinct version.json. Falls back to SvelteKit's build timestamp
				// when built outside CI.
				name: process.env.APP_VERSION || undefined,
				// Let already-open tabs notice a deploy on their own, rather than
				// only when a navigation has already failed.
				pollInterval: 60_000,
			},
		}),
	],
	css: {
		preprocessorOptions: { scss: { silenceDeprecations: ["if-function"] } },
	},
	server: {
		host: true,
	},
	ssr: {
		external: ["bun:sqlite"],
	},
	optimizeDeps: {
		exclude: ["bun:sqlite"],
	},
});
