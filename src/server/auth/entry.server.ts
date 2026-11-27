import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
	serviceCategories,
	technicianProfiles,
	technicianServiceCategories,
} from "../../db/schema.ts";
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
		const eligible = !!profile && canAccessTechnicianDashboard(profile);
		const categories =
			eligible && profile
				? await db
						.select({ name: serviceCategories.name })
						.from(technicianServiceCategories)
						.innerJoin(
							serviceCategories,
							eq(serviceCategories.id, technicianServiceCategories.categoryId),
						)
						.where(eq(technicianServiceCategories.technicianId, profile.id))
						.orderBy(serviceCategories.name)
				: [];
		return {
			status: "authenticated" as const,
			user: { id: user.id, name: user.name ?? "Account", roles: user.roles },
			profile: profile ?? null,
			eligible,
			categories: categories.map((category) => category.name),
		};
	} catch {
		return { status: "unavailable" as const };
	}
}
