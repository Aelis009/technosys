import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

const profileSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(1, "Enter your name.")
			.max(100, "Name must be at most 100 characters."),
	})
	.strict();

export const saveCustomerName = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => profileSchema.parse(raw))
	.handler(async ({ data }) => {
		const { requireAuthenticatedUser, AuthorizationError } = await import(
			"../../auth/session.ts"
		);
		const user = await requireAuthenticatedUser();
		if (
			!user.roles.includes("customer") ||
			user.roles.includes("admin") ||
			user.roles.includes("technician")
		)
			throw new AuthorizationError();
		const { db } = await import("../../../db/index.ts");
		const { users } = await import("../../../db/schema.ts");
		await db
			.update(users)
			.set({ name: data.name, updatedAt: new Date() })
			.where(eq(users.id, user.id));
		return { success: true as const };
	});
