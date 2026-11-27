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
			<section className="relative isolate grid min-h-80 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 text-center">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 mx-auto aspect-square w-100 max-w-full -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(79,70,229,0.09),transparent_68%)] motion-safe:animate-[request-halo_7s_ease-in-out_infinite]"
				/>
				<div>
					<div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
						<svg
							aria-hidden="true"
							className="size-7"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M4 13l2-7h12l2 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zm0 0h5l1 2h4l1-2h5" />
						</svg>
					</div>
					<h2 className="text-xl font-semibold">No incoming requests</h2>
					<p className="mt-2 text-sm text-slate-600">
						New service requests will appear here.
					</p>
				</div>
			</section>
		</TechnicianLayout>
	);
}
