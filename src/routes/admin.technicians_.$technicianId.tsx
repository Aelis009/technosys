import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AdminLayout } from "#/components/layout/AdminLayout";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { getEntryState } from "#/server/auth/entry";
import {
	getTechnicianRequest,
	listSchema,
	reviewTechnicianRequest,
} from "#/server/features/admin/technicians";

export const Route = createFileRoute("/admin/technicians_/$technicianId")({
	validateSearch: (search) => listSchema.parse(search),
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		return { entry };
	},
	loader: ({ context, params }) =>
		context.entry.status === "authenticated" &&
		context.entry.user.roles.includes("admin") &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			params.technicianId,
		)
			? getTechnicianRequest({ data: params.technicianId })
			: null,
	component: TechnicianRequestDetail,
});

function TechnicianRequestDetail() {
	const { entry } = Route.useRouteContext();
	const request = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const [reason, setReason] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	if (entry.status !== "authenticated" || !entry.user.roles.includes("admin"))
		return (
			<PublicLayout>
				<p role="alert">
					{entry.status === "unavailable"
						? "Session unavailable. Please try again later."
						: "You do not have permission to view this page."}
				</p>
			</PublicLayout>
		);
	const query = new URLSearchParams({
		...search,
		page: String(search.page),
	}).toString();
	async function review(decision: "approved" | "rejected") {
		if (!request || busy) return;
		if (decision === "rejected" && !reason.trim()) {
			setMessage("Enter a rejection reason.");
			return;
		}
		setBusy(true);
		setMessage("");
		try {
			const result = await reviewTechnicianRequest({
				data: { id: request.id, decision, reason },
			});
			setMessage(
				result.success
					? `Application ${decision}.`
					: "This application is no longer pending or is missing identity proof.",
			);
			await router.invalidate();
		} catch {
			setMessage("Unable to review this application. Please try again.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<AdminLayout user={entry.user} pageTitle="Technician request">
			<a
				href={`/admin/technicians?${query}`}
				className="mb-5 inline-block font-semibold text-brand-700 underline"
			>
				← Back to requests
			</a>
			{!request ? (
				<p role="alert">Technician request not found.</p>
			) : (
				<div className="grid gap-5 lg:grid-cols-3">
					<div className="space-y-5 lg:col-span-2">
						<section className="rounded-xl border border-slate-200 bg-white p-6">
							<div className="mb-5 flex items-center gap-4">
								{request.hasPhoto ? (
									<img
										src={`/api/technician/profile-photo/${request.id}`}
										alt=""
										className="h-16 w-16 rounded-full object-cover"
									/>
								) : (
									<span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-700">
										{(request.name || "?").slice(0, 1).toUpperCase()}
									</span>
								)}
								<div>
									<h2 className="text-xl font-bold">
										{request.name || "Unnamed"}
									</h2>
									<p className="capitalize text-slate-600">{request.status}</p>
								</div>
							</div>
							<dl className="grid gap-4 sm:grid-cols-2">
								{[
									["Email", request.email],
									["Phone", request.mobile],
									["Category", request.categories.join(", ")],
									["Date of birth", request.dateOfBirth],
									["Gender", request.gender],
									[
										"Address",
										request.address
											? Object.values(request.address).join(", ")
											: null,
									],
									["Applied", new Date(request.createdAt).toLocaleDateString()],
									["Account holder", request.bank?.accountHolderName],
									["IFSC", request.bank?.ifscCode],
								].map(([label, value]) => (
									<div key={label}>
										<dt className="text-sm text-slate-500">{label}</dt>
										<dd className="font-medium">{value || "—"}</dd>
									</div>
								))}
							</dl>
						</section>
						<section className="rounded-xl border border-slate-200 bg-white p-6">
							<h2 className="mb-3 text-lg font-bold">Identity documents</h2>
							{request.documents.length ? (
								<ul className="space-y-3">
									{request.documents.map((document) => (
										<li key={document.id}>
											<a
												className="font-semibold text-brand-700 underline"
												href={`/api/admin/technician-documents/${document.id}`}
												target="_blank"
												rel="noreferrer"
											>
												View {document.type}
											</a>{" "}
											<span className="capitalize text-slate-600">
												({document.status})
											</span>
											<img
												src={`/api/admin/technician-documents/${document.id}`}
												alt={`${document.type} submitted for identity review`}
												loading="lazy"
												className="mt-2 max-h-64 max-w-full rounded-lg object-contain"
											/>
										</li>
									))}
								</ul>
							) : (
								<p>No identity documents available.</p>
							)}
						</section>
					</div>
					<section className="h-fit rounded-xl border border-slate-200 bg-white p-6">
						<h2 className="mb-3 text-lg font-bold">Review</h2>
						{request.status === "pending" ? (
							<>
								<label htmlFor="reason" className="text-sm font-medium">
									Rejection reason
								</label>
								<textarea
									id="reason"
									value={reason}
									onChange={(event) => setReason(event.target.value)}
									maxLength={1000}
									className="mt-2 block w-full rounded-lg border border-slate-300 p-3"
									placeholder="Required when rejecting"
								/>
								<div className="mt-4 flex flex-wrap gap-2">
									<button
										type="button"
										disabled={busy || request.documents.length === 0}
										onClick={() => void review("approved")}
										className="rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
									>
										Approve
									</button>
									<button
										type="button"
										disabled={busy}
										onClick={() => void review("rejected")}
										className="rounded-lg border border-red-700 px-4 py-2 font-semibold text-red-700 disabled:opacity-50"
									>
										Reject
									</button>
								</div>
							</>
						) : (
							<>
								<p className="capitalize">{request.status}</p>
								{request.reason && (
									<p className="mt-2">Reason: {request.reason}</p>
								)}
								<p className="mt-2 text-sm text-slate-600">
									Reviewer: {request.reviewer || "Unavailable"}
									<br />
									Reviewed:{" "}
									{request.reviewedAt
										? new Date(request.reviewedAt).toLocaleString()
										: "Unavailable"}
								</p>
							</>
						)}
						{message && <output className="mt-4 block">{message}</output>}
					</section>
				</div>
			)}
		</AdminLayout>
	);
}
