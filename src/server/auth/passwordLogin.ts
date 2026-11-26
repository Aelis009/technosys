import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.ts";
import {
	roles,
	technicianProfiles,
	userRoles,
	users,
} from "../../db/schema.ts";
import { canAccessTechnicianDashboard } from "./guards.ts";
import {
	checkLoginBlock,
	clearLoginAttempts,
	recordFailedAttempt,
} from "./loginAttempts.ts";
import { verifyPassword } from "./password.ts";
import { AuthenticationError, createSession } from "./session.ts";

const loginSchema = z.object({
	email: z.string().trim().email("Enter a valid email address.").toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

export async function loginWithPassword(
	{ email, password }: z.infer<typeof loginSchema>,
	policy: "admin" | "technician" | "either",
) {
	await checkLoginBlock(email);
	const fail = async (): Promise<never> => {
		await recordFailedAttempt(email);
		throw new AuthenticationError("Invalid email or password.");
	};
	const [user] = await db
		.select({
			id: users.id,
			passwordHash: users.passwordHash,
			isActive: users.isActive,
		})
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (
		!user?.passwordHash ||
		!(await verifyPassword(password, user.passwordHash))
	)
		return fail();
	if (!user.isActive)
		throw new AuthenticationError(
			policy === "either"
				? "Invalid email or password."
				: "This account has been deactivated.",
		);
	const assigned = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(eq(userRoles.userId, user.id));
	const hasAdmin = assigned.some((role) => role.name === "admin");
	const hasTechnician = assigned.some((role) => role.name === "technician");
	// A mixed-role account goes to admin on the shared screen; explicit endpoints
	// retain their individual role policies.
	if (
		(policy === "admin" && !hasAdmin) ||
		(policy === "technician" && !hasTechnician) ||
		(policy === "either" && !hasAdmin && !hasTechnician)
	)
		return fail();
	if (policy === "admin" || (policy === "either" && hasAdmin)) {
		await clearLoginAttempts(email);
		await createSession(user.id);
		return { role: "admin" as const };
	}
	const [profile] = await db
		.select({
			verificationStatus: technicianProfiles.verificationStatus,
			activeStatus: technicianProfiles.activeStatus,
			verificationReason: technicianProfiles.verificationReason,
		})
		.from(technicianProfiles)
		.where(eq(technicianProfiles.userId, user.id))
		.limit(1);
	if (!profile)
		throw new AuthenticationError(
			policy === "either"
				? "Invalid email or password."
				: "Technician profile not found. Please contact support.",
		);
	await clearLoginAttempts(email);
	await createSession(user.id);
	return {
		role: "technician" as const,
		technicianStatus: profile,
		canAccessDashboard: canAccessTechnicianDashboard(profile),
	};
}
