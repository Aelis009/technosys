import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AdminLayout } from "#/components/layout/AdminLayout";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { Pagination } from "#/components/ui/Pagination";
import { getEntryState } from "#/server/auth/entry";
import {
	getTechnicianRequests,
	listSchema,
} from "#/server/features/admin/technicians";

export const Route = createFileRoute("/admin/technicians")({
	validateSearch: (search) => listSchema.parse(search),
	beforeLoad: async () => {
		const entry = await getEntryState();
		if (entry.status === "guest") throw redirect({ to: "/technician/login" });
		return { entry };
	},
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.entry.status === "authenticated" &&
		context.entry.user.roles.includes("admin")
			? getTechnicianRequests({ data: deps })
			: null,
	component: TechnicianRequests,
});

function TechnicianRequests() {
	const { entry } = Route.useRouteContext();
	const data = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/admin/technicians" });
	if (
		entry.status !== "authenticated" ||
		!entry.user.roles.includes("admin") ||
		!data
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
	const query = new URLSearchParams({
		search: search.search,
		status: search.status,
		category: search.category,
		page: String(data.page),
	}).toString();
	
	return (
		<AdminLayout user={entry.user} pageTitle="Technician requests">
			<p className="mb-5 text-slate-600">
				Review technician applications and verification status.
			</p>
			<form
				className="mb-5 flex flex-wrap gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					const form = new FormData(event.currentTarget);
					void navigate({
						search: listSchema.parse({
							search: form.get("search"),
							category: form.get("category"),
							status: form.get("status"),
							page: 1,
						}),
					});
				}}
			>
				<input
					key={search.search}
					name="search"
					defaultValue={search.search}
					placeholder="Search name, email or phone"
					aria-label="Search name, email or phone"
					className="min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2"
				/>
				<select
					key={search.category}
					name="category"
					defaultValue={search.category}
					aria-label="Category"
					className="rounded-lg border border-slate-300 bg-white px-3 py-2"
				>
					<option value="">All categories</option>
					{data.categories.map((category) => (
						<option key={category.id} value={category.id}>
							{category.name}
						</option>
					))}
				</select>
				<select
					key={search.status}
					name="status"
					defaultValue={search.status}
					aria-label="Status"
					className="rounded-lg border border-slate-300 bg-white px-3 py-2"
				>
					<option value="pending">Pending</option>
					<option value="approved">Approved</option>
					<option value="rejected">Rejected</option>
					<option value="all">All statuses</option>
				</select>
				<button
					type="submit"
					className="rounded-lg bg-brand-700 px-4 py-2 font-semibold text-white"
				>
					Apply filters
				</button>
			</form>
			<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
				<table className="w-full min-w-[760px] text-left text-sm">
					<thead className="bg-slate-50 text-slate-600">
						<tr>
							{[
								"Technician",
								"Contact",
								"Category",
								"Status",
								"Applied",
								"",
							].map((heading) => (
								<th key={heading} className="px-4 py-3">
									{heading}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{data.rows.map((row) => (
							<tr key={row.id} className="border-t border-slate-100">
								<td className="px-4 py-3">
									<div className="flex items-center gap-3">
										{row.hasPhoto ? (
											<img
												src={`/api/technician/profile-photo/${row.id}`}
												alt=""
												className="h-10 w-10 rounded-full object-cover"
											/>
										) : (
											<span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">
												{(row.name || "?").slice(0, 1).toUpperCase()}
											</span>
										)}
										<span className="font-semibold">
											{row.name || "Unnamed"}
										</span>
									</div>
								</td>
								<td className="px-4 py-3">
									{row.email || "—"}
									<br />
									{row.mobile || "—"}
								</td>
								<td className="px-4 py-3">
									{row.categories.join(", ") || "—"}
								</td>
								<td className="px-4 py-3 capitalize">{row.status}</td>
								<td className="px-4 py-3">
									{new Date(row.createdAt).toLocaleDateString()}
								</td>
								<td className="px-4 py-3">
									<a
										className="font-semibold text-brand-700 underline"
										href={`/admin/technicians/${row.id}?${query}`}
									>
										View
									</a>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{data.rows.length === 0 && (
					<p className="p-6 text-slate-600">No technician requests found.</p>
				)}
			</div>
			<Pagination
				page={data.page}
				totalItems={data.total}
				pageSize={20}
				onPageChange={(page) => void navigate({ search: { ...search, page } })}
			/>
		</AdminLayout>
	);
}
