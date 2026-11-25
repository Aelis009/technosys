/**
 * Dev smoke-test for Stage 6 auth backend.
 *
 * Run with:  npm run auth:smoke
 *
 * This script exercises the auth layer directly (bypassing HTTP / cookies).
 * It does NOT test createSession / revokeCurrentSession because those require
 * a live TanStack Start request context (getCookie / setCookie).
 * Instead it verifies the helper functions and DB interactions directly.
 */

import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

import { createHash, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { loginAttempts, otpVerifications, roles, users } from "../db/schema.ts";
import {
	checkLoginBlock,
	clearLoginAttempts,
	recordFailedAttempt,
} from "./auth/loginAttempts.ts";
import { requestOtp, verifyOtp } from "./auth/otp.ts";
import { hashPassword, verifyPassword } from "./auth/password.ts";
import { getServerEnv } from "./env.ts";

if (getServerEnv().NODE_ENV !== "development") {
	throw new Error("Run the auth smoke test against a development database only.");
}

// ─── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
		console.log(`  ✅  ${name}`);
		passed++;
	} catch (error) {
		console.error(
			`  ❌  ${name}`,
			error instanceof Error ? error.message : error,
		);
		failed++;
	}
}

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// Unique suffix per run to avoid collisions
const RUN_ID = Date.now().toString(36);
const TEST_MOBILE = `9${String(randomInt(1_000_000_000)).padStart(9, "0")}`;
const TEST_EMAIL = `smoke_${RUN_ID}@technosys.test`;
const TEST_KEY = createHash("sha256").update(TEST_EMAIL).digest("hex");

// ─── run ──────────────────────────────────────────────────────────────────────

console.log("\n🔬  Technosys – Stage 6 Auth Smoke Tests");
console.log(`    Run ID : ${RUN_ID}`);
console.log(`    Mobile : ${TEST_MOBILE}`);
console.log(`    Email  : ${TEST_EMAIL}\n`);

// 1. DB connectivity
await test("Database connection", async () => {
	const [row] = await db.select({ name: roles.name }).from(roles).limit(1);
	assert(!!row, "No roles found — seed the database first (npm run db:seed)");
});

// 2. Roles seeded
await test("Roles seeded (admin, customer, technician)", async () => {
	const rows = await db.select({ name: roles.name }).from(roles);
	const names = rows.map((r) => r.name);
	assert(names.includes("admin"), "admin role missing");
	assert(names.includes("customer"), "customer role missing");
	assert(names.includes("technician"), "technician role missing");
});

// 3. Password hash / verify round-trip
await test("hashPassword / verifyPassword round-trip", async () => {
	const plain = "Sup3rS3cur3!";
	const hash = await hashPassword(plain);
	assert(hash.startsWith("scrypt$"), "Hash must start with scrypt$");
	const ok = await verifyPassword(plain, hash);
	assert(ok, "verifyPassword returned false for correct password");
	const bad = await verifyPassword("WrongPassword", hash);
	assert(!bad, "verifyPassword returned true for wrong password");
});

// 4. OTP generation + verification (dev mode)
let capturedOtp: string | undefined;
await test("requestOtp – generates OTP in dev mode", async () => {
	const result = await requestOtp({
		mobile: TEST_MOBILE,
		purpose: "customer_login",
	});
	assert(result.success, "requestOtp returned success: false");
	assert(typeof result.devOtp === "string", "devOtp missing in dev mode");
	assert(result.devOtp?.length === 6, "devOtp must be 6 digits");
	capturedOtp = result.devOtp;
});

await test("requestOtp – cooldown enforced (second call within 60s)", async () => {
	try {
		await requestOtp({ mobile: TEST_MOBILE, purpose: "customer_login" });
		assert(false, "Should have thrown OtpError with code COOLDOWN");
	} catch (error) {
		const err = error as { code?: string };
		assert(err.code === "COOLDOWN", `Expected COOLDOWN, got ${err.code}`);
	}
});

await test("verifyOtp – wrong OTP increments attempts", async () => {
	try {
		await verifyOtp({
			mobile: TEST_MOBILE,
			otp: capturedOtp === "000000" ? "000001" : "000000",
			purpose: "customer_login",
		});
		assert(false, "Should have thrown OtpError with code INVALID");
	} catch (error) {
		const err = error as { code?: string };
		assert(err.code === "INVALID", `Expected INVALID, got ${err.code}`);
	}
});

await test("verifyOtp – correct OTP succeeds", async () => {
	assert(typeof capturedOtp === "string", "No OTP captured from previous test");
	if (!capturedOtp) return;
	const result = await verifyOtp({
		mobile: TEST_MOBILE,
		otp: capturedOtp,
		purpose: "customer_login",
	});
	assert(typeof result.otpRecordId === "string", "otpRecordId not returned");
});

// 5. Login-attempts rate limiting
await test("checkLoginBlock – no block initially", async () => {
	await checkLoginBlock(TEST_EMAIL); // should not throw
});

await test("recordFailedAttempt – accumulates correctly", async () => {
	// Record 4 attempts (5th will block)
	for (let i = 0; i < 4; i++) {
		await recordFailedAttempt(TEST_EMAIL);
	}
	const [row] = await db
		.select({
			attempts: loginAttempts.attempts,
			blockedUntil: loginAttempts.blockedUntil,
		})
		.from(loginAttempts)
		.where(eq(loginAttempts.identifier, TEST_KEY))
		.limit(1);
	assert(row?.attempts === 4, `Expected 4 attempts, got ${row?.attempts}`);
	assert(row?.blockedUntil === null, "Should not be blocked yet at 4 attempts");
});

await test("recordFailedAttempt – blocks after 5th attempt", async () => {
	await recordFailedAttempt(TEST_EMAIL);
	try {
		await checkLoginBlock(TEST_EMAIL);
		assert(false, "Should have thrown AuthenticationError");
	} catch (error) {
		const err = error as { name?: string };
		assert(
			err.name === "AuthenticationError",
			`Expected AuthenticationError, got ${err.name}`,
		);
	}
});

await test("clearLoginAttempts – unblocks identifier", async () => {
	await clearLoginAttempts(TEST_EMAIL);
	await checkLoginBlock(TEST_EMAIL); // should not throw
	const [row] = await db
		.select({ attempts: loginAttempts.attempts })
		.from(loginAttempts)
		.where(eq(loginAttempts.identifier, TEST_KEY))
		.limit(1);
	assert(
		row?.attempts === 0,
		`Expected 0 attempts after clear, got ${row?.attempts}`,
	);
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

console.log("\n🧹  Cleaning up test data...");

await db
	.delete(otpVerifications)
	.where(eq(otpVerifications.contactValue, TEST_MOBILE));

await db
	.delete(loginAttempts)
	.where(eq(loginAttempts.identifier, TEST_KEY));

// Clean up any test user (should be none in smoke tests that skip createSession)
const [testUser] = await db
	.select({ id: users.id })
	.from(users)
	.where(eq(users.mobile, TEST_MOBILE))
	.limit(1);

if (testUser) {
	// cascade deletes user_roles, customer_profiles automatically
	await db.delete(users).where(eq(users.id, testUser.id));
}

// ─── summary ──────────────────────────────────────────────────────────────────

console.log(
	`\n${"─".repeat(44)}\n  Results: ${passed} passed, ${failed} failed\n${"─".repeat(44)}\n`,
);

await db.$client.end();
process.exit(failed > 0 ? 1 : 0);
