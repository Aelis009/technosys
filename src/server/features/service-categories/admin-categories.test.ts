import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as relations from "../../../db/relations.ts";
import * as schema from "../../../db/schema.ts";
import {
	CategoryError,
	categoryListPattern,
	getCategoryPage,
	maxCategoryImageBytes,
	parseCategorySearch,
	saveMainCategorySchema,
	saveSubcategorySchema,
} from "./admin-model.ts";
import { handleAdminCategoryMutation } from "./admin-request.server.ts";
import {
	listAdminCategories,
	saveAdminCategory,
	setAdminCategoryStatus,
} from "./admin-store.server.ts";
import {
	uploadCategoryImage,
	validateCategoryImage,
} from "./category-image.server.ts";

const id = "cc1bbac7-db63-4f66-8e48-122ea8758c3f";
const origin = "https://technosys.example";
const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
	type: "image/png",
});
const mainInput = { action: "save", kind: "main", name: "  Plumbing  " };
const subInput = {
	action: "save",
	kind: "sub",
	categoryId: id,
	name: "Installation",
	description: "Install a fixture",
	price: "00021.5",
	coinsRequired: "0.5",
};

function request(
	entries: Record<string, string>,
	headers: Record<string, string> = { origin },
) {
	const body = new FormData();
	for (const [name, value] of Object.entries(entries)) body.set(name, value);
	return new Request(`${origin}/api/admin/categories`, {
		method: "POST",
		body,
		headers,
	});
}

function fakeDatabase(
	respond: (text: string, params: unknown[]) => unknown[][] = () => [],
) {
	const queries: { text: string; params: unknown[] }[] = [];
	const client = Object.assign(new Client(), {
		query: async ({ text }: { text: string }, params: unknown[] = []) => {
			queries.push({ text, params });
			return { rows: respond(text, params) };
		},
	});
	const database = drizzle(client, { schema: { ...schema, ...relations } });
	return { database, queries };
}

test("URL query normalization, literal search and page clamping", () => {
	assert.deepEqual(
		parseCategorySearch(
			{
				q: "  A%_\\B  ",
				status: "inactive",
				parent: id.toUpperCase(),
				page: "4",
			},
			"sub",
		),
		{ q: "A%_\\B", status: "inactive", parent: id, page: 4 },
	);
	assert.deepEqual(
		parseCategorySearch({ q: 42, status: "all", parent: id, page: -1 }, "main"),
		{ q: "42", status: undefined, parent: undefined, page: undefined },
	);
	assert.equal(categoryListPattern("A%_\\B"), "%A\\%\\_\\\\B%");
	assert.deepEqual(getCategoryPage(0, 100), { page: 1, offset: 0 });
	assert.deepEqual(getCategoryPage(41, 100), { page: 3, offset: 40 });
});

test("numeric subcategory fields preserve decimal precision and enforce PostgreSQL bounds", () => {
	const valid = saveSubcategorySchema.parse(subInput);
	assert.equal(valid.price, "21.50");
	assert.equal(valid.coinsRequired, "0.50");
	for (const [coinsRequired, expected] of [
		["0", "0.00"],
		["1.25", "1.25"],
		["9999999999.99", "9999999999.99"],
	]) {
		assert.equal(
			saveSubcategorySchema.parse({ ...subInput, coinsRequired }).coinsRequired,
			expected,
		);
	}
	assert.equal(
		saveSubcategorySchema.parse({ ...subInput, price: "9999999999.99" }).price,
		"9999999999.99",
	);
	for (const price of ["-1", "NaN", "1e3", "1.015", "10000000000", ""]) {
		assert.equal(
			saveSubcategorySchema.safeParse({ ...subInput, price }).success,
			false,
		);
	}
	for (const coinsRequired of ["-0.5", "1.005", "10000000000", "1e3", ""]) {
		assert.equal(
			saveSubcategorySchema.safeParse({ ...subInput, coinsRequired }).success,
			false,
		);
	}
	assert.equal(
		saveSubcategorySchema.safeParse({ ...subInput, categoryId: "invalid" })
			.success,
		false,
	);
	assert.equal(saveMainCategorySchema.parse(mainInput).description, null);
});

