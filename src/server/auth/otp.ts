/**
 * OTP service – generates, hashes (HMAC-SHA256), persists, and atomically verifies one-time passwords.
 *
 * Dev mode:  raw OTP is returned in the server-function response (never touches the browser in prod).
 * Prod mode: OTP is sent via Twilio Programmable Messaging REST API using native fetch; raw value is never returned or logged.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { otpVerifications } from "../../db/schema.ts";
import { getServerEnv } from "../env.ts";

// ─── constants ──────────────────────────────────────────────────────────────

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export type OtpPurpose = "customer_login" | "technician_mobile_verify";
export type OtpContactType = "email" | "mobile";

// ─── error types ─────────────────────────────────────────────────────────────

export type OtpErrorCode =
	| "EXPIRED"
	| "MAX_ATTEMPTS"
	| "INVALID"
	| "COOLDOWN"
	| "SEND_FAILED";

export class OtpError extends Error {
	readonly code: OtpErrorCode;

	constructor(code: OtpErrorCode, message: string) {
		super(message);
		this.name = "OtpError";
		this.code = code;
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function generateOtp(): string {
	// Crypto-random 6-digit string, zero-padded
	const value = randomInt(0, 1_000_000);
	return value.toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(
	otp: string,
	secret: string = getServerEnv().OTP_SECRET,
): string {
	return createHmac("sha256", secret).update(otp).digest("hex");
}

export function verifyOtpHash(
	otp: string,
	storedHash: string,
	secret: string = getServerEnv().OTP_SECRET,
): boolean {
	const submittedHash = hashOtp(otp, secret);
	const expectedBuf = Buffer.from(storedHash, "hex");
	const actualBuf = Buffer.from(submittedHash, "hex");

	if (expectedBuf.length === 0 || expectedBuf.length !== actualBuf.length) {
		return false;
	}

	return timingSafeEqual(expectedBuf, actualBuf);
}

async function sendTwilioSms(to: string, body: string): Promise<void> {
	const env = getServerEnv();
	const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
	const authToken = env.TWILIO_AUTH_TOKEN?.trim();
	const fromNumber = env.TWILIO_PHONE_NUMBER?.trim();

	if (!accountSid || !authToken || !fromNumber) {
		throw new Error(
			"Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are missing.",
		);
	}

	const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
	const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString(
		"base64",
	);
	const formattedTo = to.startsWith("+") ? to : `+91${to}`;

	const payload = new URLSearchParams({
		To: formattedTo,
		From: fromNumber,
		Body: body,
	});

	const response = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Basic ${authHeader}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: payload.toString(),
	});

	if (!response.ok) {
		throw new Error(`Twilio SMS API failed with status ${response.status}.`);
	}
}

// ─── requestOtp ──────────────────────────────────────────────────────────────

export interface RequestOtpResult {
	success: true;
	/** Cooldown in seconds (if re-request was too soon – should not reach here but kept for safety). */
	cooldownSeconds?: never;
	/** Only present in development. */
	devOtp?: string;
}

/**
 * Generates an OTP for `mobile` and `purpose`.
 * - Enforces 60-second resend cooldown.
 * - Invalidates previous unused OTPs for the same contact and purpose.
 * - Stores HMAC-SHA256 hash with 5-minute expiry.
 * - Development mode: returns raw OTP in result.
 * - Prod mode: sends via Twilio Programmable Messaging REST API using native fetch.
 */
