import { and, asc, count, eq, getTableName, ilike, or, sql } from "drizzle-orm";
import type { db as appDb } from "../../../db/index.ts";
import { serviceCategories, subServiceCategories } from "../../../db/schema.ts";
import {
	CategoryError,
	type CategoryKind,
	type CategoryList,
	type CategorySearch,
	categoryListPattern,
	categoryPageSize,
	getCategoryPage,
	type SaveCategoryInput,
	type SetCategoryStatusInput,
} from "./admin-model.ts";
import {
	cleanupCategoryImage,
	uploadCategoryImage,
	validateCategoryImage,
} from "./category-image.server.ts";

const main = serviceCategories;
const sub = subServiceCategories;
type CategoryDatabase = Omit<typeof appDb, "$client">;
const getDatabase = async () => (await import("../../../db/index.ts")).db;

interface SaveDependencies {
	database?: CategoryDatabase;
	upload?: typeof uploadCategoryImage;
	cleanup?: typeof cleanupCategoryImage;
}

export async function listAdminCategories(
	kind: CategoryKind,
	search: CategorySearch,
	database?: CategoryDatabase,
): Promise<CategoryList> {
	const db = database ?? (await getDatabase());
	const table = kind === "main" ? main : sub;
	const pattern = search.q ? categoryListPattern(search.q) : null;
	const filter = and(
		search.status ? eq(table.isActive, search.status === "active") : undefined,
		kind === "sub" && search.parent
			? eq(sub.categoryId, search.parent)
			: undefined,
		pattern
			? or(ilike(table.name, pattern), ilike(table.description, pattern))
			: undefined,
	);

	return db.transaction(
		async (tx) => {
			const [summary] = await tx
				.select({
					total: count(),
					active:
						sql<number>`count(*) filter (where ${table.isActive})`.mapWith(
							Number,
						),
				})
				.from(table);
			const counts = { ...summary, inactive: summary.total - summary.active };
			const totalItems = filter
				? (await tx.select({ total: count() }).from(table).where(filter))[0]
						.total
				: counts.total;
			const { page, offset } = getCategoryPage(totalItems, search.page);

			const commonFields = {
				id: table.id,
				name: table.name,
				description: table.description,
				imageUrl: table.imageUrl,
				isActive: table.isActive,
			};
			if (kind === "main") {
				const rows = await tx
					.select({
						...commonFields,
						subcategoryCount: sql<number>`(
						select count(*) from ${sub}
						where ${sql.identifier(getTableName(sub))}.${sql.identifier(sub.categoryId.name)}
							= ${sql.identifier(getTableName(main))}.${sql.identifier(main.id.name)}
					)`.mapWith(Number),
					})
					.from(main)
					.where(filter)
					.orderBy(asc(main.name), asc(main.id))
					.limit(categoryPageSize)
					.offset(offset);
				return {
					rows: rows.map((row) => ({ ...row, kind })),
					parents: [],
					counts,
					totalItems,
					page,
				};
			}

			const rows = await tx
				.select({
					...commonFields,
					categoryId: sub.categoryId,
					categoryName: main.name,
					categoryIsActive: main.isActive,
					price: sub.price,
					estimatedDurationMinutes: sub.estimatedDurationMinutes,
					coinsRequired: sub.coinsRequired,
				})
				.from(sub)
				.innerJoin(main, eq(sub.categoryId, main.id))
				.where(filter)
				.orderBy(asc(sub.name), asc(sub.id))
				.limit(categoryPageSize)
				.offset(offset);
			const parents = await tx
				.select({ id: main.id, name: main.name, isActive: main.isActive })
				.from(main)
				.orderBy(asc(main.name), asc(main.id));
			return {
				rows: rows.map((row) => ({ ...row, kind })),
				parents,
				counts,
				totalItems,
				page,
			};
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

function categoryNotFound() {
	return new CategoryError(404, "This category no longer exists.");
}

function categoryWriteError(error: unknown): unknown {
	// Drizzle wraps the driver's error. Do not return SQL, parameters or causes.
	let cause = error;
	for (
		let depth = 0;
		depth < 3 && cause && typeof cause === "object";
		depth++
	) {
		if ("code" in cause) {
			if (cause.code === "23505")
				return new CategoryError(
					409,
					"A category with this name already exists here.",
				);
			if (cause.code === "23503")
				return new CategoryError(400, "Select an existing main category.");
		}
		cause = "cause" in cause ? cause.cause : undefined;
	}
	return error;
}

export async function saveAdminCategory(
	data: SaveCategoryInput,
	file?: File,
	{
		database,
		upload = uploadCategoryImage,
		cleanup = cleanupCategoryImage,
	}: SaveDependencies = {},
) {
	const db = database ?? (await getDatabase());
	const table = data.kind === "main" ? main : sub;
	if (
		data.id &&
		!(
			await db.select({ id: table.id }).from(table).where(eq(table.id, data.id))
		)[0]
	)
		throw categoryNotFound();
	if (
		data.kind === "sub" &&
		!(
			await db
				.select({ id: main.id })
				.from(main)
				.where(eq(main.id, data.categoryId))
		)[0]
	)
		throw new CategoryError(400, "Select an existing main category.");

	const image = file
		? await upload(await validateCategoryImage(file))
		: undefined;
	const common = { name: data.name, updatedAt: new Date(), ...image };
	const subFields =
		data.kind === "sub"
			? {
					categoryId: data.categoryId,
					description: data.description,
					price: data.price,
					estimatedDurationMinutes: data.estimatedDurationMinutes,
					coinsRequired: data.coinsRequired,
				}
			: null;

	let previousPublicId: string | null = null;
	try {
		if (data.id) {
			const id = data.id;
			previousPublicId = await db.transaction(async (tx) => {
				const [current] = await tx
					.select({ imagePublicId: table.imagePublicId })
					.from(table)
					.where(eq(table.id, id))
					.for("update");
				if (!current) throw categoryNotFound();
				if (subFields)
					await tx
						.update(sub)
						.set({ ...common, ...subFields })
						.where(eq(sub.id, id));
				else
					await tx
						.update(main)
						.set({ ...common, description: data.description })
						.where(eq(main.id, id));
				return current.imagePublicId;
			});
		} else if (subFields) {
			await db.insert(sub).values({ ...common, ...subFields });
		} else {
			await db
				.insert(main)
				.values({ ...common, description: data.description });
		}
	} catch (error) {
		if (image) await cleanupUnreferencedImage(db, cleanup, image.imagePublicId);
		throw categoryWriteError(error);
	}
	if (image && previousPublicId)
		await cleanupUnreferencedImage(db, cleanup, previousPublicId);
}

async function cleanupUnreferencedImage(
	db: CategoryDatabase,
	cleanup: typeof cleanupCategoryImage,
	publicId: string,
) {
	// A dropped connection during a write can make the commit outcome unclear.
	// If we can't verify the asset is unreferenced, don't risk breaking the catalog.
	try {
		const [mainReference, subReference] = await Promise.all([
			db
				.select({ id: main.id })
				.from(main)
				.where(eq(main.imagePublicId, publicId))
				.limit(1),
			db
				.select({ id: sub.id })
				.from(sub)
				.where(eq(sub.imagePublicId, publicId))
				.limit(1),
		]);
		if (!mainReference.length && !subReference.length) await cleanup(publicId);
	} catch {
		console.error(
			"Unable to check whether a category image can be cleaned up.",
		);
	}
}

export async function setAdminCategoryStatus(
	data: SetCategoryStatusInput,
	database?: CategoryDatabase,
) {
	const db = database ?? (await getDatabase());
	const table = data.kind === "main" ? main : sub;
	const [updated] = await db
		.update(table)
		.set({ isActive: data.isActive, updatedAt: new Date() })
		.where(eq(table.id, data.id))
		.returning({ id: table.id });
	if (!updated) throw categoryNotFound();
}
