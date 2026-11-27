import { z } from "zod";

export const categoryPageSize = 20;
export const maxCategoryImageBytes = 5 * 1024 * 1024;
export const maxCategoryDescriptionLength = 4000;

export const categoryKindSchema = z.enum(["main", "sub"]);
export type CategoryKind = z.infer<typeof categoryKindSchema>;
const categoryIdSchema = z.guid().toLowerCase();
const statusSchema = z.enum(["all", "active", "inactive"]);
export type CategoryStatusFilter = z.infer<typeof statusSchema>;

export interface CategorySearch {
	q?: string;
	status?: Exclude<CategoryStatusFilter, "all">;
	parent?: string;
	page?: number;
}

export function parseCategorySearch(
	raw: Record<string, unknown>,
	kind: CategoryKind,
): CategorySearch {
	// TanStack's default URL parser can deserialize a numeric search term.
	const q =
		typeof raw.q === "string" ||
		typeof raw.q === "number" ||
		typeof raw.q === "boolean"
			? String(raw.q).trim().slice(0, 100).replaceAll("\0", "")
			: "";
	const status = statusSchema.safeParse(raw.status).data;
	const parent =
		kind === "sub" ? categoryIdSchema.safeParse(raw.parent).data : undefined;
	const page =
		typeof raw.page === "number" ||
		(typeof raw.page === "string" && /^\d+$/.test(raw.page))
			? Number(raw.page)
			: 1;
	return {
		q: q || undefined,
		status: status === "all" ? undefined : status,
		parent,
		page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
	};
}

export function categoryListPattern(q: string): string {
	return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

export function getCategoryPage(totalItems: number, requestedPage = 1) {
	const page = Math.max(
		1,
		Math.min(requestedPage, Math.ceil(totalItems / categoryPageSize)),
	);
	return { page, offset: (page - 1) * categoryPageSize };
}

const description = z.string().trim().max(maxCategoryDescriptionLength);
const fields = {
	id: categoryIdSchema.optional(),
	action: z.literal("save"),
};
const decimalAmount = (label: string) =>
	z
		.string()
		.regex(
			/^\d{1,10}(?:\.\d{1,2})?$/,
			`Enter a nonnegative ${label} with up to 10 whole digits and 2 decimal places.`,
		)
		.transform((value) => {
			const [whole, fraction = ""] = value.split(".");
			return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
		});

export const saveMainCategorySchema = z.strictObject({
	...fields,
	kind: z.literal("main"),
	name: z.string().trim().min(1, "Enter a name.").max(100),
	description: description.optional().transform((value) => value || null),
});

export const saveSubcategorySchema = z.strictObject({
	...fields,
	kind: z.literal("sub"),
	categoryId: categoryIdSchema,
	name: z.string().trim().min(1, "Enter a name.").max(200),
	description: description.min(1, "Enter a description."),
	price: decimalAmount("price"),
	coinsRequired: decimalAmount("coin amount"),
});

export const setCategoryStatusSchema = z.strictObject({
	action: z.literal("status"),
	kind: categoryKindSchema,
	id: categoryIdSchema,
	isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type SaveCategoryInput =
	| z.infer<typeof saveMainCategorySchema>
	| z.infer<typeof saveSubcategorySchema>;
export type SetCategoryStatusInput = z.infer<typeof setCategoryStatusSchema>;

interface CategoryRow {
	id: string;
	name: string;
	description: string | null;
	imageUrl: string | null;
	isActive: boolean;
}

export interface MainCategoryRow extends CategoryRow {
	kind: "main";
	subcategoryCount: number;
}

export interface SubcategoryRow extends CategoryRow {
	kind: "sub";
	categoryId: string;
	categoryName: string;
	categoryIsActive: boolean;
	price: string;
	coinsRequired: string;
}

export interface CategoryOption {
	id: string;
	name: string;
	isActive: boolean;
}

export interface CategoryList {
	rows: Array<MainCategoryRow | SubcategoryRow>;
	parents: CategoryOption[];
	counts: { total: number; active: number; inactive: number };
	totalItems: number;
	page: number;
}

export class CategoryError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "CategoryError";
	}
}
