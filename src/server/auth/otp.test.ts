/**
 * Unit & integration tests for Stage 6 OTP implementation.
 *
 * Run with:  npx tsx --test src/server/auth/otp.test.ts
 *
 * All SMS network calls are mocked via globalThis.fetch; no real SMS is sent.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, describe, it } from "node:test";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { otpVerifications } from "../../db/schema.ts";
import {
	generateOtp,
	hashOtp,
	OTP_EXPIRY_MS,
	OTP_RESEND_COOLDOWN_MS,
	OtpError,
	requestOtp,
	verifyOtp,
	verifyOtpHash,
} from "./otp.ts";

const RUN_ID = Date.now().toString(36);
const createdMobiles: string[] = [];

function uniqueMobile(suffix: string): string {
	// Valid 10-digit Indian mobile starting with 9
	const hashNum = Array.from(`${RUN_ID}${suffix}`).reduce(
		(acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 1_000_000_000,
		0,
	);
	const mobile = `9${hashNum.toString().padStart(9, "0")}`;
	createdMobiles.push(mobile);
	return mobile;
}

describe("OTP cryptography & generation", () => {
	it("1. OTP generation produces six digits", () => {
		for (let i = 0; i < 50; i++) {
			const otp = generateOtp();
			assert.match(otp, /^\d{6}$/, `Expected 6-digit OTP, got "${otp}"`);
		}
	});

	it("2. OTP hash uses HMAC-SHA256", () => {
		const secret = "test-secret-key-at-least-32-characters-long";
		const otp = "123456";
		const expected = createHmac("sha256", secret).update(otp).digest("hex");
		const actual = hashOtp(otp, secret);
		assert.equal(actual, expected);
		assert.equal(actual.length, 64);
		assert.equal(verifyOtpHash(otp, actual, secret), true);
	});

	it("3. Different secrets produce different hashes", () => {
		const otp = "654321";
		const secretA = "secret-a-must-be-at-least-32-characters-long";
		const secretB = "secret-b-must-be-at-least-32-characters-long";
		const hashA = hashOtp(otp, secretA);
		const hashB = hashOtp(otp, secretB);
		assert.notEqual(hashA, hashB);
		assert.equal(verifyOtpHash(otp, hashA, secretB), false);
	});
});

describe("OTP database lifecycle & concurrency", () => {
	after(async () => {
		for (const mobile of createdMobiles) {
			await db
				.delete(otpVerifications)
				.where(eq(otpVerifications.contactValue, mobile));
		}
		await db.$client.end();
	});

	it("4. OTP expires after five minutes", async () => {
		assert.equal(OTP_EXPIRY_MS, 5 * 60 * 1000);
		const mobile = uniqueMobile("exp");
		const res = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(res.devOtp);

		// Verify DB expiresAt is ~5 minutes from createdAt, then backdate expiresAt to simulate expiry
		const [row] = await db
			.select({
				id: otpVerifications.id,
				createdAt: otpVerifications.createdAt,
				expiresAt: otpVerifications.expiresAt,
			})
			.from(otpVerifications)
			.where(eq(otpVerifications.contactValue, mobile))
			.orderBy(desc(otpVerifications.createdAt))
			.limit(1);

		assert.ok(row);
		const ttl = row.expiresAt.getTime() - row.createdAt.getTime();
		assert.ok(
			Math.abs(ttl - 5 * 60 * 1000) < 2000,
			`Expected 5-minute expiry, got ${ttl}ms`,
		);

		await db
			.update(otpVerifications)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(otpVerifications.id, row.id));

		await assert.rejects(
			() =>
				verifyOtp({
					mobile,
					otp: res.devOtp ?? "",
					purpose: "customer_login",
				}),
			(err: unknown) => err instanceof OtpError && err.code === "EXPIRED",
		);
	});

	it("5 & 8. Wrong OTP does not mark record verified, and sixth attempt is rejected", async () => {
		const mobile = uniqueMobile("att");
		const res = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(res.devOtp);
		const wrongOtp = res.devOtp === "000000" ? "111111" : "000000";

		// 5 wrong attempts
		for (let i = 0; i < 5; i++) {
			await assert.rejects(
				() =>
					verifyOtp({
						mobile,
						otp: wrongOtp,
						purpose: "customer_login",
					}),
				(err: unknown) => err instanceof OtpError && err.code === "INVALID",
			);
		}

		// Record must still not be verified
		const [row] = await db
			.select({
				attempts: otpVerifications.attempts,
				verifiedAt: otpVerifications.verifiedAt,
			})
			.from(otpVerifications)
			.where(eq(otpVerifications.contactValue, mobile))
			.orderBy(desc(otpVerifications.createdAt))
			.limit(1);

		assert.equal(row?.attempts, 5);
		assert.equal(row?.verifiedAt, null);

		// 6th attempt (even with the correct OTP!) must be rejected
		await assert.rejects(
			() =>
				verifyOtp({
					mobile,
					otp: res.devOtp ?? "",
					purpose: "customer_login",
				}),
			(err: unknown) => err instanceof OtpError && err.code === "MAX_ATTEMPTS",
		);
	});

	it("6 & 7. Resend cooldown works, and resending after cooldown invalidates the previous OTP", async () => {
		const mobile = uniqueMobile("res");
		const first = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(first.devOtp);

		// Immediate resend must hit cooldown
		await assert.rejects(
			() => requestOtp({ mobile, purpose: "customer_login" }),
			(err: unknown) => err instanceof OtpError && err.code === "COOLDOWN",
		);

		// Backdate first OTP's createdAt past the 60s cooldown
		const [firstRow] = await db
			.select({ id: otpVerifications.id })
			.from(otpVerifications)
			.where(eq(otpVerifications.contactValue, mobile))
			.orderBy(desc(otpVerifications.createdAt))
			.limit(1);
		assert.ok(firstRow);

		await db
			.update(otpVerifications)
			.set({
				createdAt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS - 5000),
			})
			.where(eq(otpVerifications.id, firstRow.id));

		const second = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(second.devOtp);

		// Previous OTP row must be invalidated (expiresAt <= now)
		const [invalidatedRow] = await db
			.select({ expiresAt: otpVerifications.expiresAt })
			.from(otpVerifications)
			.where(eq(otpVerifications.id, firstRow.id))
			.limit(1);
		assert.ok(invalidatedRow);
		assert.ok(invalidatedRow.expiresAt.getTime() <= Date.now());

		// Old OTP cannot verify (unless by 1-in-1,000,000 chance both equal)
		if (first.devOtp !== second.devOtp) {
			await assert.rejects(
				() =>
					verifyOtp({
						mobile,
						otp: first.devOtp ?? "",
						purpose: "customer_login",
					}),
				(err: unknown) => err instanceof OtpError && err.code === "INVALID",
			);
		}

		// New OTP succeeds
		const verified = await verifyOtp({
			mobile,
			otp: second.devOtp ?? "",
			purpose: "customer_login",
		});
		assert.ok(verified.otpRecordId);
	});

	it("9. Correct OTP succeeds only once", async () => {
		const mobile = uniqueMobile("once");
		const res = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(res.devOtp);

		const firstVerify = await verifyOtp({
			mobile,
			otp: res.devOtp ?? "",
			purpose: "customer_login",
		});
		assert.ok(firstVerify.otpRecordId);

		await assert.rejects(
			() =>
				verifyOtp({
					mobile,
					otp: res.devOtp ?? "",
					purpose: "customer_login",
				}),
			(err: unknown) => err instanceof OtpError && err.code === "EXPIRED",
		);
	});

	it("10. Concurrent verification requests cannot both succeed", async () => {
		const mobile = uniqueMobile("conc");
		const res = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(res.devOtp);

		const results = await Promise.allSettled([
			verifyOtp({
				mobile,
				otp: res.devOtp ?? "",
				purpose: "customer_login",
			}),
			verifyOtp({
				mobile,
				otp: res.devOtp ?? "",
				purpose: "customer_login",
			}),
		]);

		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");

		assert.equal(
			fulfilled.length,
			1,
			"Exactly one concurrent request must succeed",
		);
		assert.equal(
			rejected.length,
			1,
			"Exactly one concurrent request must fail",
		);
	});

	it("11. Customer OTP cannot verify technician registration OTP", async () => {
		const mobile = uniqueMobile("purp");
		const custRes = await requestOtp({ mobile, purpose: "customer_login" });
		assert.ok(custRes.devOtp);

		// Attempting to verify using technician_mobile_verify must fail
		await assert.rejects(
			() =>
				verifyOtp({
					mobile,
					otp: custRes.devOtp ?? "",
					purpose: "technician_mobile_verify",
				}),
			(err: unknown) => err instanceof OtpError && err.code === "EXPIRED",
		);

		// Technician OTP can still be requested independently for the same mobile
		const techRes = await requestOtp({
			mobile,
			purpose: "technician_mobile_verify",
		});
		assert.ok(techRes.devOtp);

		// Customer OTP still works only for customer_login
		const custVerified = await verifyOtp({
			mobile,
			otp: custRes.devOtp ?? "",
			purpose: "customer_login",
		});
		assert.ok(custVerified.otpRecordId);

		// Technician OTP works only for technician_mobile_verify
		const techVerified = await verifyOtp({
			mobile,
			otp: techRes.devOtp ?? "",
			purpose: "technician_mobile_verify",
		});
		assert.ok(techVerified.otpRecordId);
		assert.notEqual(custVerified.otpRecordId, techVerified.otpRecordId);
	});

	it("12. Production uses Verify SMS and checks only the stored challenge", async () => {
		const mobile = uniqueMobile("prod");
		const originalEnv = { ...process.env };
		const originalFetch = globalThis.fetch;

		const calls: { url: string; params: URLSearchParams }[] = [];
		const sid = `VE${"a".repeat(32)}`;
		const serviceSid = `VA${"b".repeat(32)}`;

		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const url = String(input);
			assert.ok(init?.body instanceof URLSearchParams);
			const params = init.body;
			calls.push({ url, params });
			const status =
				url.endsWith("/Verifications") || params.get("Code") !== "123456"
					? "pending"
					: "approved";
			return Response.json(
				{ sid, status, to: `+91${mobile}` },
				{
					status: url.endsWith("/Verifications") ? 201 : 200,
				},
			);
		}) as typeof fetch;

		process.env.NODE_ENV = "production";
		process.env.TWILIO_ACCOUNT_SID = "AC_TEST_MOCK_SID";
		process.env.TWILIO_AUTH_TOKEN = "test_mock_auth_token";
		process.env.TWILIO_VERIFY_SERVICE_SID = serviceSid;

		try {
			const res = await requestOtp({ mobile, purpose: "customer_login" });
			assert.equal(res.success, true);
			assert.equal("devOtp" in res, false);
			assert.equal(res.devOtp, undefined);
			const base = `https://verify.twilio.com/v2/Services/${serviceSid}`;
			assert.equal(calls[0].url, `${base}/Verifications`);
			assert.deepEqual(Object.fromEntries(calls[0].params), {
				To: `+91${mobile}`,
				Channel: "sms",
			});
			await assert.rejects(
				verifyOtp({
					mobile,
					otp: "123456",
					purpose: "technician_mobile_verify",
				}),
				{ code: "EXPIRED" },
			);
			assert.equal(calls.length, 1);
			await assert.rejects(
				verifyOtp({ mobile, otp: "654321", purpose: "customer_login" }),
				{ code: "INVALID" },
			);

			const verified = await verifyOtp({
				mobile,
				otp: "123456",
				purpose: "customer_login",
			});
			assert.ok(verified.otpRecordId);
			assert.equal(calls[2].url, `${base}/VerificationCheck`);
			assert.deepEqual(Object.fromEntries(calls[2].params), {
				VerificationSid: sid,
				Code: "123456",
			});
			await assert.rejects(
				verifyOtp({ mobile, otp: "123456", purpose: "customer_login" }),
				{ code: "EXPIRED" },
			);
			assert.equal(calls.length, 3);

			// Confirm missing Twilio credentials fail closed in production
			delete process.env.TWILIO_AUTH_TOKEN;
			const mobileMissing = uniqueMobile("failclosed");
			await assert.rejects(
				() => requestOtp({ mobile: mobileMissing, purpose: "customer_login" }),
				(err: unknown) => err instanceof OtpError && err.code === "SEND_FAILED",
			);
			const [shouldNotExist] = await db
				.select({ id: otpVerifications.id })
				.from(otpVerifications)
				.where(
					and(
						eq(otpVerifications.contactValue, mobileMissing),
						eq(otpVerifications.purpose, "customer_login"),
					),
				)
				.limit(1);
			assert.equal(shouldNotExist, undefined);
		} finally {
			globalThis.fetch = originalFetch;
			process.env = originalEnv;
		}
	});
});
