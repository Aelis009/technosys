import { createServerFn } from "@tanstack/react-start";

export const getEntryState = createServerFn({ method: "GET" }).handler(
	async () => {
		const { entryState } = await import("./entry.server.ts");
		return entryState();
	},
);
