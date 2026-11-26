// Development-only request and database integration test: npx tsx src/server/features/customer/profile.test.ts
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { test } from "node:test";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defaultSerovalDeserializerPlugins } from "@tanstack/start-client-core";
import { eq, inArray } from "drizzle-orm";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { createServer } from "vite";
import { closeDb, db } from "../../../db/index.ts";
import {
	otpVerifications,
	roles,
	userRoles,
	users,
} from "../../../db/schema.ts";
import { getServerEnv } from "../../env.ts";

if (getServerEnv().NODE_ENV !== "development")
	throw new Error("Run against a development database only.");

test("customer signup, profile, returning session, role and CSRF boundaries", async (t) => {
	const mobiles: string[] = [];
	const vite = await createServer({
		configFile: false,
		plugins: [tanstackStart()],
		server: { host: "127.0.0.1", port: 0 },
	});
	t.after(async () => {
		try {
			if (mobiles.length) {
				await db
					.delete(otpVerifications)
					.where(inArray(otpVerifications.contactValue, mobiles));
				await db.delete(users).where(inArray(users.mobile, mobiles));
			}
		} finally {
			await Promise.all([vite.close(), closeDb()]);
		}
	});
	await vite.listen();
	const origin = new URL(vite.resolvedUrls?.local[0] ?? "").origin;
	const customer = await vite.ssrLoadModule(
		"/src/server/features/customer/auth.ts",
	);
	const profile = await vite.ssrLoadModule(
		"/src/server/features/customer/profile.ts",
	);
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
		const payload = response.headers
			.get("content-type")
			?.includes("application/json")
			? fromCrossJSON<{
					error?: Error;
					result?: { devOtp?: string; isNewUser?: boolean; success?: boolean };
				}>(await response.json(), {
					plugins: defaultSerovalDeserializerPlugins,
				})
			: { error: new Error(await response.text()) };
		return {
			...payload,
			status: response.status,
			cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
		};
	}
	let mobile: string;
	for (;;) {
		mobile = String(randomInt(9_000_000_000, 10_000_000_000));
		if (
			!(await db.select().from(users).where(eq(users.mobile, mobile))).length &&
			!(
				await db
					.select()
					.from(otpVerifications)
					.where(eq(otpVerifications.contactValue, mobile))
			).length
		)
			break;
	}
	mobiles.push(mobile);
	const issued = await call(customer.requestCustomerLoginOtp, { mobile });
	assert.ok(issued.result?.devOtp);
	const verified = await call(customer.verifyCustomerLoginOtp, {
		mobile,
		otp: issued.result.devOtp,
	});
	assert.equal(verified.result?.isNewUser, true);
	assert.ok(verified.cookie);
	const [user] = await db.select().from(users).where(eq(users.mobile, mobile));
	assert.equal(user.name, null);
	const guest = await call(profile.saveCustomerName, { name: "Guest" });
	assert.ok(guest.error || guest.status >= 400);
	const crossOrigin = await call(
		profile.saveCustomerName,
		{ name: "Invalid" },
		verified.cookie,
		"https://example.test",
	);
	assert.equal(crossOrigin.status, 403);
	const invalid = await call(
		profile.saveCustomerName,
		{ name: "   " },
		verified.cookie,
	);
	assert.ok(invalid.error || invalid.status >= 400);
	const spoof = await call(
		profile.saveCustomerName,
		{ name: "Spoof", userId: user.id },
		verified.cookie,
	);
	assert.ok(spoof.error || spoof.status >= 400);
	const saved = await call(
		profile.saveCustomerName,
		{ name: "  Test Customer  " },
		verified.cookie,
	);
	assert.equal(saved.result?.success, true);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, user.id)))[0].name,
		"Test Customer",
	);
	// Advance only this fixture's cooldown so a returning login needs no sleep.
	await db
		.update(otpVerifications)
		.set({ createdAt: new Date(Date.now() - 120_000) })
		.where(eq(otpVerifications.contactValue, mobile));
	const reissued = await call(customer.requestCustomerLoginOtp, { mobile });
	assert.ok(reissued.result?.devOtp);
	const returning = await call(customer.verifyCustomerLoginOtp, {
		mobile,
		otp: reissued.result.devOtp,
	});
	assert.equal(returning.result?.isNewUser, false);
	assert.ok(returning.cookie);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, user.id)))[0].name,
		"Test Customer",
	);
	const [admin] = await db.select().from(roles).where(eq(roles.name, "admin"));
	assert.ok(admin);
	await db.insert(userRoles).values({ userId: user.id, roleId: admin.id });
	const mixed = await call(
		profile.saveCustomerName,
		{ name: "Forbidden" },
		returning.cookie,
	);
	assert.ok(mixed.error || mixed.status >= 400);
	assert.equal(
		(await db.select().from(users).where(eq(users.id, user.id)))[0].name,
		"Test Customer",
	);
	await db
		.delete(userRoles)
		.where(eq(userRoles.userId, user.id))
		.then(async () => {
			const [customerRole] = await db
				.select()
				.from(roles)
				.where(eq(roles.name, "customer"));
			await db
				.insert(userRoles)
				.values({ userId: user.id, roleId: customerRole.id });
		});
	const again = await call(
		profile.saveCustomerName,
		{ name: "Returning Customer" },
		returning.cookie,
	);
	assert.equal(again.result?.success, true);
});
