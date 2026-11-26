import { createMiddleware } from "@tanstack/react-start";

export const csrfMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const { assertSameOrigin } = await import("./csrf.ts");
		assertSameOrigin();
		return next();
	},
);