test("mutation rejects wrong/missing origin and denied roles before reading any form", async () => {
	let guardCalls = 0;
	const deps = {
		requireAdmin: async () => {
			guardCalls++;
			throw new CategoryError(403, "Forbidden.");
		},
		save: async () => {
			assert.fail("unauthorized save");
		},
		setStatus: async () => {
			assert.fail("unauthorized status");
		},
	};
	for (const headers of [
		{},
		{ origin: "https://other.example" },
		{ origin, "sec-fetch-site": "cross-site" },
	]) {
		const response = await handleAdminCategoryMutation(
			request(mainInput, headers as Record<string, string>),
			deps,
		);
		assert.equal(response.status, 403);
	}
	assert.equal(guardCalls, 0);
	const sameOrigin = request(mainInput);
	const denied = await handleAdminCategoryMutation(sameOrigin, deps);
	assert.equal(denied.status, 403);
	assert.equal(sameOrigin.bodyUsed, false);
	assert.equal(guardCalls, 1);
});

test("mutation accepts optional uploads, never accepts client metadata or delete actions", async () => {
	const writes: unknown[] = [];
	const deps = {
		requireAdmin: async () => {},
		save: async (...args: Parameters<typeof saveAdminCategory>) => {
			writes.push(args);
		},
		setStatus: async (...args: Parameters<typeof setAdminCategoryStatus>) => {
			writes.push(args);
		},
	};
	const invalidRequests: Record<string, string>[] = [
		{ ...mainInput, imageUrl: "https://other.example/malicious.png" },
		{ ...mainInput, imagePublicId: "other" },
		{ ...mainInput, image: "https://other.example/malicious.png" },
		{ kind: "main", action: "delete", id },
	];
	for (const fields of invalidRequests) {
		assert.equal(
			(await handleAdminCategoryMutation(request(fields), deps)).status,
			400,
		);
	}
	assert.equal(writes.length, 0);

	const saved = await handleAdminCategoryMutation(request(mainInput), deps);
	assert.deepEqual(await saved.json(), { ok: true });
	assert.equal(saved.headers.get("cache-control"), "private, no-store");
	assert.deepEqual(writes[0], [
		{ kind: "main", action: "save", name: "Plumbing", description: null },
		undefined,
	]);
	const status = await handleAdminCategoryMutation(
		request({ kind: "main", action: "status", id, isActive: "false" }),
		deps,
	);
	assert.equal(status.status, 200);
	assert.deepEqual(writes[1], [
		{ kind: "main", action: "status", id, isActive: false },
	]);

	const form = new FormData();
	for (const [key, value] of Object.entries(subInput)) form.set(key, value);
	form.set("image", pngBlob, "cover.png");
	const uploaded = await handleAdminCategoryMutation(
		new Request(`${origin}/api/admin/categories`, {
			method: "POST",
			body: form,
			headers: { origin },
		}),
		deps,
	);
	assert.equal(uploaded.status, 200);
	assert.equal((writes[2] as [unknown, File])[1].type, "image/png");
});

test("multipart stream is bounded even for a falsely small Content-Length", async () => {
	const req = new Request(`${origin}/api/admin/categories`, {
		method: "POST",
		headers: {
			origin,
			"content-type": "multipart/form-data; boundary=test",
			"content-length": "4",
		},
		body: new Blob([new Uint8Array(maxCategoryImageBytes + 128 * 1024 + 1)]),
	});
	const response = await handleAdminCategoryMutation(req, {
		requireAdmin: async () => {},
		save: async () => {
			assert.fail("oversized save");
		},
		setStatus: async () => {
			assert.fail("oversized status");
		},
	});
	assert.equal(response.status, 413);
});

