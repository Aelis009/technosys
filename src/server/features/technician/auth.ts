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
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrf.ts";
import { requestOtp } from "../../auth/otp.ts";
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

export const technicianRegistrationOtpPurpose = "technician_mobile_verify";

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
		requestOtp({
			mobile: data.mobile,
			purpose: technicianRegistrationOtpPurpose,
		}),
	);

class SecureRegistrationRequiredError extends Error {
	readonly status = 400;
	readonly code = "SECURE_REGISTRATION_REQUIRED";

	constructor() {
		super(
			"Technician registration must be completed on the secure registration page.",
		);
		this.name = "SecureRegistrationRequiredError";
	}
}

/**
 * Legacy callable retained only to fail closed. Client-trusted document URLs or
 * public IDs can no longer reach registration; the secure multipart endpoint
 * owns the Cloudinary upload and persists provider-returned metadata.
 */
export const registerTechnician = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => raw)
	.handler(() => {
		throw new SecureRegistrationRequiredError();
	});

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
		const { loginWithPassword } = await import("../../auth/passwordLogin.ts");
		const result = await loginWithPassword(data, "technician");
		if (result.role !== "technician") throw new Error("Unexpected login role.");
		return {
			success: true,
			technicianStatus: result.technicianStatus,
			canAccessDashboard: result.canAccessDashboard,
		};
	});
