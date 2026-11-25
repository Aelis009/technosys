import { eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { technicianProfiles } from "../../db/schema.ts";
import {
	type AuthenticatedUser,
	AuthorizationError,
	requireRole,
} from "./session.ts";

export interface AuthenticatedTechnician extends AuthenticatedUser {
	technicianProfileId: string;
}

export function canAccessTechnicianDashboard(
	profile: Pick<
		typeof technicianProfiles.$inferSelect,
		"verificationStatus" | "activeStatus"
	>,
): boolean {
	return (
		profile.verificationStatus === "approved" &&
		profile.activeStatus === "active"
	);
}

export async function requireApprovedActiveTechnician(): Promise<AuthenticatedTechnician> {
	const user = await requireRole("technician");

	const [profile] = await db
		.select({
			id: technicianProfiles.id,
			verificationStatus: technicianProfiles.verificationStatus,
			activeStatus: technicianProfiles.activeStatus,
		})
		.from(technicianProfiles)
		.where(eq(technicianProfiles.userId, user.id))
		.limit(1);

	if (!profile || !canAccessTechnicianDashboard(profile)) {
		throw new AuthorizationError();
	}

	return { ...user, technicianProfileId: profile.id };
}
