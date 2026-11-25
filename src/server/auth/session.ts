import { createHash, randomBytes } from "node:crypto";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { roles, sessions, userRoles, users } from "../../db/schema.ts";
import { getServerEnv } from "../env.ts";
import { assertSameOrigin } from "./csrf.ts";

const sessionCookieName = "technosys_session";
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;

export interface AuthenticatedUser {
	id: string;
	name: string;
	email: string | null;
	mobile: string | null;
	roles: string[];
}

export type AppRole = "admin" | "customer" | "technician";

export class AuthenticationError extends Error {
	readonly status = 401;

	constructor(message = "Authentication is required.") {
		super(message);
		this.name = "AuthenticationError";
	}
}

export class AuthorizationError extends Error {
	readonly status = 403;

	constructor() {
		super("You do not have permission to perform this action.");
		this.name = "AuthorizationError";
	}
}

function hashSessionToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function getSessionCookieOptions() {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "lax" as const,
		secure: getServerEnv().NODE_ENV === "production",
	};
}

function clearSessionCookie(): void {
	deleteCookie(sessionCookieName, getSessionCookieOptions());
}

export async function createSession(userId: string): Promise<void> {
	assertSameOrigin();

	const token = randomBytes(32).toString("base64url");
	const tokenHash = hashSessionToken(token);
	const previousToken = getCookie(sessionCookieName);
	const now = new Date();
	const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1000);

	await db.transaction(async (transaction) => {
		const [user] = await transaction
			.select({ isActive: users.isActive })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!user?.isActive) {
			throw new AuthenticationError("This account is not active.");
		}

		if (previousToken && /^[A-Za-z0-9_-]{43}$/.test(previousToken)) {
			await transaction
				.update(sessions)
				.set({ revokedAt: now })
				.where(
					and(
						eq(sessions.tokenHash, hashSessionToken(previousToken)),
						isNull(sessions.revokedAt),
					),
				);
		}

		await transaction.insert(sessions).values({
			userId,
			tokenHash,
			expiresAt,
		});
	});

	setCookie(sessionCookieName, token, {
		...getSessionCookieOptions(),
		maxAge: sessionLifetimeSeconds,
	});
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
	const token = getCookie(sessionCookieName);
	if (!token) return null;

	if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
		clearSessionCookie();
		return null;
	}

	const now = new Date();
	const [session] = await db
		.select({ id: sessions.id, userId: sessions.userId })
		.from(sessions)
		.where(
			and(
				eq(sessions.tokenHash, hashSessionToken(token)),
				isNull(sessions.revokedAt),
				gt(sessions.expiresAt, now),
			),
		)
		.limit(1);

	if (!session) {
		clearSessionCookie();
		return null;
	}

	const [user] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			mobile: users.mobile,
			isActive: users.isActive,
		})
		.from(users)
		.where(eq(users.id, session.userId))
		.limit(1);

	if (!user?.isActive) {
		await db
			.update(sessions)
			.set({ revokedAt: now })
			.where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)));
		clearSessionCookie();
		return null;
	}

	const roleRows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(eq(userRoles.userId, user.id));

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		mobile: user.mobile,
		roles: roleRows.map((role) => role.name),
	};
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
	const user = await getCurrentUser();
	if (!user) throw new AuthenticationError();
	return user;
}

export async function requireRole(role: AppRole): Promise<AuthenticatedUser> {
	const user = await requireAuthenticatedUser();
	if (!user.roles.includes(role)) throw new AuthorizationError();
	return user;
}

export async function revokeCurrentSession(): Promise<void> {
	assertSameOrigin();

	const token = getCookie(sessionCookieName);
	if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
		await db
			.update(sessions)
			.set({ revokedAt: new Date() })
			.where(
				and(
					eq(sessions.tokenHash, hashSessionToken(token)),
					isNull(sessions.revokedAt),
				),
			);
	}

	clearSessionCookie();
}
