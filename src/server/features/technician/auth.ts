/**
 * Technician authentication server functions.
 *
 * registerTechnician  – full registration form with Cloudinary pre-upload URLs
 * loginTechnician     – email + password, rate-limited, status-aware
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/index.ts";
import {
	otpVerifications,
	roles,
	technicianBankDetails,
	technicianDocuments,
	technicianProfiles,
	technicianServiceCategories,
	userRoles,
	users,
} from "../../../db/schema.ts";
import { csrfMiddleware } from "../../auth/csrf.ts";
import { canAccessTechnicianDashboard } from "../../auth/guards.ts";
import {
	checkLoginBlock,
	clearLoginAttempts,
	recordFailedAttempt,
} from "../../auth/loginAttempts.ts";
import { requestOtp, verifyOtp } from "../../auth/otp.ts";
import { hashPassword, verifyPassword } from "../../auth/password.ts";
import { AuthenticationError, createSession } from "../../auth/session.ts";
import { getServerEnv } from "../../env.ts";

// ─── bank-account encryption ──────────────────────────────────────────────────

/**
 * Derives a 32-byte AES key from JWT_SECRET via SHA-256.
 * Stored format: `aes256gcm:<ivHex>:<authTagHex>:<ciphertextHex>`
 */
function deriveEncryptionKey(): Buffer {
	const env = getServerEnv();
	return createHash("sha256").update(env.JWT_SECRET).digest();
}

