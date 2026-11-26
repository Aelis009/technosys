import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminLayout } from "#/components/layout/AdminLayout";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { getEntryState } from "#/server/auth/entry";
import { getTechnicianCounts } from "#/server/features/admin/technicians";

export const Route = createFileRoute("/admin/dashboard")({
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		return { entry };
	},
	loader: async ({ context }) =>
		context.entry.status === "authenticated" &&
		context.entry.user.roles.includes("admin")
			? getTechnicianCounts()
			: null,
	component: AdminDashboard,
});
function AdminDashboard() {
	const { entry } = Route.useRouteContext();
	const counts = Route.useLoaderData();
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
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<p className="text-slate-600">Technician applications at a glance.</p>
				<a
					href="/admin/technicians"
					className="font-semibold text-brand-700 underline"
				>
					View technician requests
				</a>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{counts &&
					Object.entries(counts).map(([label, value]) => (
						<div
							key={label}
							className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
						>
							<p className="text-sm capitalize text-slate-600">
								{label} technicians
							</p>
							<p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
						</div>
					))}
			</div>
		</AdminLayout>
	);
}
