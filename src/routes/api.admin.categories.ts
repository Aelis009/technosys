import { createFileRoute } from "@tanstack/react-router";
import { handleAdminCategoryMutation } from "#/server/features/service-categories/admin-request.server";

export const Route = createFileRoute("/api/admin/categories")({
	server: {
		handlers: {
			POST: ({ request }) => handleAdminCategoryMutation(request),
		},
	},
});
