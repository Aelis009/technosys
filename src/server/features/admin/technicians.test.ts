import assert from "node:assert/strict";
import { test } from "node:test";
import { listSchema, reviewSchema } from "./technicians.ts";

const id = "813d9a42-07f4-4519-9cde-97de9d511870";

test("request filters default to pending and bound pagination", () => {
	assert.deepEqual(listSchema.parse({}), {
		search: "",
		status: "pending",
		category: "",
		page: 1,
	});
	assert.deepEqual(
		listSchema.parse({
			search: "  Jane  ",
			status: "all",
			category: id,
			page: "2",
		}),
		{ search: "Jane", status: "all", category: id, page: 2 },
	);
	assert.equal(
		listSchema.parse({ page: "-1", category: "invalid", status: "invalid" })
			.page,
		1,
	);
	assert.equal(listSchema.parse({ category: "invalid" }).category, "");
});

test("review requires a valid id and a nonblank reason for rejection", () => {
	assert.equal(
		reviewSchema.safeParse({ id, decision: "rejected", reason: "   " }).success,
		false,
	);
	assert.equal(
		reviewSchema.parse({
			id,
			decision: "rejected",
			reason: "  Unreadable ID  ",
		}).reason,
		"Unreadable ID",
	);
	assert.equal(
		reviewSchema.safeParse({ id, decision: "approved", reason: "" }).success,
		true,
	);
	assert.equal(
		reviewSchema.safeParse({ id: "invalid", decision: "approved", reason: "" })
			.success,
		false,
	);
	assert.equal(
		reviewSchema.safeParse({ id, decision: "pending", reason: "" }).success,
		false,
	);
});
