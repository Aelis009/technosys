// Development-only integration checks: npx tsx src/server/auth/closeout-test.ts
import assert from "node:assert/strict";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { createServerEntry } from "@tanstack/react-start/server";
import { defaultSerovalDeserializerPlugins } from "@tanstack/start-client-core";
import { eq, inArray } from "drizzle-orm";
import { fromCrossJSON, toJSONAsync } from "seroval";
import { createServer } from "vite";
import { closeDb, db } from "../../db/index.ts";
import {
	customerProfiles,
	loginAttempts,
	otpVerifications,
	roles,
	serviceCategories,
	sessions,
	technicianProfiles,
	userRoles,
	users,
} from "../../db/schema.ts";
import { getServerEnv } from "../env.ts";
import { requireApprovedActiveTechnician } from "./guards.ts";
import {
	checkLoginBlock,
	clearLoginAttempts,
	recordFailedAttempt,
} from "./loginAttempts.ts";

if (getServerEnv().NODE_ENV !== "development") {
	throw new Error("Run against a development database only.");
}

const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const email = `closeout-${randomUUID()}@technosys.test`;
const rateEmail = `rate-${randomUUID()}@technosys.test`;
const password = "Stage6-Fixture-Password";

test("Stage 6 database and request closeout", async (t) => {
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
			await db
				.delete(loginAttempts)
				.where(
					inArray(loginAttempts.identifier, [
						rateEmail,
						hash(rateEmail),
						hash(email),
					]),
				);
		} finally {
			await Promise.all([vite.close(), closeDb()]);
		}
	});
	await vite.listen();
	const origin = new URL(vite.resolvedUrls?.local[0] ?? "").origin;
	const tech = await vite.ssrLoadModule(
		"/src/server/features/technician/auth.ts",
	);
	const customer = await vite.ssrLoadModule(
		"/src/server/features/customer/auth.ts",
	);
	const { logoutCurrentUser } = await vite.ssrLoadModule(
		"/src/server/features/admin/auth.ts",
	);
	const roleIds = new Map(
		(await db.select().from(roles)).map((role) => [role.name, role.id]),
	);
	const [category] = await db.select().from(serviceCategories).limit(1);
	assert.ok(category);

	async function newMobile() {
		for (;;) {
			const mobile = String(randomInt(9_000_000_000, 10_000_000_000));
			if (mobiles.includes(mobile)) continue;
			const [account, codes] = await Promise.all([
				db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.mobile, mobile))
					.limit(1),
				db
					.select({ id: otpVerifications.id })
					.from(otpVerifications)
					.where(eq(otpVerifications.contactValue, mobile))
					.limit(1),
			]);
			if (account.length || codes.length) continue;
			mobiles.push(mobile);
			return mobile;
		}
	}

	async function call(
		fn: { url: string },
		data: object,
		requestOrigin = origin,
		cookie = "",
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
		type Envelope = {
			error?: Error;
			result?: {
				devOtp?: string;
				isNewUser?: boolean;
				canAccessDashboard?: boolean;
				technicianStatus?: unknown;
			};
		};
		const payload: Envelope = response.headers
			.get("content-type")
			?.includes("application/json")
			? fromCrossJSON<Envelope>(await response.json(), {
					plugins: defaultSerovalDeserializerPlugins,
				})
			: { error: new Error(await response.text()) };
		return {
			...payload,
			status: response.status,
			setCookie: response.headers.get("set-cookie"),
		};
	}

	async function issue(fn: { url: string }, mobile: string): Promise<string> {
		const issued = await call(fn, { mobile: `+91${mobile}` });
		assert.ifError(issued.error);
		const otp = issued.result?.devOtp;
		assert.ok(otp);
		assert.match(otp, /^\d{6}$/);
		return otp;
	}

	const guard = createServerEntry({
		fetch: async () => {
			const technician = await requireApprovedActiveTechnician();
			return Response.json({ userId: technician.id });
		},
	});
	const guardRequest = (cookie: string) =>
		new Request(origin, { headers: { cookie } });
	const techMobile = await newMobile();

	await t.test(
		"registration verifies OTP purpose, mobile, and value; persists pending + active without a session",
		async () => {
			const form = {
				name: "Stage 6 Fixture",
				email,
				password,
				confirmPassword: password,
				mobile: techMobile,
				serviceCategoryId: category.id,
				documentUrl: "https://example.test/id.png",
				documentPublicId: "stage6-fixture",
				documentType: "identity",
				accountHolderName: "Stage 6 Fixture",
				accountNumber: "1234567890",
				ifscCode: "SBIN0001234",
				isMobileVerified: true,
			};
			const omitted = await call(tech.registerTechnician, form);
			assert.match(omitted.error?.message ?? "", /otp/);
			const customerOtp = await issue(
				customer.requestCustomerLoginOtp,
				techMobile,
			);
			const wrongPurpose = await call(tech.registerTechnician, {
				...form,
				otp: customerOtp,
			});
			assert.match(wrongPurpose.error?.message ?? "", /No pending OTP/);
			const otp = await issue(
				tech.requestTechnicianRegistrationOtp,
				techMobile,
			);
			const wrongMobile = await call(tech.registerTechnician, {
				...form,
				mobile: await newMobile(),
				otp,
			});
			assert.match(wrongMobile.error?.message ?? "", /No pending OTP/);
			const wrong = await call(tech.registerTechnician, {
				...form,
				otp: otp === "000000" ? "000001" : "000000",
			});
			assert.match(wrong.error?.message ?? "", /Incorrect OTP/);
			assert.equal(
				(await db.select().from(users).where(eq(users.mobile, techMobile)))
					.length,
				0,
			);
			const rejectedOrigin = await call(
				tech.registerTechnician,
				{ ...form, otp },
				"https://example.test",
			);
			assert.equal(rejectedOrigin.status, 403);
			assert.equal(rejectedOrigin.setCookie, null);
			const registered = await call(tech.registerTechnician, { ...form, otp });
			assert.ifError(registered.error);
			assert.deepEqual(registered.result, { success: true });
			assert.equal(registered.setCookie, null);
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.mobile, techMobile));
			assert.equal(user.isMobileVerified, true);
			const [profile] = await db
				.select()
				.from(technicianProfiles)
				.where(eq(technicianProfiles.userId, user.id));
			assert.equal(profile.verificationStatus, "pending");
			assert.equal(profile.activeStatus, "active");
			assert.equal(
				(await db.select().from(sessions).where(eq(sessions.userId, user.id)))
					.length,
				0,
			);
		},
	);

	await t.test(
		"all nine technician status combinations get real sessions; only approved + active passes the guard",
		async () => {
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.mobile, techMobile));
			assert.ok(user);
			let previousCookie = "";
			for (const verificationStatus of [
				"pending",
				"rejected",
				"approved",
			] as const) {
				for (const activeStatus of [
					"active",
					"inactive",
					"suspended",
				] as const) {
					const allowed =
						verificationStatus === "approved" && activeStatus === "active";
					await db
						.update(technicianProfiles)
						.set({ verificationStatus, activeStatus })
						.where(eq(technicianProfiles.userId, user.id));
					const login = await call(
						tech.loginTechnician,
						{ email: email.toUpperCase(), password },
						origin,
						previousCookie,
					);
					assert.ifError(login.error);
					assert.equal(login.result?.canAccessDashboard, allowed);
					assert.deepEqual(login.result?.technicianStatus, {
						verificationStatus,
						activeStatus,
						verificationReason: null,
					});
					assert.ok(login.setCookie);
					assert.match(login.setCookie, /HttpOnly/i);
					assert.match(login.setCookie, /SameSite=Lax/i);
					const cookie = login.setCookie.split(";", 1)[0];
					const token = cookie.slice(cookie.indexOf("=") + 1);
					const [session] = await db
						.select()
						.from(sessions)
						.where(eq(sessions.tokenHash, hash(token)));
					assert.equal(session.userId, user.id);
					assert.equal(session.revokedAt, null);
					const result = await guard.fetch(guardRequest(cookie));
					assert.equal(result.status, allowed ? 200 : 403);
					if (allowed)
						assert.deepEqual(await result.json(), { userId: user.id });
					if (previousCookie)
						assert.equal(
							(await guard.fetch(guardRequest(previousCookie))).status,
							401,
						);
					previousCookie = cookie;
				}
			}
			const result = await call(logoutCurrentUser, {}, origin, previousCookie);
			assert.ifError(result.error);
			assert.deepEqual(result.result, { success: true });
			assert.match(result.setCookie ?? "", /Max-Age=0/i);
			assert.equal(
				(await guard.fetch(guardRequest(previousCookie))).status,
				401,
			);
			await db
				.update(users)
				.set({ isActive: false })
				.where(eq(users.id, user.id));
			const denied = await call(tech.loginTechnician, { email, password });
			assert.match(denied.error?.message ?? "", /deactivated/);
			assert.equal(denied.setCookie, null);
		},
	);

	await t.test(
		"customer OTP creates a nullable-name customer, repairs a missing profile, and rejects non-customer and mixed roles",
		async () => {
			const mobile = await newMobile();
			const otp = await issue(customer.requestCustomerLoginOtp, mobile);
			const signup = await call(customer.verifyCustomerLoginOtp, {
				mobile,
				otp,
			});
			assert.ifError(signup.error);
			assert.equal(signup.result?.isNewUser, true);
			assert.ok(signup.setCookie);
			assert.match(signup.setCookie, /technosys_session=/);
			assert.equal(
				(await guard.fetch(guardRequest(signup.setCookie.split(";", 1)[0])))
					.status,
				403,
			);
			const [user] = await db
				.select()
				.from(users)
				.where(eq(users.mobile, mobile));
			assert.equal(user.name, null);
			assert.equal(user.passwordHash, null);
			assert.equal(user.isMobileVerified, true);
			const [role] = await db
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, user.id));
			assert.equal(role.roleId, roleIds.get("customer"));
			assert.equal(
				(
					await db
						.select()
						.from(customerProfiles)
						.where(eq(customerProfiles.userId, user.id))
				).length,
				1,
			);
			await db
				.delete(customerProfiles)
				.where(eq(customerProfiles.userId, user.id));
			await db
				.update(otpVerifications)
				.set({ createdAt: new Date(Date.now() - 61_000) })
				.where(eq(otpVerifications.contactValue, mobile));
			const returning = await call(customer.verifyCustomerLoginOtp, {
				mobile,
				otp: await issue(customer.requestCustomerLoginOtp, mobile),
			});
			assert.ifError(returning.error);
			assert.equal(returning.result?.isNewUser, false);
			assert.equal(
				(
					await db
						.select()
						.from(customerProfiles)
						.where(eq(customerProfiles.userId, user.id))
				).length,
				1,
			);

			for (const names of [
				["admin"],
				["technician"],
				["customer", "admin"],
				["customer", "technician"],
			]) {
				const restrictedMobile = await newMobile();
				const [fixture] = await db
					.insert(users)
					.values({ mobile: restrictedMobile })
					.returning({ id: users.id });
				for (const name of names) {
					const roleId = roleIds.get(name);
					assert.ok(roleId);
					await db.insert(userRoles).values({ roleId, userId: fixture.id });
				}
				const restrictedOtp = await issue(
					customer.requestCustomerLoginOtp,
					restrictedMobile,
				);
				const denied = await call(customer.verifyCustomerLoginOtp, {
					mobile: restrictedMobile,
					otp: restrictedOtp,
				});
				assert.match(denied.error?.message ?? "", /different account type/);
				assert.equal(denied.setCookie, null);
				assert.equal(
					(
						await db
							.select()
							.from(sessions)
							.where(eq(sessions.userId, fixture.id))
					).length,
					0,
				);
				assert.equal(
					(
						await db
							.select()
							.from(customerProfiles)
							.where(eq(customerProfiles.userId, fixture.id))
					).length,
					0,
				);
			}
		},
	);

	await t.test(
		"normalized rate-limit writes are hashed and atomic; legacy active blocks still apply",
		async () => {
			await db.insert(loginAttempts).values({
				identifier: rateEmail,
				attempts: 5,
				blockedUntil: new Date(Date.now() + 60_000),
			});
			const variant = ` ${rateEmail.toUpperCase()} `;
			await assert.rejects(checkLoginBlock(variant), /Too many failed/);
			await clearLoginAttempts(variant);
			await checkLoginBlock(rateEmail);
			await Promise.all(
				Array.from({ length: 5 }, () => recordFailedAttempt(variant)),
			);
			const rows = await db
				.select()
				.from(loginAttempts)
				.where(inArray(loginAttempts.identifier, [rateEmail, hash(rateEmail)]));
			assert.equal(rows.length, 1);
			assert.equal(rows[0].identifier, hash(rateEmail));
			assert.equal(rows[0].attempts, 5);
			await assert.rejects(checkLoginBlock(rateEmail), /Too many failed/);
			await clearLoginAttempts(variant);
			await checkLoginBlock(rateEmail);
		},
	);
});
