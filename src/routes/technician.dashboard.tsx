import { createFileRoute, redirect } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { TechnicianLayout } from "#/components/layout/TechnicianLayout";
import { getEntryState } from "#/server/auth/entry";

export const Route = createFileRoute("/technician/dashboard")({
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		if (
			entry.status === "authenticated" &&
			entry.user.roles.includes("technician") &&
			!entry.eligible
		)
			throw redirect({ to: "/technician/status" });
		return { entry };
	},
	component: TechnicianDashboard,
});
function TechnicianDashboard() {
	const { entry } = Route.useRouteContext();
	if (entry.status === "unavailable")
		return (
			<PublicLayout>
				<p role="alert">Session unavailable. Please try again later.</p>
			</PublicLayout>
		);
	if (
		entry.status !== "authenticated" ||
		!entry.user.roles.includes("technician") ||
		!entry.eligible
	)
		return (
			<PublicLayout>
				<p role="alert">You do not have permission to view this page.</p>
			</PublicLayout>
		);
	return (
		<TechnicianLayout
			user={{ ...entry.user, technicianStatus: entry.profile }}
			pageTitle="Technician dashboard"
		>
			<p>Dashboard features coming soon.</p>
		</TechnicianLayout>
	);
}
