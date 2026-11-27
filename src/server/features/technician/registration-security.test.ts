import assert from "node:assert/strict";
import { test } from "node:test";
import { getTechnicianNavItems } from "../../../components/layout/navigation.ts";
import {
	roles,
	serviceCategories,
	technicianDocuments,
	technicianProfiles,
	users,
} from "../../../db/schema.ts";
import { canAccessTechnicianDashboard } from "../../auth/guards.ts";
import { AuthenticationError, AuthorizationError } from "../../auth/session.ts";
import { uploadIdentityDocument } from "../../cloudinary.ts";
import { deliverTechnicianDocument } from "./documentDelivery.ts";
import {
	MAX_IDENTITY_DOCUMENT_BYTES,
	validateIdentityDocument,
} from "./identityDocument.ts";
import { verifyPrivateUploads } from "./privateUploadReadiness.ts";
import {
	registerTechnicianWithIdentityDocument,
	requireRegistrationCloudinary,
	technicianRegistrationFieldsSchema,
} from "./registration.ts";
import {
	handleTechnicianRegistrationRequest,
	readBoundedRequestBody,
} from "./registrationRequest.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

test("identity image MIME, signature and size are checked", () => {
	assert.equal(
		validateIdentityDocument({
			bytes: png,
			mimeType: "image/png",
			fileName: "test.png",
		}).format,
		"png",
	);
	assert.equal(
		validateIdentityDocument({
			bytes: jpeg,
			mimeType: "image/jpeg",
			fileName: "test.jpg",
		}).format,
		"jpg",
	);
	assert.throws(() =>
		validateIdentityDocument({
			bytes: png,
			mimeType: "image/jpeg",
			fileName: "test.jpg",
		}),
	);
	assert.throws(() =>
		validateIdentityDocument({
			bytes: jpeg,
			mimeType: "text/plain",
			fileName: "test.jpg",
		}),
	);
	assert.throws(() =>
		validateIdentityDocument({
			bytes: new Uint8Array([1, 2, 3]),
			mimeType: "image/png",
			fileName: "test.png",
		}),
	);
	assert.throws(() =>
		validateIdentityDocument({
			bytes: new Uint8Array(MAX_IDENTITY_DOCUMENT_BYTES + 1),
			mimeType: "image/png",
			fileName: "test.png",
		}),
	);
});

test("body limit counts actual bytes even with a false length", async () => {
	const request = new Request("https://example.test", {
		method: "POST",
		headers: { "content-length": "1" },
		body: new Uint8Array(11),
	});
	await assert.rejects(readBoundedRequestBody(request, 10), /too large/i);
});

test("multipart endpoint rejects cross-origin and client document metadata", async () => {
	const crossOrigin = await handleTechnicianRegistrationRequest(
		new Request("https://example.test/register", {
			method: "POST",
			headers: { origin: "https://evil.test" },
		}),
	);
	assert.equal(crossOrigin.status, 403);
	assert.equal(crossOrigin.headers.get("cache-control"), "private, no-store");
	const form = new FormData();
	form.set("documentUrl", "https://example.test/untrusted");
	const response = await handleTechnicianRegistrationRequest(
		new Request("https://example.test/register", {
			method: "POST",
			headers: { origin: "https://example.test" },
			body: form,
		}),
	);
	assert.equal(response.status, 400);
	assert.equal((await response.json()).error.code, "CLIENT_DOCUMENT_METADATA");
});

const fields = {
	name: "Fixture Person",
	email: "fixture@example.test",
	password: "password123",
	confirmPassword: "password123",
	mobile: "9876543210",
	mobileVerificationToken: `11111111-1111-4111-8111-111111111111.1900000000000.${"a".repeat(64)}`,
	serviceCategoryId: "11111111-1111-4111-8111-111111111111",
	addressLine: "Flat 12, Green Society",
	area: "Hirabag",
	city: "Surat",
	state: "Gujarat",
	pincode: "395001",
	accountHolderName: "Fixture Person",
	accountNumber: "1234567890",
	ifscCode: "SBIN0001234",
};

test("registration validates required contact, password, address and bank details", () => {
	assert.equal(
		technicianRegistrationFieldsSchema.safeParse(fields).success,
		true,
	);
	for (const [key, value] of Object.entries({
		name: " ",
		email: "invalid",
		mobile: "123",
		mobileVerificationToken: "12345",
		confirmPassword: "different",
		serviceCategoryId: "invalid",
		addressLine: "",
		area: "",
		city: "",
		state: "",
		pincode: "000000",
		accountHolderName: "",
		accountNumber: "123",
		ifscCode: "invalid",
	})) {
		assert.equal(
			technicianRegistrationFieldsSchema.safeParse({ ...fields, [key]: value })
				.success,
			false,
			key,
		);
	}
});

