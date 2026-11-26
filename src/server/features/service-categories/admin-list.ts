import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	CategoryError,
	categoryKindSchema,
	parseCategorySearch,
} from "./admin-model.ts";

const listInput = z.object({
	kind: categoryKindSchema,
	search: z.record(z.string(), z.unknown()),
});

export const getAdminCategories = createServerFn({ method: "GET" })
	.validator((input: unknown) => listInput.parse(input))
	.handler(async ({ data }) => {
		const { setResponseHeader } = await import("@tanstack/react-start/server");
		setResponseHeader("Cache-Control", "private, no-store");
		try {
			const { requireCategoryAdmin } = await import("./admin-access.server.ts");
			const user = await requireCategoryAdmin();
			const { listAdminCategories } = await import("./admin-store.server.ts");
			const list = await listAdminCategories(
				data.kind,
				parseCategorySearch(data.search, data.kind),
			).catch(() => {
				console.error("Unable to load admin categories.");
				return null;
			});
			return { status: "admin" as const, user, list };
		} catch (error) {
			if (error instanceof CategoryError && error.status === 401)
				return { status: "guest" as const };
			if (error instanceof CategoryError && error.status === 403)
				return { status: "forbidden" as const };
			console.error("Unable to verify category administration access.");
			return { status: "unavailable" as const };
		}
	});
