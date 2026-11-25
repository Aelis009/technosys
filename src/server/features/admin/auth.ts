/**
 * Admin authentication server functions.
 *
 * loginAdmin   – email + password, rate-limited
 * logoutCurrentUser – revokes the current session
 */

import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/index.ts";
import { roles, userRoles, users } from "../../../db/schema.ts";
import { csrfMiddleware } from "../../auth/csrf.ts";
import {
	checkLoginBlock,
	clearLoginAttempts,
	recordFailedAttempt,
} from "../../auth/loginAttempts.ts";
import { verifyPassword } from "../../auth/password.ts";
import {
	AuthenticationError,
	createSession,
	revokeCurrentSession,
} from "../../auth/session.ts";

// ─── validation schema ────────────────────────────────────────────────────────

const loginInputSchema = z.object({
	email: z.string().trim().email("Enter a valid email address.").toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

// ─── loginAdmin ───────────────────────────────────────────────────────────────

export const loginAdmin = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => loginInputSchema.parse(raw))
	.handler(async ({ data }) => {
		const { email, password } = data;

		// 1. Rate-limit check
		await checkLoginBlock(email);

		// 2. Look up user by email
		const [user] = await db
			.select({
				id: users.id,
				passwordHash: users.passwordHash,
				isActive: users.isActive,
			})
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		const GENERIC_ERROR = "Invalid email or password.";

		if (!user || !user.passwordHash) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		// 3. Verify password
		const passwordValid = await verifyPassword(password, user.passwordHash);
		if (!passwordValid) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		// 4. Check account active
		if (!user.isActive) {
			throw new AuthenticationError("This account has been deactivated.");
		}

		// 5. Verify admin role (use same generic error – don't reveal role info)
		const [adminRole] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.name, "admin"))
			.limit(1);

		if (!adminRole) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		const [hasAdminRole] = await db
			.select({ id: userRoles.id })
			.from(userRoles)
			.where(
				and(eq(userRoles.userId, user.id), eq(userRoles.roleId, adminRole.id)),
			)
			.limit(1);

		if (!hasAdminRole) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		// 6. Success
		await clearLoginAttempts(email);
		await createSession(user.id);

		return { success: true as const };
	});

// ─── logoutCurrentUser ────────────────────────────────────────────────────────

export const logoutCurrentUser = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.handler(async () => {
		await revokeCurrentSession();
		return { success: true as const };
	});
