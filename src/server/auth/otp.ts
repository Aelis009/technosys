/**
 * OTP service – persists local challenges and atomically records verification.
 *
 * Dev mode:  raw OTP is returned in the server-function response (never touches the browser in prod).
 * Prod mode: Twilio Verify generates, sends, and checks the code.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { otpVerifications } from "../../db/schema.ts";
import { getServerEnv } from "../env.ts";
import {
	checkTwilioVerification,
	startTwilioVerification,
	twilioVerifyConfig,
	twilioVerifyConfigIssue,
	usesTwilioVerify,
	verificationSidPattern,
} from "./twilioVerify.ts";

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

const VERIFY_PREFIX = "twilio-verify:";

// ─── requestOtp ──────────────────────────────────────────────────────────────

export interface RequestOtpResult {
	success: true;
	/** Cooldown in seconds (if re-request was too soon – should not reach here but kept for safety). */
	cooldownSeconds?: never;
	/** Only present in development. */
	devOtp?: string;
}

/**
 * Starts an OTP challenge for `mobile` and `purpose`.
 * - Enforces 60-second resend cooldown.
 * - Invalidates previous unused OTPs for the same contact and purpose.
 * - Stores a local code hash or Twilio verification reference with 5-minute expiry.
 * - Development mode: returns raw OTP in result.
 * - Prod mode: sends via Twilio Verify.
 */
export async function requestOtp({
	mobile,
	purpose,
}: {
	mobile: string;
	purpose: OtpPurpose;
}): Promise<RequestOtpResult> {
	const env = getServerEnv();
	const useVerify = usesTwilioVerify(env);
	const config = useVerify ? twilioVerifyConfig(env) : null;

	if (useVerify && !config) {
		console.error("[OTP]", twilioVerifyConfigIssue(env));
		throw new OtpError(
			"SEND_FAILED",
			"SMS service is currently unavailable. Please try again later.",
		);
	}
	const otp = useVerify ? undefined : generateOtp();
	// Reserve the cooldown before sending. The pending marker cannot be verified.
	const otpHash =
		otp === undefined ? VERIFY_PREFIX : hashOtp(otp, env.OTP_SECRET);

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

		const [record] = await tx
			.insert(otpVerifications)
			.values({
				contactType: "mobile",
				contactValue: mobile,
				purpose,
				otpHash,
				// Use the same clock for both timestamps so clock skew cannot change the TTL.
				createdAt: now,
				expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
			})
			.returning({ id: otpVerifications.id });

		return { ok: true as const, id: record.id };
	});

	if (!txResult.ok) {
		throw new OtpError(
			"COOLDOWN",
			`Please wait ${txResult.remaining} second(s) before requesting a new OTP.`,
		);
	}

	if (config) {
		let sid: string;
		try {
			sid = await startTwilioVerification(config, mobile);
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
		await db
			.update(otpVerifications)
			.set({ otpHash: `${VERIFY_PREFIX}${sid}` })
			.where(eq(otpVerifications.id, txResult.id));
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
 * Atomically verifies a submitted OTP against its local hash or Twilio challenge.
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
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${purpose}:${mobile}`}, 0))`,
		);
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

		let isValid: boolean;
		if (usesTwilioVerify(env)) {
			const sid = record.otpHash.startsWith(VERIFY_PREFIX)
				? record.otpHash.slice(VERIFY_PREFIX.length)
				: "";
			if (!verificationSidPattern.test(sid)) {
				return {
					ok: false,
					code: "EXPIRED",
					message: "No pending OTP found. Please request a new one.",
				};
			}
			const config = twilioVerifyConfig(env);
			let status: Awaited<ReturnType<typeof checkTwilioVerification>>;
			try {
				if (!config) throw new Error(twilioVerifyConfigIssue(env));
				status = await checkTwilioVerification(config, sid, mobile, otp);
			} catch (error) {
				console.error(
					"[OTP] Twilio check failed:",
					error instanceof Error ? error.message : "Unknown error",
				);
				return {
					ok: false,
					code: "SEND_FAILED",
					message: "We could not check the OTP. Please try again shortly.",
				};
			}
			if (status === "expired" || status === "max-attempts") {
				await tx
					.update(otpVerifications)
					.set({ expiresAt: now })
					.where(eq(otpVerifications.id, record.id));
				return status === "expired"
					? {
							ok: false,
							code: "EXPIRED",
							message: "Your OTP has expired. Please request a new one.",
						}
					: {
							ok: false,
							code: "MAX_ATTEMPTS",
							message: "Too many incorrect attempts. Please request a new one.",
						};
			}
			isValid = status === "approved";
		} else {
			isValid = verifyOtpHash(otp, record.otpHash, env.OTP_SECRET);
		}

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
