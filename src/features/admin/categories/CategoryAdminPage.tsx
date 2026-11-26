import { Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AdminLayout } from "#/components/layout/AdminLayout";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { Button } from "#/components/ui/Button";
import {
	FormField,
	SelectInput,
	TextareaInput,
	TextInput,
} from "#/components/ui/FormField";
import { Modal } from "#/components/ui/Modal";
import { Pagination } from "#/components/ui/Pagination";
import { StatusBadge } from "#/components/ui/StatusBadge";
import { useLogout } from "#/features/auth/useLogout";
import type { getAdminCategories } from "#/server/features/service-categories/admin-list";
import {
	type CategoryKind,
	type CategoryList,
	type CategoryOption,
	type CategorySearch,
	categoryPageSize,
	type MainCategoryRow,
	maxCategoryDescriptionLength,
	parseCategorySearch,
	postgresIntMax,
	type SubcategoryRow,
} from "#/server/features/service-categories/admin-model";

type Row = MainCategoryRow | SubcategoryRow;
type CategoryResult = Awaited<ReturnType<typeof getAdminCategories>>;
type Editor = { action: "save"; row?: Row } | { action: "status"; row: Row };

interface CategoryAdminPageProps {
	kind: CategoryKind;
	result: CategoryResult;
	search: CategorySearch;
	onSearch: (search: CategorySearch) => void;
}

const cell = "px-4 py-3 align-middle";

export function CategoryAdminPage({
	kind,
	result,
	search,
	onSearch,
}: CategoryAdminPageProps) {
	const router = useRouter();
	const logout = useLogout();
	const [editor, setEditor] = useState<Editor | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const sub = kind === "sub";
	const singular = sub ? "subcategory" : "main category";
	const title = sub ? "Subcategories" : "Main Categories";

	function open(nextEditor: Editor) {
		setError("");
		setNotice("");
		setEditor(nextEditor);
	}
	function close() {
		if (!saving) setEditor(null);
	}

	async function submit(data: FormData) {
		if (saving || !editor) return;
		data.set("kind", kind);
		setSaving(true);
		setError("");
		try {
			const response = await fetch("/api/admin/categories", {
				method: "POST",
				body: data,
				credentials: "same-origin",
			});
			const payload = await response.json();
			if (!response.ok || payload?.ok !== true) {
				setError(
					typeof payload?.message === "string"
						? payload.message
						: "Could not save the category.",
				);
				return;
			}
			setEditor(null);
			setNotice(
				editor.action === "status"
					? `${editor.row.name} ${editor.row.isActive ? "deactivated" : "activated"}.`
					: `${sub ? "Subcategory" : "Main category"} ${editor.row ? "updated" : "created"}.`,
			);
			try {
				await router.invalidate();
			} catch {
				setNotice("Saved. Refresh the page to update the list.");
			}
		} catch {
			setError("Could not save the category. Try again.");
		} finally {
			setSaving(false);
		}
	}

	if (result.status !== "admin") {
		return (
			<PublicLayout>
				<p role="alert">
					{result.status === "unavailable"
						? "Session unavailable. Please try again later."
						: "You do not have permission to view this page."}
				</p>
			</PublicLayout>
		);
	}

	const list = result.list;
	return (
		<AdminLayout
			user={result.user}
			onLogout={logout.run}
			isLoggingOut={logout.busy}
			pageTitle={title}
			pageDescription={
				sub
					? "Manage the services offered under each main category."
					: "Manage the categories shown in the service catalog."
			}
			pageActions={
				<Button
					disabled={!list || (sub && !list.parents.length)}
					onClick={() => open({ action: "save" })}
				>
					{`Add ${sub ? "subcategory" : "main category"}`}
				</Button>
			}
		>
			{logout.error && (
				<p className="text-sm text-rose-700" role="alert">
					{logout.error}
				</p>
			)}
			{notice && (
				<output className="block text-sm text-emerald-700">{notice}</output>
			)}
			{list ? (
				<>
					<Summary counts={list.counts} />
					{sub && !list.parents.length && (
						<p className="text-sm text-slate-700">
							Create a{" "}
							<Link
								to="/admin/categories"
								className="font-semibold text-brand-700 underline"
							>
								main category
							</Link>{" "}
							first to add subcategories.
						</p>
					)}
					<section
						aria-label={`${title} list`}
						className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					>
						<CategoryFilters
							key={JSON.stringify([search.q, search.status, search.parent])}
							kind={kind}
							search={search}
							parents={list.parents}
							onSearch={onSearch}
						/>
						<CategoryTable kind={kind} list={list} open={open} />
						<Pagination
							page={list.page}
							totalItems={list.totalItems}
							pageSize={categoryPageSize}
							onPageChange={(page) =>
								onSearch({ ...search, page: page > 1 ? page : undefined })
							}
						/>
					</section>
					{editor?.action === "save" && (
						<Modal
							open
							onClose={close}
							closeOnBackdrop={!saving}
							title={`${editor.row ? "Edit" : "Add"} ${singular}`}
						>
							<CategoryForm
								kind={kind}
								row={editor.row}
								parents={list.parents}
								defaultParent={search.parent}
								saving={saving}
								error={error}
								close={close}
								submit={submit}
							/>
						</Modal>
					)}
					{editor?.action === "status" && (
						<Modal
							open
							onClose={close}
							closeOnBackdrop={!saving}
							title={`${editor.row.isActive ? "Deactivate" : "Activate"} ${singular}`}
						>
							<p className="text-sm text-slate-700">
								{editor.row.isActive ? "Deactivate" : "Activate"}{" "}
								<strong>{editor.row.name}</strong>?
								{editor.row.isActive &&
									editor.row.kind === "main" &&
									" It will no longer appear in the public catalog. Subcategory statuses will not change."}
							</p>
							<InlineError message={error} />
							<div className="mt-5 flex justify-end gap-2">
								<Button variant="outline" disabled={saving} onClick={close}>
									Cancel
								</Button>
								<Button
									variant={editor.row.isActive ? "danger" : "primary"}
									isLoading={saving}
									onClick={() => {
										const data = new FormData();
										data.set("action", "status");
										data.set("id", editor.row.id);
										data.set("isActive", String(!editor.row.isActive));
										void submit(data);
									}}
								>
									{editor.row.isActive ? "Deactivate" : "Activate"}
								</Button>
							</div>
						</Modal>
					)}
				</>
			) : (
				<p role="alert" className="text-sm text-rose-700">
					Unable to load categories. Refresh the page to try again.
				</p>
			)}
		</AdminLayout>
	);
}

