/**
 * Admin authentication server functions.
 *
 * loginAdmin   – email + password, rate-limited
 * logoutCurrentUser – revokes the current session
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

const loginInputSchema = z.object({
	email: z.string().trim().email("Enter a valid email address.").toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

export const loginAdmin = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => loginInputSchema.parse(raw))
	.handler(async ({ data }) => {
		const { loginWithPassword } = await import("../../auth/passwordLogin.ts");
		await loginWithPassword(data, "admin");
		return { success: true as const };
	});

export const logoutCurrentUser = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.handler(async () => {
		const { revokeCurrentSession } = await import("../../auth/session.ts");
		await revokeCurrentSession();
		return { success: true as const };
	});