test("optional coordinates are paired, strictly bounded and normalized", () => {
	for (const coordinates of [
		{},
		{ latitude: "", longitude: "" },
		{ latitude: "", longitude: undefined },
	])
		assert.equal(
			technicianRegistrationFieldsSchema.safeParse({
				...fields,
				...coordinates,
			}).success,
			true,
		);
	for (const coordinates of [
		{ latitude: "1" },
		{ longitude: "1" },
		{ latitude: "", longitude: "1" },
		{ latitude: "90.0000000000000001", longitude: "0" },
		{ latitude: "-90.01", longitude: "0" },
		{ latitude: "0", longitude: "180.00001" },
		{ latitude: "NaN", longitude: "0" },
		{ latitude: "1e1", longitude: "0" },
	])
		assert.equal(
			technicianRegistrationFieldsSchema.safeParse({
				...fields,
				...coordinates,
			}).success,
			false,
		);
	const parsed = technicianRegistrationFieldsSchema.parse({
		...fields,
		latitude: "21.17023456",
		longitude: "-180",
	});
	assert.equal(parsed.latitude, "21.1702346");
	assert.equal(parsed.longitude, "-180.0000000");
});

test("incoming requests replace application status for approved active technicians", () => {
	for (const verificationStatus of [
		"pending",
		"rejected",
		"approved",
	] as const) {
		for (const activeStatus of ["active", "inactive", "suspended"] as const) {
			const status = { verificationStatus, activeStatus };
			const allowed =
				verificationStatus === "approved" && activeStatus === "active";
			assert.equal(canAccessTechnicianDashboard(status), allowed);
			const nav = getTechnicianNavItems({
				id: "fixture",
				name: "Fixture",
				roles: ["technician"],
				technicianStatus: status,
			});
			assert.equal(nav[0]?.id, allowed ? "incoming-requests" : "status");
			assert.equal(
				nav.some((item) => item.id === "status"),
				!allowed,
			);
			assert.ok(nav.slice(1).every((item) => item.comingSoon));
		}
	}
});
const config = {
	cloudName: "fixture",
	apiKey: "fixture",
	apiSecret: "fixture",
};
const document = validateIdentityDocument({
	bytes: png,
	mimeType: "image/png",
	fileName: "fixture.png",
});

function makeFake(failTransaction = false, categoryActive = true) {
	const inserts: Array<{ table: unknown; value: Record<string, unknown> }> = [];
	const removals: string[] = [];
	let verified = false;
	const database = {
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: async () =>
						table === roles
							? [{ id: "role" }]
							: table === serviceCategories
								? categoryActive
									? [{ id: fields.serviceCategoryId }]
									: []
								: [],
				}),
			}),
		}),
		transaction: async (run: (tx: unknown) => Promise<void>) => {
			if (failTransaction) throw new Error("fixture transaction failure");
			const tx = {
				select: () => ({
					from: () => ({
						where: () => ({
							limit: () => ({
								for: async () => [{ id: fields.serviceCategoryId }],
							}),
						}),
					}),
				}),
				insert: (table: unknown) => ({
					values: (value: Record<string, unknown>) => {
						inserts.push({ table, value });
						return Object.assign(Promise.resolve(), {
							returning: async () => [
								{ id: table === users ? "user" : "profile" },
							],
						});
					},
				}),
				update: () => ({
					set: () => ({
						where: () => ({ returning: async () => [{ id: "otp" }] }),
					}),
				}),
			};
			await run(tx);
		},
	};
	const deps = {
		database: database as unknown as NonNullable<
			Parameters<typeof registerTechnicianWithIdentityDocument>[1]
		>["database"],
		verify: async (input: { mobile: string; token: string }) => {
			assert.equal(input.mobile, fields.mobile);
			assert.equal(input.token, fields.mobileVerificationToken);
			verified = true;
			return { otpRecordId: "otp" };
		},
		hash: async () => "hash",
		encrypt: () => "encrypted",
		upload: async () => {
			assert.equal(verified, true);
			return {
				publicId: "technosys/technician-documents/fixture",
				secureUrl:
					"https://res.cloudinary.com/fixture/image/authenticated/technosys/technician-documents/fixture.png",
				format: "png" as const,
				bytes: 8,
			};
		},
		uploadPhoto: async () => {
			assert.equal(verified, true);
			return {
				publicId: "technosys/technician-photos/fixture",
				secureUrl:
					"https://res.cloudinary.com/fixture/image/authenticated/technosys/technician-photos/fixture.png",
				format: "png" as const,
				bytes: 8,
			};
		},
		remove: async (_: typeof config, id: string) => {
			removals.push(id);
		},
		requireConfig: async () => config,
	};
	return { deps, inserts, removals };
}