test("list queries the real schema with stable limits, separate filtered totals and parent relation", async () => {
	const { database, queries } = fakeDatabase((text) => {
		if (text.includes("filter (where")) return [["50", "42"]];
		if (
			text.includes("select count(*)") &&
			text.includes(" where ") &&
			!text.includes("order by")
		)
			return [["22"]];
		if (text.includes("inner join"))
			return [
				[
					id,
					"Install",
					"Description",
					null,
					true,
					id,
					"Parent",
					false,
					"21.50",
					"0.50",
				],
			];
		if (text.startsWith("select")) return [[id, "Parent", false]];
		return [];
	});
	const result = await listAdminCategories(
		"sub",
		{ q: "a_%", status: "active", parent: id, page: 9 },
		database,
	);
	assert.deepEqual(result.counts, { total: 50, active: 42, inactive: 8 });
	assert.equal(result.totalItems, 22);
	assert.equal(result.page, 2);
	const row = result.rows[0];
	assert.equal(row?.kind, "sub");
	assert.equal(row.coinsRequired, "0.50");
	assert.deepEqual(result.parents, [{ id, name: "Parent", isActive: false }]);
	assert.equal(
		queries[0]?.text,
		"begin isolation level repeatable read read only",
	);
	const listing = queries.find(({ text }) => text.includes("inner join"));
	assert.match(
		listing?.text ?? "",
		/"sub_service_categories"\."category_id" = "service_categories"\."id"/,
	);
	assert.deepEqual(listing?.params, [
		true,
		id,
		"%a\\_\\%%",
		"%a\\_\\%%",
		20,
		20,
	]);
});

test("main list obtains database subcategory counts and exposes no Cloudinary public ID", async () => {
	const { database, queries } = fakeDatabase((text) => {
		if (text.includes("filter (where")) return [["1", "0"]];
		if (text.includes("order by"))
			return [[id, "Inactive category", null, null, false, "3"]];
		return [];
	});
	const result = await listAdminCategories("main", {}, database);
	assert.deepEqual(result.rows, [
		{
			kind: "main",
			id,
			name: "Inactive category",
			description: null,
			imageUrl: null,
			isActive: false,
			subcategoryCount: 3,
		},
	]);
	const query = queries.find(({ text }) => text.includes("order by"));
	assert.match(
		query?.text ?? "",
		/from "sub_service_categories"\s+where "sub_service_categories"\."category_id"\s+= "service_categories"\."id"/,
	);
	assert.doesNotMatch(query?.text ?? "", /image_public_id/);
});

test("database saves check parent existence, preserve images on edits, and use updates for status", async () => {
	const missingParent = fakeDatabase();
	await assert.rejects(
		saveAdminCategory(saveSubcategorySchema.parse(subInput), undefined, {
			database: missingParent.database,
		}),
		{ status: 400 },
	);
	assert.equal(missingParent.queries.length, 1);

	const { database, queries } = fakeDatabase((text) =>
		text.startsWith("select") || text.includes("returning") ? [[id]] : [],
	);
	await saveAdminCategory(
		saveSubcategorySchema.parse({ ...subInput, id }),
		undefined,
		{ database },
	);
	await setAdminCategoryStatus(
		{ kind: "main", action: "status", id, isActive: false },
		database,
	);
	const updates = queries.filter(({ text }) => text.startsWith("update"));
	assert.match(updates[0].text, /update "sub_service_categories"/);
	assert.ok(updates[0].params.includes("0.50"));
	assert.doesNotMatch(updates[0].text, /image_(?:url|public_id)|"is_active"/);
	assert.ok(updates[0].params.includes("21.50"));
	assert.match(updates[1].text, /update "service_categories" set "is_active"/);
	assert.equal(updates[1].params[0], false);
	assert.equal(
		queries.some(({ text }) => text.startsWith("delete")),
		false,
	);
});

