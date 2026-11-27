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
	component: TechnicianIncomingRequests,
});
function TechnicianIncomingRequests() {
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
			user={{
				...entry.user,
				technicianStatus: entry.profile,
				profileImageUrl: entry.profile?.hasPhoto
					? `/api/technician/profile-photo/${entry.profile.id}`
					: null,
			}}
			pageTitle="Incoming Requests"
		>
			<section className="mb-4 space-y-1 rounded-xl border border-slate-200 bg-white p-5">
				<h2 className="font-semibold">Request handling is coming soon</h2>
				<p className="text-sm text-slate-600">
					Customer service requests will appear here when booking is available.
				</p>
			</section>
			<section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
				{entry.profile?.hasPhoto ? (
					<img
						src={`/api/technician/profile-photo/${entry.profile.id}`}
						alt="Your profile"
						className="h-20 w-20 rounded-full object-cover"
					/>
				) : null}
				<h2 className="text-xl font-semibold">{entry.user.name}</h2>
				<p>
					Service category: {entry.categories.join(", ") || "Not available"}
				</p>
				<p>Approval status: {entry.profile?.verificationStatus}</p>
			</section>
		</TechnicianLayout>
	);
}