test("valid multipart application uses validated data and provider metadata", async () => {
	const fake = makeFake();
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	form.set("latitude", "21.17023456");
	form.set("longitude", "72.8311");
	form.set("document", new Blob([png], { type: "image/png" }), "fixture.png");
	form.set("profilePhoto", new Blob([png], { type: "image/png" }), "photo.png");
	const response = await handleTechnicianRegistrationRequest(
		new Request("https://example.test/api/technician/register", {
			method: "POST",
			headers: { origin: "https://example.test" },
			body: form,
		}),
		{
			requireConfig: async () => config,
			register: (input) =>
				registerTechnicianWithIdentityDocument(input, fake.deps),
		},
	);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { success: true });
	assert.equal(response.headers.get("set-cookie"), null);
	const profile = fake.inserts.find(
		(entry) => entry.table === technicianProfiles,
	)?.value;
	assert.equal(profile?.verificationStatus, "pending");
	assert.equal(profile?.activeStatus, "active");
	assert.equal(
		profile?.profileImagePublicId,
		"technosys/technician-photos/fixture",
	);
	assert.ok(
		fake.inserts.some(
			({ value }) =>
				value.pincode === "395001" &&
				value.addressLine === fields.addressLine &&
				value.area === fields.area &&
				value.isDefault === true &&
				value.latitude === "21.1702346" &&
				value.longitude === "72.8311000",
		),
	);
	const stored = fake.inserts.find(
		(entry) => entry.table === technicianDocuments,
	)?.value;
	assert.equal(stored?.documentType, "identity");
	assert.equal(
		stored?.cloudinaryPublicId,
		"technosys/technician-documents/fixture",
	);
});

test("transaction failure triggers provider cleanup", async () => {
	const fake = makeFake(true);
	await assert.rejects(
		registerTechnicianWithIdentityDocument(
			{ fields, config, document, profilePhoto: document },
			fake.deps,
		),
		/could not complete/i,
	);
	assert.deepEqual(fake.removals, [
		"technosys/technician-documents/fixture",
		"technosys/technician-photos/fixture",
	]);
});

test("registration readiness requires credentials and successful private delivery", async () => {
	await assert.rejects(
		requireRegistrationCloudinary(() => null),
		/not available/i,
	);
	await assert.rejects(
		requireRegistrationCloudinary(
			() => config,
			async () => false,
		),
		/not available/i,
	);
	assert.equal(
		await requireRegistrationCloudinary(
			() => config,
			async () => true,
		),
		config,
	);
});

test("storage probe requires unsigned denial, correct signed bytes and cleanup", async () => {
	for (const scenario of [
		"private",
		"public",
		"wrong-image",
		"cleanup-failed",
	]) {
		let bytes: Uint8Array = new Uint8Array();
		let cleanups = 0;
		const ready = await verifyPrivateUploads(config, {
			upload: async (image) => {
				bytes = image.bytes;
				return {
					publicId: "technosys/technician-documents/probe",
					secureUrl: "https://example.test/probe.png",
					format: "png",
					bytes: bytes.length,
				};
			},
			request: async () =>
				new Response(null, { status: scenario === "public" ? 200 : 403 }),
			deliver: async () => ({
				bytes: new Uint8Array(scenario === "wrong-image" ? [0] : bytes),
				mime: "image/png",
			}),
			remove: async () => {
				cleanups++;
				if (scenario === "cleanup-failed") throw new Error("test cleanup");
			},
		});
		assert.equal(ready, scenario === "private", scenario);
		assert.equal(cleanups, 1);
	}
});

test("inactive categories are rejected before OTP or upload", async () => {
	const fake = makeFake(false, false);
	let checkedOtp = false;
	const deps = {
		...fake.deps,
		verify: async () => {
			checkedOtp = true;
			throw new Error("unexpected");
		},
	};
	await assert.rejects(
		registerTechnicianWithIdentityDocument(
			{ fields, config, document, profilePhoto: document },
			deps,
		),
		/active service category/i,
	);
	assert.equal(checkedOtp, false);
	assert.equal(fake.inserts.length, 0);
});

test("failed profile photo upload removes the previously uploaded identity image", async () => {
	const fake = makeFake();
	await assert.rejects(
		registerTechnicianWithIdentityDocument(
			{ fields, config, document, profilePhoto: document },
			{
				...fake.deps,
				uploadPhoto: async () => {
					throw new Error("Upload failed");
				},
			},
		),
		/could not complete/i,
	);
	assert.deepEqual(fake.removals, ["technosys/technician-documents/fixture"]);
	assert.equal(fake.inserts.length, 0);
});