export async function requestOtp({
	mobile,
	purpose,
}: {
	mobile: string;
	purpose: OtpPurpose;
}): Promise<RequestOtpResult> {
	const env = getServerEnv();
	const otp = generateOtp();
	const otpHash = hashOtp(otp, env.OTP_SECRET);

	if (env.NODE_ENV === "production") {
		if (
			!env.TWILIO_ACCOUNT_SID?.trim() ||
			!env.TWILIO_AUTH_TOKEN?.trim() ||
			!env.TWILIO_PHONE_NUMBER?.trim()
		) {
			console.error("[OTP] Missing Twilio production configuration.");
			throw new OtpError(
				"SEND_FAILED",
				"SMS service is currently unavailable. Please try again later.",
			);
		}
	}

	const txResult = await db.transaction(async (tx) => {
		// Serialize issuance even when there is not yet a row to lock.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${purpose}:${mobile}`}, 0))`,
		);
		// Used codes count toward the resend cooldown too.
		const [latest] = await tx
			.select({
				id: otpVerifications.id,
				createdAt: otpVerifications.createdAt,
			})
			.from(otpVerifications)
			.where(
				and(
					eq(otpVerifications.contactType, "mobile"),
					eq(otpVerifications.contactValue, mobile),
					eq(otpVerifications.purpose, purpose),
				),
			)
			.orderBy(desc(otpVerifications.createdAt))
			.limit(1)
			.for("update");

		const now = new Date();
		if (latest) {
			const elapsed = now.getTime() - latest.createdAt.getTime();
			if (elapsed < OTP_RESEND_COOLDOWN_MS) {
				const remaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
				return { ok: false as const, remaining };
			}
		}

		// Invalidate all previous unused OTPs for the same contact + purpose
		await tx
			.update(otpVerifications)
			.set({ expiresAt: now })
			.where(
				and(
					eq(otpVerifications.contactType, "mobile"),
					eq(otpVerifications.contactValue, mobile),
					eq(otpVerifications.purpose, purpose),
					isNull(otpVerifications.verifiedAt),
				),
			);

		await tx.insert(otpVerifications).values({
			contactType: "mobile",
			contactValue: mobile,
			purpose,
			otpHash,
			// Use the same clock for both timestamps so clock skew cannot change the TTL.
			createdAt: now,
			expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
		});

		return { ok: true as const };
	});

	if (!txResult.ok) {
		throw new OtpError(
			"COOLDOWN",
			`Please wait ${txResult.remaining} second(s) before requesting a new OTP.`,
		);
	}

	if (env.NODE_ENV === "production") {
		try {
			await sendTwilioSms(
				mobile,
				`Your Technosys OTP is ${otp}. It expires in 5 minutes. Do not share it with anyone.`,
			);
		} catch (error) {
			// Never log raw OTP or Twilio secrets
			console.error(
				"[OTP] Twilio send failed:",
				error instanceof Error ? error.message : "Unknown error",
			);
			throw new OtpError(
				"SEND_FAILED",
				"We could not send the OTP. Please try again shortly.",
			);
		}
		return { success: true };
	}

	return env.NODE_ENV === "development"
		? { success: true, devOtp: otp }
		: { success: true };
}

// ─── verifyOtp ───────────────────────────────────────────────────────────────

type VerifyTxOutcome =
	| { ok: true; otpRecordId: string }
	| { ok: false; code: OtpErrorCode; message: string };

/**
 * Atomically verifies a submitted OTP against the stored HMAC-SHA256 hash.
 * Uses a transaction with `SELECT ... FOR UPDATE` so concurrent requests cannot
 * consume the same OTP twice, and failed attempts are persisted atomically.
 */
export async function verifyOtp({
	mobile,
	otp,
	purpose,
}: {
	mobile: string;
	otp: string;
	purpose: OtpPurpose;
}): Promise<{ otpRecordId: string }> {
	const env = getServerEnv();
	const outcome = await db.transaction(async (tx): Promise<VerifyTxOutcome> => {
		// Lock the most recent OTP row for this contact + purpose
		const [record] = await tx
			.select({
				id: otpVerifications.id,
				otpHash: otpVerifications.otpHash,
				expiresAt: otpVerifications.expiresAt,
				verifiedAt: otpVerifications.verifiedAt,
				attempts: otpVerifications.attempts,
			})
			.from(otpVerifications)
			.where(
				and(
					eq(otpVerifications.contactType, "mobile"),
					eq(otpVerifications.contactValue, mobile),
					eq(otpVerifications.purpose, purpose),
				),
			)
			.orderBy(desc(otpVerifications.createdAt))
			.limit(1)
			.for("update");

		if (!record || record.verifiedAt !== null) {
			return {
				ok: false,
				code: "EXPIRED",
				message: "No pending OTP found. Please request a new one.",
			};
		}

		const now = new Date();
		if (record.expiresAt <= now) {
			return {
				ok: false,
				code: "EXPIRED",
				message: "Your OTP has expired. Please request a new one.",
			};
		}

		if (record.attempts >= OTP_MAX_ATTEMPTS) {
			return {
				ok: false,
				code: "MAX_ATTEMPTS",
				message: "Too many incorrect attempts. Please request a new one.",
			};
		}

		const isValid = verifyOtpHash(otp, record.otpHash, env.OTP_SECRET);

		if (!isValid) {
			const nextAttempts = record.attempts + 1;
			await tx
				.update(otpVerifications)
				.set({ attempts: nextAttempts })
				.where(eq(otpVerifications.id, record.id));

			const remaining = OTP_MAX_ATTEMPTS - nextAttempts;
			return {
				ok: false,
				code: "INVALID",
				message:
					remaining > 0
						? `Incorrect OTP. ${remaining} attempt(s) remaining.`
						: "Incorrect OTP. No more attempts. Please request a new one.",
			};
		}

		await tx
			.update(otpVerifications)
			.set({ verifiedAt: now })
			.where(
				and(
					eq(otpVerifications.id, record.id),
					isNull(otpVerifications.verifiedAt),
				),
			);

		return { ok: true, otpRecordId: record.id };
	});

	if (!outcome.ok) {
		throw new OtpError(outcome.code, outcome.message);
	}

	return { otpRecordId: outcome.otpRecordId };
}
