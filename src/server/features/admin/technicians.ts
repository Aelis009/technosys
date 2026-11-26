import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

async function requireAdmin() {
	const { setResponseHeader } = await import("@tanstack/react-start/server");
	const { requireRole } = await import("../../auth/session.ts");
	setResponseHeader("Cache-Control", "private, no-store");
	return requireRole("admin");
}

export const listSchema = z.object({
	search: z.string().trim().max(100).catch(""),
	status: z.enum(["all", "pending", "approved", "rejected"]).catch("pending"),
	category: z.union([z.literal(""), z.string().uuid()]).catch(""),
	page: z.coerce.number().int().min(1).max(100000).catch(1),
});
export const reviewSchema = z
	.object({
		id: z.string().uuid(),
		decision: z.enum(["approved", "rejected"]),
		reason: z.string().trim().max(1000),
	})
	.refine((value) => value.decision !== "rejected" || value.reason.length > 0, {
		message: "A rejection reason is required.",
	});

export const getTechnicianCounts = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		const { db } = await import("../../../db/index.ts");
		const { technicianProfiles } = await import("../../../db/schema.ts");
		const rows = await db
			.select({ status: technicianProfiles.verificationStatus, total: count() })
			.from(technicianProfiles)
			.groupBy(technicianProfiles.verificationStatus);
		return {
			total: rows.reduce((n, row) => n + row.total, 0),
			pending: rows.find((row) => row.status === "pending")?.total ?? 0,
			approved: rows.find((row) => row.status === "approved")?.total ?? 0,
			rejected: rows.find((row) => row.status === "rejected")?.total ?? 0,
		};
	},
);

export const getTechnicianRequests = createServerFn({ method: "GET" })
	.validator((raw: unknown) => listSchema.parse(raw))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { db } = await import("../../../db/index.ts");
		const {
			users,
			technicianProfiles: p,
			technicianServiceCategories: tsc,
			serviceCategories: c,
		} = await import("../../../db/schema.ts");
		const escaped = data.search.replace(/[\\%_]/g, "\\$&");
		const where = and(
			data.status === "all" ? undefined : eq(p.verificationStatus, data.status),
			data.search
				? or(
						ilike(users.name, `%${escaped}%`),
						ilike(users.email, `%${escaped}%`),
						ilike(users.mobile, `%${escaped}%`),
					)
				: undefined,
			data.category
				? sql`exists (select 1 from ${tsc} where ${tsc.technicianId} = ${p.id} and ${tsc.categoryId} = ${data.category})`
				: undefined,
		);
		const [totals, categories] = await Promise.all([
			db
				.select({ total: count() })
				.from(p)
				.innerJoin(users, eq(users.id, p.userId))
				.where(where),
			db.select({ id: c.id, name: c.name }).from(c).orderBy(c.name),
		]);
		const total = totals[0]?.total ?? 0;
		const page = Math.min(data.page, Math.max(1, Math.ceil(total / 20)));
		const rows = await db
			.select({
				id: p.id,
				name: users.name,
				email: users.email,
				mobile: users.mobile,
				hasPhoto: sql<boolean>`${p.profileImagePublicId} is not null`,
				status: p.verificationStatus,
				createdAt: p.createdAt,
			})
			.from(p)
			.innerJoin(users, eq(users.id, p.userId))
			.where(where)
			.orderBy(desc(p.createdAt), desc(p.id))
			.limit(20)
			.offset((page - 1) * 20);
		const links = rows.length
			? await db
					.select({ technicianId: tsc.technicianId, name: c.name })
					.from(tsc)
					.innerJoin(c, eq(c.id, tsc.categoryId))
					.where(
						inArray(
							tsc.technicianId,
							rows.map((row) => row.id),
						),
					)
			: [];
		return {
			rows: rows.map((row) => ({
				...row,
				categories: links
					.filter((link) => link.technicianId === row.id)
					.map((link) => link.name),
			})),
			total,
			page,
			categories,
		};
	});

export const getTechnicianRequest = createServerFn({ method: "GET" })
	.validator((raw: unknown) => z.string().uuid().parse(raw))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { db } = await import("../../../db/index.ts");
		const {
			users,
			technicianProfiles: p,
			technicianDocuments: d,
			technicianServiceCategories: tsc,
			serviceCategories: c,
			technicianBankDetails: bank,
			addresses,
		} = await import("../../../db/schema.ts");
		const [profile] = await db
			.select({
				id: p.id,
				name: users.name,
				email: users.email,
				mobile: users.mobile,
				hasPhoto: sql<boolean>`${p.profileImagePublicId} is not null`,
				dateOfBirth: p.dateOfBirth,
				gender: p.gender,
				status: p.verificationStatus,
				reason: p.verificationReason,
				reviewer: p.approvedBy,
				reviewedAt: p.approvedAt,
				createdAt: p.createdAt,
			})
			.from(p)
			.innerJoin(users, eq(users.id, p.userId))
			.where(eq(p.id, data))
			.limit(1);
		if (!profile) return null;
		const [documents, categories, banks, addressRows] = await Promise.all([
			db
				.select({
					id: d.id,
					type: d.documentType,
					status: d.verificationStatus,
					reviewedAt: d.reviewedAt,
					reviewedBy: d.reviewedBy,
					reason: d.rejectionReason,
				})
				.from(d)
				.where(eq(d.technicianId, data)),
			db
				.select({ name: c.name })
				.from(tsc)
				.innerJoin(c, eq(c.id, tsc.categoryId))
				.where(eq(tsc.technicianId, data)),
			db
				.select({
					accountHolderName: bank.accountHolderName,
					ifscCode: bank.ifscCode,
				})
				.from(bank)
				.where(eq(bank.technicianId, data))
				.limit(1),
			db
				.select({
					houseNumber: addresses.houseNumber,
					street: addresses.street,
					area: addresses.area,
					city: addresses.city,
					state: addresses.state,
					pincode: addresses.pincode,
				})
				.from(addresses)
				.innerJoin(p, eq(p.userId, addresses.userId))
				.where(and(eq(p.id, data), eq(addresses.isDefault, true)))
				.limit(1),
		]);
		return {
			...profile,
			documents,
			categories: categories.map((row) => row.name),
			bank: banks[0] ?? null,
			address: addressRows[0] ?? null,
		};
	});

export const reviewTechnicianRequest = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => reviewSchema.parse(raw))
	.handler(async ({ data }) => {
		const reviewer = await requireAdmin();
		const { db } = await import("../../../db/index.ts");
		const { technicianProfiles: p, technicianDocuments: d } = await import(
			"../../../db/schema.ts"
		);
		const now = new Date();
		const reason = data.decision === "rejected" ? data.reason : null;
		return db.transaction(async (tx) => {
			const updated = await tx
				.update(p)
				.set({
					verificationStatus: data.decision,
					verificationReason: reason,
					approvedBy: reviewer.id,
					approvedAt: now,
					updatedAt: now,
				})
				.where(
					and(
						eq(p.id, data.id),
						eq(p.verificationStatus, "pending"),
						data.decision === "approved"
							? sql`exists (select 1 from ${d} where ${d.technicianId} = ${p.id})`
							: undefined,
					),
				)
				.returning({ id: p.id });
			if (!updated.length) return { success: false as const };
			await tx
				.update(d)
				.set({
					verificationStatus: data.decision,
					rejectionReason: reason,
					reviewedBy: reviewer.id,
					reviewedAt: now,
					updatedAt: now,
				})
				.where(eq(d.technicianId, data.id));
			return { success: true as const };
		});
	});