test("registration succeeds without a profile photo and does not upload one", async () => {
	const fake = makeFake();
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	form.set("document", new Blob([png], { type: "image/png" }), "fixture.png");
	const response = await handleTechnicianRegistrationRequest(
		new Request("https://example.test/api/technician/register", {
			method: "POST",
			headers: { origin: "https://example.test" },
			body: form,
		}),
		{
			requireConfig: async () => config,
			register: (input) =>
				registerTechnicianWithIdentityDocument(input, {
					...fake.deps,
					uploadPhoto: async () => assert.fail("No profile photo to upload"),
				}),
		},
	);
	assert.equal(response.status, 200);
	const profile = fake.inserts.find(
		({ table }) => table === technicianProfiles,
	);
	assert.equal(profile?.value.profileImagePublicId, null);
});

test("registration rejects missing address or ID proof before touching storage", async () => {
	for (const missing of ["addressLine", "document"]) {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields)) form.set(key, value);
		form.set("document", new Blob([png], { type: "image/png" }), "fixture.png");
		form.set(
			"profilePhoto",
			new Blob([png], { type: "image/png" }),
			"photo.png",
		);
		form.delete(missing);
		const result = await handleTechnicianRegistrationRequest(
			new Request("https://example.test/api/technician/register", {
				method: "POST",
				headers: { origin: "https://example.test" },
				body: form,
			}),
			{
				requireConfig: async () => {
					assert.fail("Storage should not be reached");
				},
				register: async () => {
					assert.fail("Registration should not be reached");
				},
			},
		);
		assert.equal(result.status, 400);
	}
});

test("unavailable storage blocks registration and invalid OTP never uploads", async () => {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	form.set("document", new Blob([png], { type: "image/png" }), "fixture.png");
	form.set("profilePhoto", new Blob([png], { type: "image/png" }), "photo.png");
	const response = await handleTechnicianRegistrationRequest(
		new Request("https://example.test/api/technician/register", {
			method: "POST",
			headers: { origin: "https://example.test" },
			body: form,
		}),
		{
			requireConfig: () => requireRegistrationCloudinary(() => null),
			register: async () => assert.fail("Registration should stay closed"),
		},
	);
	assert.equal(response.status, 503);
	const fake = makeFake();
	let uploaded = false;
	const dependencies = {
		...fake.deps,
		verify: async () => {
			throw new Error("Incorrect OTP");
		},
		upload: async () => {
			uploaded = true;
			throw new Error("unexpected");
		},
	};
	await assert.rejects(
		registerTechnicianWithIdentityDocument(
			{ fields, config, document, profilePhoto: document },
			dependencies,
		),
		/Incorrect OTP/,
	);
	assert.equal(uploaded, false);
});

test("document retrieval checks authorization first and never redirects to provider", async () => {
	let accessed = false;
	const base = {
		find: async () => {
			accessed = true;
			return { publicId: "fixture", url: "https://example.test" };
		},
		fetchDocument: async () => ({
			bytes: new Uint8Array(png),
			mime: "image/png",
		}),
	};
	const id = "11111111-1111-4111-8111-111111111111";
	for (const [error, status] of [
		[new AuthenticationError(), 401],
		[new AuthorizationError(), 403],
	] as const) {
		const response = await deliverTechnicianDocument(id, {
			...base,
			authorize: async () => {
				throw error;
			},
		});
		assert.equal(response.status, status);
		assert.equal(accessed, false);
	}
	const response = await deliverTechnicianDocument(id, {
		...base,
		authorize: async () => undefined,
	});
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("cache-control"), "private, no-store");
	assert.equal(response.headers.get("location"), null);
	assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
});

test("provider adapter uses authenticated upload and cleans up malformed responses", async () => {
	const originalFetch = globalThis.fetch;
	const calls: string[] = [];
	try {
		globalThis.fetch = async (input, init) => {
			const url = String(input);
			calls.push(url);
			if (url.endsWith("/image/upload")) {
				const form = init?.body as FormData;
				assert.equal(form.get("type"), "authenticated");
				assert.match(
					String(form.get("public_id")),
					/^technosys\/technician-documents\//,
				);
				return Response.json({ invalid: true });
			}
			assert.ok(url.endsWith("/image/destroy"));
			const body = new URLSearchParams(String(init?.body));
			assert.equal(body.get("type"), "authenticated");
			return Response.json({ result: "ok" });
		};
		await assert.rejects(
			uploadIdentityDocument({
				config,
				bytes: png,
				mimeType: "image/png",
				format: "png",
			}),
		);
		assert.equal(calls.length, 2);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
