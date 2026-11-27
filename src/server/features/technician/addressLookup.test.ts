import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupAddress, mapAddress } from "./addressLookup.ts";

test("maps only supported address fields and omits missing details", () => {
	assert.deepEqual(
		mapAddress({
			road: " Main Road ",
			suburb: "Example Area",
			town: "Surat",
			state: "Gujarat",
			postcode: "395001",
		}),
		{
			houseNumber: "",
			street: "Main Road",
			area: "Example Area",
			city: "Surat",
			state: "Gujarat",
			pincode: "395001",
		},
	);
	assert.equal(mapAddress({ postcode: "395001-9999" }).pincode, "");
	assert.equal(mapAddress({ state_district: "Surat" }).city, "Surat");
	assert.equal(
		mapAddress({ town: "Bardoli", state_district: "Surat" }).city,
		"Bardoli",
	);
	assert.equal(mapAddress({ state_district: "Ahmedabad" }).city, "");
});

test("treats Laskana as an area of Surat while preserving explicit cities", () => {
	const address = mapAddress({
		village: "Laskana",
		county: "Kamrej Taluka",
		state_district: "Surat",
		state: "Gujarat",
		postcode: "394185",
	});
	assert.equal(address.area, "Laskana");
	assert.equal(address.city, "Surat");
	assert.equal(address.state, "Gujarat");
	assert.equal(address.pincode, "394185");
	assert.equal(
		mapAddress({ city: "Laskana", district: "Surat" }).city,
		"Surat",
	);
	assert.equal(
		mapAddress({ city: "Surat", suburb: "Laskana" }).area,
		"Laskana",
	);
	assert.equal(
		mapAddress({ town: "Bardoli", state_district: "Surat" }).city,
		"Bardoli",
	);
});

test("uses Kamrej as the area and preserves the provider's state and PIN code", () => {
	for (const level of ["village", "town", "city"]) {
		const address = mapAddress({
			[level]: "Kamrej",
			county: "Kamrej Taluka",
			state_district: "Surat",
			state: "Gujarat",
			postcode: "394180",
		});
		assert.equal(address.area, "Kamrej");
		assert.equal(address.city, "Surat");
		assert.equal(address.state, "Gujarat");
		assert.equal(address.pincode, "394180");
	}
});

test("calls only the configured endpoint with the pin and handles failure", async () => {
	const pin = { lat: 21.1492742, lon: 72.7728689 };
	const request: typeof fetch = async (input, options) => {
		const url = new URL(String(input));
		assert.equal(url.origin, "https://geo.example.test");
		assert.equal(url.pathname, "/reverse");
		assert.equal(url.searchParams.get("lon"), "72.7728689");
		assert.equal(url.searchParams.get("lat"), "21.1492742");
		assert.equal(options?.redirect, "error");
		return Response.json({
			display_name: "Test Road, Surat, Gujarat, 395002, India",
			address: {
				road: "Test Road",
				city: "Surat",
				state: "Gujarat",
				postcode: "395002",
			},
		});
	};
	const result = await lookupAddress(
		"https://geo.example.test/reverse",
		pin,
		request,
	);
	assert.equal(result.status, "found");
	if (result.status !== "found") assert.fail("Expected an address preview");
	assert.equal(result.displayName, "Test Road, Surat, Gujarat, 395002, India");
	assert.equal(result.address.street, "Test Road");
	assert.equal(result.address.city, "Surat");
	assert.equal(result.address.pincode, "395002");
	assert.deepEqual(await lookupAddress(undefined, pin, request), {
		status: "not-configured",
	});
	assert.deepEqual(
		await lookupAddress("http://geo.example.test/reverse", pin, request),
		{ status: "unavailable" },
	);
	assert.deepEqual(
		await lookupAddress(
			"https://geo.example.test/reverse",
			pin,
			async () => new Response(null, { status: 429 }),
		),
		{ status: "unavailable" },
	);
});
