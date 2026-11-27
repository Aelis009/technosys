import { createFileRoute, redirect } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { TechnicianLayout } from "#/components/layout/TechnicianLayout";
import { getEntryState } from "#/server/auth/entry";

export const Route = createFileRoute("/technician/status")({
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		if (
			entry.status === "authenticated" &&
			entry.user.roles.includes("technician") &&
			entry.eligible
		)
			throw redirect({ to: "/technician/dashboard" });
		return { entry };
	},
	component: TechnicianStatus,
});
function TechnicianStatus() {
	const { entry } = Route.useRouteContext();
	if (entry.status === "unavailable")
		return (
			<PublicLayout>
				<p role="alert">Session unavailable. Please try again later.</p>
			</PublicLayout>
		);
	if (
		entry.status !== "authenticated" ||
		!entry.user.roles.includes("technician")
	)
		return (
			<PublicLayout>
				<p role="alert">You do not have permission to view this page.</p>
			</PublicLayout>
		);
	return (
		<TechnicianLayout
			user={{
				...entry.user,
				technicianStatus: entry.profile,
				profileImageUrl: entry.profile?.hasPhoto
					? `/api/technician/profile-photo/${entry.profile.id}`
					: null,
			}}
			pageTitle="Technician status"
		>
			{entry.profile ? (
				<div>
					<p>Verification: {entry.profile.verificationStatus}</p>
					<p>Account status: {entry.profile.activeStatus}</p>
					{entry.profile.verificationReason ? (
						<p>Reason: {entry.profile.verificationReason}</p>
					) : null}
				</div>
			) : (
				<p>Profile unavailable. Please contact support.</p>
			)}
		</TechnicianLayout>
	);
}
