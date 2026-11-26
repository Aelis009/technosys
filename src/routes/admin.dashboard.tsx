import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "#/components/layout/AdminLayout";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { getEntryState } from "#/server/auth/entry";

export const Route = createFileRoute("/admin/dashboard")({
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		return { entry };
	},
	component: AdminDashboard,
});
function AdminDashboard() {
	const { entry } = Route.useRouteContext();
	if (entry.status === "unavailable")
		return (
			<PublicLayout>
				<p role="alert">Session unavailable. Please try again later.</p>
			</PublicLayout>
		);
	if (entry.status !== "authenticated" || !entry.user.roles.includes("admin"))
		return (
			<PublicLayout>
				<p role="alert">You do not have permission to view this page.</p>
			</PublicLayout>
		);
	return (
		<AdminLayout user={entry.user} pageTitle="Admin dashboard">
			<p>Dashboard features coming soon.</p>
		</AdminLayout>
	);
}