function Summary({ counts }: { counts: CategoryList["counts"] }) {
	return (
		<dl className="grid grid-cols-3 gap-2 sm:gap-4">
			{(
				[
					["Total", counts.total],
					["Active", counts.active],
					["Inactive", counts.inactive],
				] as const
			).map(([label, value]) => (
				<div
					key={label}
					className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
				>
					<dt className="text-sm font-medium text-slate-600">{label}</dt>
					<dd className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">
						{value.toLocaleString()}
					</dd>
				</div>
			))}
		</dl>
	);
}

function ParentOptions({ parents }: { parents: CategoryOption[] }) {
	return parents.map((parent) => (
		<option key={parent.id} value={parent.id}>
			{parent.name}
			{parent.isActive ? "" : " (inactive)"}
		</option>
	));
}

function CategoryFilters({
	kind,
	search,
	parents,
	onSearch,
}: {
	kind: CategoryKind;
	search: CategorySearch;
	parents: CategoryOption[];
	onSearch: (search: CategorySearch) => void;
}) {
	return (
		<form
			className="flex flex-wrap items-end gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				onSearch(
					parseCategorySearch(
						Object.fromEntries(new FormData(event.currentTarget)),
						kind,
					),
				);
			}}
		>
			<FormField
				id="category-search"
				label="Search"
				className="min-w-40 flex-1"
			>
				<TextInput
					id="category-search"
					name="q"
					type="search"
					defaultValue={search.q}
					maxLength={100}
					placeholder="Name or description"
				/>
			</FormField>
			<FormField id="category-status" label="Status">
				<SelectInput
					id="category-status"
					name="status"
					defaultValue={search.status ?? "all"}
				>
					<option value="all">All statuses</option>
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
				</SelectInput>
			</FormField>
			{kind === "sub" && (
				<FormField id="category-parent" label="Main category">
					<SelectInput
						id="category-parent"
						name="parent"
						defaultValue={search.parent ?? ""}
					>
						<option value="">All main categories</option>
						{search.parent &&
							!parents.some((parent) => parent.id === search.parent) && (
								<option value={search.parent}>Unavailable category</option>
							)}
						<ParentOptions parents={parents} />
					</SelectInput>
				</FormField>
			)}
			<Button type="submit">Apply</Button>
			{(search.q || search.status || search.parent) && (
				<Button variant="ghost" onClick={() => onSearch({})}>
					Clear
				</Button>
			)}
		</form>
	);
}

