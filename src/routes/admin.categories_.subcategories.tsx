import { createFileRoute, redirect } from "@tanstack/react-router";
import { CategoryAdminPage } from "#/features/admin/categories/CategoryAdminPage";
import { getAdminCategories } from "#/server/features/service-categories/admin-list";
import { parseCategorySearch } from "#/server/features/service-categories/admin-model";

export const Route = createFileRoute("/admin/categories_/subcategories")({
	validateSearch: (search) => parseCategorySearch(search, "sub"),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const result = await getAdminCategories({
			data: { kind: "sub", search: { ...deps } },
		});
		if (result.status === "guest") throw redirect({ to: "/technician/login" });
		if (
			result.status === "admin" &&
			result.list &&
			result.list.page !== (deps.page ?? 1)
		) {
			throw redirect({
				to: "/admin/categories/subcategories",
				search: {
					...deps,
					page: result.list.page > 1 ? result.list.page : undefined,
				},
				replace: true,
			});
		}
		return result;
	},
	headers: () => ({ "Cache-Control": "private, no-store" }),
	component: SubcategoriesRoute,
});

function SubcategoriesRoute() {
	const result = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<CategoryAdminPage
			kind="sub"
			result={result}
			search={search}
			onSearch={(search) => void navigate({ search })}
		/>
	);
}
