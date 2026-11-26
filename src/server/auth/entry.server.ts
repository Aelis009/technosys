import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { technicianProfiles } from "../../db/schema.ts";
import { canAccessTechnicianDashboard } from "./guards.ts";
import { getCurrentUser } from "./session.ts";

export async function entryState() {
	const { setResponseHeader } = await import("@tanstack/react-start/server");
	setResponseHeader("Cache-Control", "private, no-store");
	try {
		const user = await getCurrentUser();
		if (!user) return { status: "guest" as const };
		let profile = null;
		if (user.roles.includes("technician")) {
			[profile] = await db
				.select({
					id: technicianProfiles.id,
					hasPhoto: sql<boolean>`${technicianProfiles.profileImagePublicId} is not null`,
					verificationStatus: technicianProfiles.verificationStatus,
					activeStatus: technicianProfiles.activeStatus,
					verificationReason: technicianProfiles.verificationReason,
				})
				.from(technicianProfiles)
				.where(eq(technicianProfiles.userId, user.id))
				.limit(1);
		}
		return {
			status: "authenticated" as const,
			user: { id: user.id, name: user.name ?? "Account", roles: user.roles },
			profile: profile ?? null,
			eligible: !!profile && canAccessTechnicianDashboard(profile),
		};
	} catch {
		return { status: "unavailable" as const };
	}
}