export function encryptAccountNumber(plaintext: string): string {
	const key = deriveEncryptionKey();
	const iv = randomBytes(12); // 96-bit IV for GCM
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();
	return `aes256gcm:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptAccountNumber(stored: string): string {
	const parts = stored.split(":");
	if (parts.length !== 4 || parts[0] !== "aes256gcm") {
		throw new Error("Invalid encrypted account number format.");
	}
	const [, ivHex, authTagHex, ciphertextHex] = parts;
	if (!ivHex || !authTagHex || !ciphertextHex) {
		throw new Error("Malformed encrypted account number.");
	}
	const key = deriveEncryptionKey();
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const ciphertext = Buffer.from(ciphertextHex, "hex");
	const decipher = createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(authTag);
	return Buffer.concat([
		decipher.update(ciphertext),
		decipher.final(),
	]).toString("utf8");
}

// ─── validation schemas ───────────────────────────────────────────────────────

const indianMobileSchema = z
	.string()
	.trim()
	.regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number.")
	.transform((mobile) => mobile.replace(/^\+91/, ""));

const registrationOtpPurpose = "technician_mobile_verify";

const registerInputSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters.")
			.max(100),
		email: z
			.string()
			.trim()
			.email("Enter a valid email address.")
			.toLowerCase(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters.")
			.max(128, "Password must be no more than 128 characters."),
		confirmPassword: z.string(),
		mobile: indianMobileSchema,
		otp: z
			.string()
			.trim()
			.regex(/^\d{6}$/, "Enter the six-digit OTP."),
		serviceCategoryId: z.string().uuid("Select a valid service category."),
		gender: z.enum(["male", "female", "other"]).optional(),
		dateOfBirth: z
			.string()
			.regex(
				/^\d{4}-\d{2}-\d{2}$/,
				"Date of birth must be in YYYY-MM-DD format.",
			)
			.optional(),
		/** Cloudinary URL returned after client-side upload. Optional. */
		profileImageUrl: z.string().url().optional(),
		profileImagePublicId: z.string().optional(),
		/** Identity document – required */
		documentUrl: z.string().url("Document URL is required."),
		documentPublicId: z.string().min(1, "Document public ID is required."),
		documentType: z.string().min(1, "Document type is required.").max(50),
		// Bank details
		accountHolderName: z
			.string()
			.trim()
			.min(2, "Account holder name is required.")
			.max(150),
		accountNumber: z
			.string()
			.trim()
			.min(8, "Account number must be at least 8 digits.")
			.max(20, "Account number must be no more than 20 digits.")
			.regex(/^\d+$/, "Account number must contain only digits."),
		ifscCode: z
			.string()
			.trim()
			.toUpperCase()
			.regex(
				/^[A-Z]{4}0[A-Z0-9]{6}$/,
				"Enter a valid IFSC code (e.g. SBIN0001234).",
			),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

const loginInputSchema = z.object({
	email: z.string().trim().email("Enter a valid email address.").toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

// ─── registerTechnician ───────────────────────────────────────────────────────

export const requestTechnicianRegistrationOtp = createServerFn({
	method: "POST",
})
	.middleware([csrfMiddleware])
	.validator((raw: unknown) =>
		z.object({ mobile: indianMobileSchema }).parse(raw),
	)
	.handler(({ data }) =>
		requestOtp({ mobile: data.mobile, purpose: registrationOtpPurpose }),
	);

export const registerTechnician = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => registerInputSchema.parse(raw))
	.handler(async ({ data }) => {
		// 1. Check email not already taken
		const [emailConflict] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, data.email))
			.limit(1);

		if (emailConflict) {
			throw new Error("An account with this email address already exists.");
		}

		// 2. Check mobile not already taken
		const [mobileConflict] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.mobile, data.mobile))
			.limit(1);

		if (mobileConflict) {
			throw new Error("An account with this mobile number already exists.");
		}

		// 3. Fetch technician role
		const [technicianRole] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.name, "technician"))
			.limit(1);

		if (!technicianRole) {
			throw new Error(
				"Technician role is not configured. Please contact support.",
			);
		}

		const { otpRecordId } = await verifyOtp({
			mobile: data.mobile,
			otp: data.otp,
			purpose: registrationOtpPurpose,
		});

		// 4. Hash password and encrypt bank account number
		const [passwordHash, accountNumberEncrypted] = await Promise.all([
			hashPassword(data.password),
			Promise.resolve(encryptAccountNumber(data.accountNumber)),
		]);

		// 5. Atomic transaction
		await db.transaction(async (tx) => {
			// 5a. Create user
			const [newUser] = await tx
				.insert(users)
				.values({
					name: data.name,
					email: data.email,
					mobile: data.mobile,
					passwordHash,
					isEmailVerified: false,
					isMobileVerified: true,
					isActive: true,
				})
				.returning({ id: users.id });

			if (!newUser) throw new Error("Failed to create user record.");

			const userId = newUser.id;

			// 5b. Assign technician role
			await tx.insert(userRoles).values({
				userId,
				roleId: technicianRole.id,
			});

			// 5c. Create technician profile
			const [techProfile] = await tx
				.insert(technicianProfiles)
				.values({
					userId,
					gender: data.gender ?? null,
					dateOfBirth: data.dateOfBirth ?? null,
					profileImageUrl: data.profileImageUrl ?? null,
					profileImagePublicId: data.profileImagePublicId ?? null,
					verificationStatus: "pending",
					activeStatus: "active",
				})
				.returning({ id: technicianProfiles.id });

			if (!techProfile) throw new Error("Failed to create technician profile.");

			const technicianId = techProfile.id;

			// 5d. Assign service category
			await tx.insert(technicianServiceCategories).values({
				technicianId,
				categoryId: data.serviceCategoryId,
			});

			// 5e. Store identity document
			await tx.insert(technicianDocuments).values({
				technicianId,
				documentType: data.documentType,
				documentUrl: data.documentUrl,
				cloudinaryPublicId: data.documentPublicId,
				verificationStatus: "pending",
			});

			// 5f. Store bank details (account number encrypted)
			await tx.insert(technicianBankDetails).values({
				technicianId,
				accountHolderName: data.accountHolderName,
				accountNumberEncrypted,
				ifscCode: data.ifscCode,
			});
			await tx
				.update(otpVerifications)
				.set({ userId })
				.where(eq(otpVerifications.id, otpRecordId));
		});

		return { success: true as const };
	});

// ─── loginTechnician ──────────────────────────────────────────────────────────

export type TechnicianLoginResult = {
	success: true;
	technicianStatus: {
		verificationStatus: "pending" | "approved" | "rejected";
		activeStatus: "active" | "inactive" | "suspended";
		verificationReason: string | null;
	};
	canAccessDashboard: boolean;
};

export const loginTechnician = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => loginInputSchema.parse(raw))
	.handler(async ({ data }): Promise<TechnicianLoginResult> => {
		const { email, password } = data;

		// 1. Rate-limit check
		await checkLoginBlock(email);

		const GENERIC_ERROR = "Invalid email or password.";

		// 2. Find user by email
		const [user] = await db
			.select({
				id: users.id,
				passwordHash: users.passwordHash,
				isActive: users.isActive,
			})
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

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

		// 4. Account active check
		if (!user.isActive) {
			throw new AuthenticationError("This account has been deactivated.");
		}

		// 5. Verify technician role
		const [technicianRole] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.name, "technician"))
			.limit(1);

		if (!technicianRole) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		const [hasTechRole] = await db
			.select({ id: userRoles.id })
			.from(userRoles)
			.where(
				and(
					eq(userRoles.userId, user.id),
					eq(userRoles.roleId, technicianRole.id),
				),
			)
			.limit(1);

		if (!hasTechRole) {
			await recordFailedAttempt(email);
			throw new AuthenticationError(GENERIC_ERROR);
		}

		// 6. Fetch technician profile status
		const [profile] = await db
			.select({
				verificationStatus: technicianProfiles.verificationStatus,
				activeStatus: technicianProfiles.activeStatus,
				verificationReason: technicianProfiles.verificationReason,
			})
			.from(technicianProfiles)
			.where(eq(technicianProfiles.userId, user.id))
			.limit(1);

		if (!profile) {
			throw new AuthenticationError(
				"Technician profile not found. Please contact support.",
			);
		}

		await clearLoginAttempts(email);
		// Dashboard authorization is enforced separately by the server guard.
		await createSession(user.id);
		return {
			success: true,
			technicianStatus: profile,
			canAccessDashboard: canAccessTechnicianDashboard(profile),
		};
	});
