import { createFileRoute, redirect } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { TechnicianLayout } from "#/components/layout/TechnicianLayout";
import { UserAvatar } from "#/components/ui/UserAvatar";
import { getEntryState } from "#/server/auth/entry";

export const Route = createFileRoute("/technician/profile")({
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
	component: TechnicianProfile,
});

function TechnicianProfile() {
	const { entry } = Route.useRouteContext();
	if (
		entry.status !== "authenticated" ||
		!entry.user.roles.includes("technician") ||
		!entry.eligible
	)
		return (
			<PublicLayout>
				<p role="alert">
					{entry.status === "unavailable"
						? "Session unavailable. Please try again later."
						: "You do not have permission to view this page."}
				</p>
			</PublicLayout>
		);

	const profileImageUrl = entry.profile?.hasPhoto
		? `/api/technician/profile-photo/${entry.profile.id}`
		: null;
	return (
		<TechnicianLayout
			user={{ ...entry.user, technicianStatus: entry.profile, profileImageUrl }}
			pageTitle="Profile"
		>
			<section className="max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
				<div className="flex items-center gap-4">
					<UserAvatar
						name={entry.user.name}
						imageUrl={profileImageUrl}
						size="lg"
					/>
					<h2 className="text-xl font-semibold">{entry.user.name}</h2>
				</div>
				<dl className="space-y-4 border-t border-slate-200 pt-5">
					<div>
						<dt className="text-sm text-slate-600">Service category</dt>
						<dd className="font-medium">
							{entry.categories.join(", ") || "Not available"}
						</dd>
					</div>
					<div>
						<dt className="text-sm text-slate-600">Approval status</dt>
						<dd className="font-medium capitalize">
							{entry.profile?.verificationStatus}
						</dd>
					</div>
				</dl>
			</section>
		</TechnicianLayout>
	);
}
