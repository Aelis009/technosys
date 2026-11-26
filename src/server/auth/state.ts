import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import type { technicianProfiles } from "../../db/schema.ts";
import type { AuthenticatedUser } from "./session.ts";

type SessionTechnicianStatus = Pick<
	typeof technicianProfiles.$inferSelect,
	"verificationStatus" | "activeStatus" | "verificationReason"
>;

export type AuthState =
	| { status: "guest" }
	| { status: "unavailable" }
	| {
			status: "authenticated";
			user: Pick<AuthenticatedUser, "id" | "name" | "roles">;
			needsCustomerProfile: boolean;
			technicianStatus: SessionTechnicianStatus | null;
			canAccessTechnicianDashboard: boolean;
	  };

export const getAuthState = createServerFn({ method: "GET" }).handler(
	async (): Promise<AuthState> => {
		const { setResponseHeader } = await import("@tanstack/react-start/server");
		setResponseHeader("Cache-Control", "private, no-store");
		try {
			const { getCurrentUser } = await import("./session.ts");
			const currentUser = await getCurrentUser();
			if (!currentUser) return { status: "guest" };

			const { id, name, roles } = currentUser;
			const isTechnician = roles.includes("technician");
			const isCustomerOnly =
				roles.includes("customer") && !roles.includes("admin") && !isTechnician;
			let technicianStatus: SessionTechnicianStatus | null = null;
			let canAccessTechnicianDashboard = false;
			if (isTechnician) {
				const { db } = await import("../../db/index.ts");
				const { technicianProfiles } = await import("../../db/schema.ts");
				const { canAccessTechnicianDashboard: isEligible } = await import(
					"./guards.ts"
				);
				const [profile] = await db
					.select({
						verificationStatus: technicianProfiles.verificationStatus,
						activeStatus: technicianProfiles.activeStatus,
						verificationReason: technicianProfiles.verificationReason,
					})
					.from(technicianProfiles)
					.where(eq(technicianProfiles.userId, id))
					.limit(1);
				technicianStatus = profile ?? null;
				canAccessTechnicianDashboard = !!profile && isEligible(profile);
			}

			return {
				status: "authenticated",
				user: { id, name, roles },
				needsCustomerProfile: isCustomerOnly && !name?.trim(),
				technicianStatus,
				canAccessTechnicianDashboard,
			};
		} catch {
			console.error("Unable to load the current authentication state.");
			return { status: "unavailable" };
		}
	},
);
