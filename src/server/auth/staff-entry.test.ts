import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defaultSerovalDeserializerPlugins } from "@tanstack/start-client-core";
import { inArray } from "drizzle-orm";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { createServer } from "vite";
import { closeDb, db } from "../../db/index.ts";
import {
	loginAttempts,
	roles,
	technicianProfiles,
	userRoles,
	users,
} from "../../db/schema.ts";
import { getServerEnv } from "../env.ts";
import { hashPassword } from "./password.ts";

test("shared staff login, route guards, rate limit and logout", async (t) => {
	if (getServerEnv().NODE_ENV !== "development")
		throw new Error("Development only");
	const vite = await createServer({
		configFile: false,
		plugins: [tanstackStart()],
		server: { host: "127.0.0.1", port: 0 },
	});
	const emails = ["admin", "approved", "pending", "customer", "mixed"].map(
		(role) => `${role}-${randomUUID()}@technosys.test`,
	);
	const ids: string[] = [];
	t.after(async () => {
		try {
			if (ids.length) await db.delete(users).where(inArray(users.id, ids));
			await db.delete(loginAttempts).where(
				inArray(
					loginAttempts.identifier,
					emails.map((email) =>
						createHash("sha256").update(email).digest("hex"),
					),
				),
			);
		} finally {
			await Promise.all([vite.close(), closeDb()]);
		}
	});
	await vite.listen();
	const origin = new URL(vite.resolvedUrls?.local[0] ?? "").origin;
	const staff = await vite.ssrLoadModule("/src/server/auth/staffLogin.ts");
	const admin = await vite.ssrLoadModule("/src/server/features/admin/auth.ts");
	const roleIds = new Map(
		(await db.select().from(roles)).map((role) => [role.name, role.id]),
	);
	const password = "Isolated-test-password";
	const passwordHash = await hashPassword(password);
	for (const [index, email] of emails.entries()) {
		const [user] = await db
			.insert(users)
			.values({ email, name: `Fixture ${index}`, passwordHash })
			.returning({ id: users.id });
		assert.ok(user);
		ids.push(user.id);
		const assigned =
			index === 0
				? ["admin"]
				: index === 3
					? ["customer"]
					: index === 4
						? ["admin", "technician"]
						: ["technician"];
		for (const role of assigned) {
			const roleId = roleIds.get(role);
			assert.ok(roleId);
			await db.insert(userRoles).values({ userId: user.id, roleId });
		}
		if (assigned.includes("technician"))
			await db.insert(technicianProfiles).values({
				userId: user.id,
				activeStatus: "active",
				verificationStatus: index === 1 ? "approved" : "pending",
			});
	}
	async function call(
		fn: { url: string },
		data: object,
		cookie = "",
		requestOrigin = origin,
	) {
		const response = await fetch(new URL(fn.url, origin), {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-tsr-serverfn": "true",
				origin: requestOrigin,
				cookie,
			},
			body: JSON.stringify(await toJSONAsync({ data })),
		});
		const body = response.headers
			.get("content-type")
			?.includes("application/json")
			? fromCrossJSON<{
					result?: { role?: string; canAccessDashboard?: boolean };
					error?: Error;
				}>(await response.json(), {
					plugins: defaultSerovalDeserializerPlugins,
				})
			: { error: new Error(await response.text()) };
		return {
			...body,
			cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
		};
	}
	async function page(path: string, cookie = "") {
		return fetch(new URL(path, origin), {
			redirect: "manual",
			headers: { cookie },
		});
	}
	for (const [index, email] of emails.entries()) {
		const login = await call(staff.loginStaff, { email, password });
		if (index === 3) {
			assert.ok(login.error);
			continue;
		}
		assert.ifError(login.error);
		assert.ok(login.cookie);
		assert.equal(
			login.result?.role,
			index === 0 || index === 4 ? "admin" : "technician",
		);
		if (index === 1 || index === 2)
			assert.equal(login.result?.canAccessDashboard, index === 1);
		const adminPage = await page("/admin/dashboard", login.cookie);
		assert.equal(
			(await adminPage.text()).includes("Dashboard features coming soon."),
			index === 0 || index === 4,
		);
		const techPage = await page("/technician/dashboard", login.cookie);
		assert.equal(techPage.status === 307, index === 2 || index === 4);
		if (index === 1 || index === 2) {
			const status = await page("/technician/status", login.cookie);
			if (index === 1) {
				assert.equal(status.headers.get("location"), "/technician/dashboard");
				const pageHtml = await techPage.text();
				assert.match(pageHtml, /Incoming Requests/);
				assert.doesNotMatch(pageHtml, /Application status/);
			} else {
				assert.match(await status.text(), /pending/);
			}
		}
		const crossOrigin = await call(
			admin.logoutCurrentUser,
			{},
			login.cookie,
			"http://evil.test",
		);
		assert.ok(crossOrigin.error);
		const logout = await call(admin.logoutCurrentUser, {}, login.cookie);
		assert.ifError(logout.error);
		assert.equal((await page("/admin/dashboard", login.cookie)).status, 307);
	}
	for (let i = 0; i < 6; i++) {
		const attempt = await call(staff.loginStaff, {
			email: emails[0],
			password: "wrong",
		});
		assert.ok(attempt.error);
		if (i < 5) assert.match(attempt.error.message, /Invalid email or password/);
		else assert.match(attempt.error.message, /Too many failed login attempts/);
	}
	assert.equal((await page("/login")).headers.get("location"), "/");
	assert.equal(
		(await page("/technician/status")).headers.get("location"),
		"/technician/login",
	);
});
