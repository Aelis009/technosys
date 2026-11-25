import { createServerFn } from "@tanstack/react-start";
import { asc, eq } from "drizzle-orm";

export interface PublicServiceCategory {
	id: string;
	name: string;
	description: string | null;
	imageUrl: string | null;
}

export type PublicServiceCategoriesResult =
	| { ok: true; categories: PublicServiceCategory[] }
	| { ok: false };

export const getPublicServiceCategories = createServerFn({
	method: "GET",
}).handler(async (): Promise<PublicServiceCategoriesResult> => {
	try {
		const { db } = await import("../../../db/index.ts");
		const { serviceCategories } = await import("../../../db/schema.ts");
		const categories = await db
			.select({
				id: serviceCategories.id,
				name: serviceCategories.name,
				description: serviceCategories.description,
				imageUrl: serviceCategories.imageUrl,
			})
			.from(serviceCategories)
			.where(eq(serviceCategories.isActive, true))
			.orderBy(asc(serviceCategories.name), asc(serviceCategories.id));
		return { ok: true, categories };
	} catch {
		console.error("Unable to load public service categories.");
		return { ok: false };
	}
});