function CategoryTable({
	kind,
	list,
	open,
}: {
	kind: CategoryKind;
	list: CategoryList;
	open: (editor: Editor) => void;
}) {
	const headings =
		kind === "sub"
			? [
					"Subcategory",
					"Main category",
					"Price",
					"Duration",
					"Coins",
					"Status",
					"Actions",
				]
			: ["Main category", "Subcategories", "Status", "Actions"];
	if (!list.rows.length)
		return (
			<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
				No {kind === "sub" ? "subcategories" : "main categories"} found.
			</p>
		);
	return (
		<div className="overflow-x-auto rounded-xl border border-slate-200">
			<table className="w-full text-left text-sm text-slate-700">
				<thead className="bg-slate-50 text-slate-800">
					<tr>
						{headings.map((label) => (
							<th
								key={label}
								scope="col"
								className={`${cell} whitespace-nowrap font-semibold`}
							>
								{label}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-slate-100">
					{list.rows.map((row) => (
						<tr key={row.id}>
							<th scope="row" className={`${cell} font-normal`}>
								<div className="flex min-w-48 items-center gap-3">
									{row.imageUrl ? (
										<img
											src={row.imageUrl}
											alt=""
											width={40}
											height={40}
											loading="lazy"
											referrerPolicy="no-referrer"
											className="size-10 shrink-0 rounded-lg bg-slate-100 object-cover"
										/>
									) : (
										<span
											className="size-10 shrink-0 rounded-lg bg-slate-100"
											aria-hidden="true"
										/>
									)}
									<div className="min-w-0">
										<p className="font-semibold text-slate-900 wrap-anywhere">
											{row.name}
										</p>
										{row.description && (
											<p className="line-clamp-2 wrap-anywhere text-xs text-slate-500">
												{row.description}
											</p>
										)}
									</div>
								</div>
							</th>
							{row.kind === "main" ? (
								<td className={cell}>
									<Link
										className="font-semibold text-brand-700 underline"
										to="/admin/categories/subcategories"
										search={{ parent: row.id }}
										aria-label={`View ${row.subcategoryCount} subcategories under ${row.name}`}
									>
										{row.subcategoryCount}
									</Link>
								</td>
							) : (
								<>
									<td className={cell}>
										{row.categoryName}
										{row.categoryIsActive ? "" : " (inactive)"}
									</td>
									<td className={`${cell} tabular-nums`}>{row.price}</td>
									<td className={`${cell} whitespace-nowrap tabular-nums`}>
										{row.estimatedDurationMinutes} min
									</td>
									<td className={`${cell} tabular-nums`}>
										{row.coinsRequired}
									</td>
								</>
							)}
							<td className={cell}>
								<StatusBadge status={row.isActive ? "active" : "inactive"} />
							</td>
							<td className={cell}>
								<div className="flex gap-1 whitespace-nowrap">
									<Button
										variant="ghost"
										size="sm"
										aria-label={`Edit ${row.name}`}
										onClick={() => open({ action: "save", row })}
									>
										Edit
									</Button>
									<Button
										variant="outline"
										size="sm"
										aria-label={`${row.isActive ? "Deactivate" : "Activate"} ${row.name}`}
										onClick={() => open({ action: "status", row })}
									>
										{row.isActive ? "Deactivate" : "Activate"}
									</Button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function InlineError({ message }: { message: string }) {
	return message ? (
		<p role="alert" className="mt-3 text-sm text-rose-700">
			{message}
		</p>
	) : null;
}

function CategoryForm({
	kind,
	row,
	parents,
	defaultParent,
	saving,
	error,
	close,
	submit,
}: {
	kind: CategoryKind;
	row?: Row;
	parents: CategoryOption[];
	defaultParent?: string;
	saving: boolean;
	error: string;
	close: () => void;
	submit: (data: FormData) => Promise<void>;
}) {
	const [fileKey, setFileKey] = useState(0);
	const [hasFile, setHasFile] = useState(false);
	const sub = row?.kind === "sub" ? row : undefined;
	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		if (!hasFile) data.delete("image");
		data.set("action", "save");
		if (row) data.set("id", row.id);
		void submit(data);
	}
	return (
		<form onSubmit={onSubmit}>
			<fieldset disabled={saving} className="space-y-4">
				{kind === "sub" && (
					<FormField id="edit-category-parent" label="Main category" required>
						<SelectInput
							id="edit-category-parent"
							name="categoryId"
							required
							defaultValue={sub?.categoryId ?? defaultParent ?? ""}
						>
							<option value="">Select a main category</option>
							<ParentOptions parents={parents} />
						</SelectInput>
					</FormField>
				)}
				<FormField id="edit-category-name" label="Name" required>
					<TextInput
						id="edit-category-name"
						name="name"
						required
						maxLength={kind === "sub" ? 200 : 100}
						defaultValue={row?.name}
					/>
				</FormField>
				<FormField
					id="edit-category-description"
					label="Description"
					required={kind === "sub"}
				>
					<TextareaInput
						id="edit-category-description"
						name="description"
						required={kind === "sub"}
						maxLength={maxCategoryDescriptionLength}
						defaultValue={row?.description ?? ""}
					/>
				</FormField>
				{kind === "sub" && (
					<div className="grid gap-3 sm:grid-cols-3">
						<FormField id="edit-category-price" label="Price" required>
							<TextInput
								id="edit-category-price"
								name="price"
								inputMode="decimal"
								pattern="[0-9]{1,10}(\.[0-9]{1,2})?"
								required
								defaultValue={sub?.price}
							/>
						</FormField>
						<FormField
							id="edit-category-duration"
							label="Duration (minutes)"
							required
						>
							<TextInput
								id="edit-category-duration"
								name="estimatedDurationMinutes"
								type="number"
								min={1}
								max={postgresIntMax}
								step={1}
								required
								defaultValue={sub?.estimatedDurationMinutes}
							/>
						</FormField>
						<FormField id="edit-category-coins" label="Coins required" required>
							<TextInput
								id="edit-category-coins"
								name="coinsRequired"
								type="number"
								min={0}
								max={postgresIntMax}
								step={1}
								required
								defaultValue={sub?.coinsRequired}
							/>
						</FormField>
					</div>
				)}
				<FormField
					id="edit-category-image"
					label={
						row?.imageUrl ? "Replace image (optional)" : "Image (optional)"
					}
					hint={
						row?.imageUrl
							? "JPG or PNG, up to 5 MB. Leave empty to keep the current image."
							: "JPG or PNG, up to 5 MB."
					}
				>
					<TextInput
						key={fileKey}
						id="edit-category-image"
						name="image"
						type="file"
						accept="image/jpeg,image/png"
						aria-describedby="edit-category-image-hint"
						onChange={(event) =>
							setHasFile(Boolean(event.currentTarget.files?.length))
						}
					/>
					{hasFile && (
						<Button
							variant="ghost"
							size="sm"
							className="self-start"
							onClick={() => {
								setHasFile(false);
								setFileKey((key) => key + 1);
							}}
						>
							Clear selected image
						</Button>
					)}
				</FormField>
			</fieldset>
			<InlineError message={error} />
			<div className="mt-5 flex justify-end gap-2">
				<Button variant="outline" disabled={saving} onClick={close}>
					Cancel
				</Button>
				<Button type="submit" isLoading={saving}>
					{row ? "Save changes" : "Create"}
				</Button>
			</div>
		</form>
	);
}
