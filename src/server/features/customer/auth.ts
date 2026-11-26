/**
 * Customer authentication server functions.
 *
 * Flow:
 *  1. requestCustomerLoginOtp(mobile)  – rate-limited OTP generation
 *  2. verifyCustomerLoginOtp(mobile, otp) – verify OTP, auto-create account if new user, create session
 */

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

// ─── validation schemas ───────────────────────────────────────────────────────

const indianMobileSchema = z
	.string()
	.trim()
	.regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number.")
	.transform((mobile) => mobile.replace(/^\+91/, ""));

const requestOtpInputSchema = z.object({
	mobile: indianMobileSchema,
});

const verifyOtpInputSchema = z.object({
	mobile: indianMobileSchema,
	otp: z
		.string()
		.trim()
		.length(6, "OTP must be exactly 6 digits.")
		.regex(/^\d{6}$/, "OTP must be numeric."),
});

// ─── requestCustomerLoginOtp ─────────────────────────────────────────────────

export const requestCustomerLoginOtp = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => requestOtpInputSchema.parse(raw))
	.handler(async ({ data }) => {
		const { requestOtp } = await import("../../auth/otp.ts");
		const result = await requestOtp({
			mobile: data.mobile,
			purpose: "customer_login",
		});
		return result;
	});

// ─── verifyCustomerLoginOtp ──────────────────────────────────────────────────

export const verifyCustomerLoginOtp = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => verifyOtpInputSchema.parse(raw))
	.handler(async ({ data }) => {
		const { db } = await import("../../../db/index.ts");
		const { customerProfiles, otpVerifications, roles, userRoles, users } =
			await import("../../../db/schema.ts");
		const { verifyOtp } = await import("../../auth/otp.ts");
		const { createSession } = await import("../../auth/session.ts");
		// 1. Verify the OTP (throws OtpError on failure)
		const { otpRecordId } = await verifyOtp({
			mobile: data.mobile,
			otp: data.otp,
			purpose: "customer_login",
		});

		// Keep customer eligibility, account/role creation and profile repair together.
		const { userId, isNewUser } = await db.transaction(async (tx) => {
			const [existingUser] = await tx
				.select({ id: users.id, isActive: users.isActive })
				.from(users)
				.where(eq(users.mobile, data.mobile))
				.limit(1)
				.for("update");

			let userId: string;
			if (existingUser) {
				if (!existingUser.isActive) {
					throw new Error(
						"Your account has been deactivated. Please contact support.",
					);
				}

				const assignedRoles = await tx
					.select({ name: roles.name })
					.from(userRoles)
					.innerJoin(roles, eq(roles.id, userRoles.roleId))
					.where(eq(userRoles.userId, existingUser.id));
				const roleNames = assignedRoles.map(({ name }) => name);
				if (
					!roleNames.includes("customer") ||
					roleNames.includes("admin") ||
					roleNames.includes("technician")
				) {
					throw new Error(
						"This mobile number is registered under a different account type.",
					);
				}

				userId = existingUser.id;
				await tx
					.update(users)
					.set({ isMobileVerified: true, updatedAt: new Date() })
					.where(eq(users.id, userId));
			} else {
				const [customerRole] = await tx
					.select({ id: roles.id })
					.from(roles)
					.where(eq(roles.name, "customer"))
					.limit(1);

				if (!customerRole) {
					throw new Error(
						"Customer role is not configured. Please contact support.",
					);
				}

				const [newUser] = await tx
					.insert(users)
					.values({
						name: null,
						mobile: data.mobile,
						isMobileVerified: true,
						isActive: true,
					})
					.returning({ id: users.id });

				if (!newUser) throw new Error("Failed to create user record.");

				await tx.insert(userRoles).values({
					userId: newUser.id,
					roleId: customerRole.id,
				});

				userId = newUser.id;
			}

			await tx
				.insert(customerProfiles)
				.values({ userId })
				.onConflictDoNothing({ target: customerProfiles.userId });
			await tx
				.update(otpVerifications)
				.set({ userId })
				.where(eq(otpVerifications.id, otpRecordId));

			return { userId, isNewUser: !existingUser };
		});

		// 3. Create session (sets cookie server-side)
		await createSession(userId);

		return { success: true as const, isNewUser };
	});
