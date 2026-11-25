/**
 * Login-attempt rate-limiting service.
 *
 * Uses the `login_attempts` table to track failures by hashed identifier.
 * After 5 failed attempts the identifier is blocked for 15 minutes.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { loginAttempts } from "../../db/schema.ts";
import { AuthenticationError } from "./session.ts";

const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function normalizeIdentifier(identifier: string): string {
	return identifier.trim().toLowerCase();
}

function identifierKey(identifier: string): string {
	return createHash("sha256")
		.update(normalizeIdentifier(identifier))
		.digest("hex");
}

/**
 * Throws `AuthenticationError` if the identifier is currently blocked.
 * Call this BEFORE checking credentials.
 */
export async function checkLoginBlock(identifier: string): Promise<void> {
	const key = identifierKey(identifier);
	const now = new Date();

	const [row] = await db
		.select({ blockedUntil: loginAttempts.blockedUntil })
		.from(loginAttempts)
		// Keep active blocks from versions that stored plaintext identifiers.
		.where(
			and(
				inArray(loginAttempts.identifier, [
					key,
					normalizeIdentifier(identifier),
				]),
				isNotNull(loginAttempts.blockedUntil),
			),
		)
		.orderBy(desc(loginAttempts.blockedUntil))
		.limit(1);

	if (row?.blockedUntil && row.blockedUntil > now) {
		const minutesLeft = Math.ceil(
			(row.blockedUntil.getTime() - now.getTime()) / 60_000,
		);
		throw new AuthenticationError(
			`Too many failed login attempts. Try again in ${minutesLeft} minute(s).`,
		);
	}
}

/**
 * Records a failed login attempt.
 * Upserts the row; blocks the identifier if attempts reach `MAX_ATTEMPTS`.
 */
export async function recordFailedAttempt(identifier: string): Promise<void> {
	const key = identifierKey(identifier);
	const now = new Date();

	// Count concurrent failures in one statement rather than reading and overwriting.
	const nextAttempts = sql`${loginAttempts.attempts} + 1`;
	const blockUntil = new Date(now.getTime() + BLOCK_DURATION_MS).toISOString();
	await db
		.insert(loginAttempts)
		.values({ identifier: key, attempts: 1 })
		.onConflictDoUpdate({
			target: loginAttempts.identifier,
			set: {
				attempts: nextAttempts,
				blockedUntil: sql`case when ${nextAttempts} >= ${MAX_ATTEMPTS}
					then greatest(${loginAttempts.blockedUntil}, ${blockUntil}::timestamptz)
					else ${loginAttempts.blockedUntil} end`,
				updatedAt: now,
			},
		});
}

/**
 * Resets the attempt counter after a successful login.
 */
export async function clearLoginAttempts(identifier: string): Promise<void> {
	const key = identifierKey(identifier);
	const now = new Date();
	const legacy = normalizeIdentifier(identifier);
	if (legacy !== key) {
		await db.delete(loginAttempts).where(eq(loginAttempts.identifier, legacy));
	}

	await db
		.update(loginAttempts)
		.set({ attempts: 0, blockedUntil: null, updatedAt: now })
		.where(eq(loginAttempts.identifier, key));
}