test("image validation checks MIME and bytes; a provider error prevents a database write", async () => {
	const file = new File([pngBlob], "cover.png", { type: pngBlob.type });
	assert.equal((await validateCategoryImage(file)).format, "png");
	await assert.rejects(
		validateCategoryImage(
			new File(["not png"], "x.png", { type: "image/png" }),
		),
		{ status: 400 },
	);
	await assert.rejects(
		validateCategoryImage(new File([pngBlob], "x.jpg", { type: "image/jpeg" })),
		{ status: 400 },
	);
	const { database, queries } = fakeDatabase();
	await assert.rejects(
		saveAdminCategory(saveMainCategorySchema.parse(mainInput), file, {
			database,
			upload: async () => {
				throw new CategoryError(502, "Could not upload.");
			},
		}),
		{ status: 502 },
	);
	assert.equal(queries.length, 0);
});

test("an uploaded image is cleaned after a rejected write only if it is unreferenced", async () => {
	const image = {
		imagePublicId: "test-id",
		imageUrl: "https://test.example/image.png",
	};
	const file = new File([pngBlob], "cover.png", { type: pngBlob.type });
	for (const isReferenced of [true, false]) {
		const { database } = fakeDatabase((text) => {
			if (text.startsWith("insert"))
				throw Object.assign(new Error("internal pg issue"), { code: "23505" });
			return isReferenced ? [[id]] : [];
		});
		const cleaned: string[] = [];
		await assert.rejects(
			saveAdminCategory(saveMainCategorySchema.parse(mainInput), file, {
				database,
				upload: async () => image,
				cleanup: async (publicId) => {
					if (publicId) cleaned.push(publicId);
				},
			}),
			{
				status: 409,
				message: "A category with this name already exists here.",
			},
		);
		assert.deepEqual(cleaned, isReferenced ? [] : [image.imagePublicId]);
	}
});

test("Cloudinary upload constructs its own metadata and rejects spoofed provider URLs", async () => {
	const config = {
		cloudName: "mock-cloud",
		apiKey: "mock-key",
		apiSecret: "mock-secret",
	};
	const image = await validateCategoryImage(
		new File([pngBlob], "client-name.png", { type: "image/png" }),
	);
	for (const badUrl of [false, true]) {
		let id = "";
		let destroyed = false;
		const provider: typeof fetch = async (endpoint, options) => {
			assert.equal(options?.redirect, "error");
			if (String(endpoint).endsWith("/destroy")) {
				assert.ok(options?.body instanceof URLSearchParams);
				assert.equal(options.body.get("public_id"), id);
				destroyed = true;
				return Response.json({ result: "ok" });
			}
			assert.equal(
				String(endpoint),
				"https://api.cloudinary.com/v1_1/mock-cloud/image/upload",
			);
			assert.ok(options?.body instanceof FormData);
			assert.equal(options.body.get("api_key"), config.apiKey);
			assert.equal(options.body.get("api_secret"), null);
			assert.match(String(options.body.get("signature")), /^[a-f0-9]{40}$/);
			id = String(options.body.get("public_id"));
			assert.match(id, /^technosys\/category-images\/[a-f0-9-]{36}$/);
			return Response.json({
				public_id: id,
				version: 10,
				format: "png",
				bytes: 8,
				type: "upload",
				resource_type: "image",
				secure_url: `https://${badUrl ? "res.cloudinary.com.evil.example" : "res.cloudinary.com"}/mock-cloud/image/upload/v10/${id}.png`,
			});
		};
		if (badUrl) {
			await assert.rejects(uploadCategoryImage(image, config, provider), {
				status: 502,
			});
			assert.equal(destroyed, true);
		} else {
			const result = await uploadCategoryImage(image, config, provider);
			assert.equal(result.imagePublicId, id);
			assert.equal(
				result.imageUrl,
				`https://res.cloudinary.com/mock-cloud/image/upload/v10/${id}.png`,
			);
			assert.equal(destroyed, false);
		}
	}
});
