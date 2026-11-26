import { assertSameOrigin, CsrfError } from "../../auth/csrf.ts";
import { requireCategoryAdmin } from "./admin-access.server.ts";
import {
	CategoryError,
	maxCategoryImageBytes,
	saveMainCategorySchema,
	saveSubcategorySchema,
	setCategoryStatusSchema,
} from "./admin-model.ts";
import {
	saveAdminCategory,
	setAdminCategoryStatus,
} from "./admin-store.server.ts";

const maxBodyBytes = maxCategoryImageBytes + 128 * 1024;

async function readCategoryForm(request: Request) {
	const type = request.headers.get("content-type") ?? "";
	if (!/^multipart\/form-data\s*;/i.test(type))
		throw new CategoryError(415, "Submit the category form as multipart data.");

	const length = request.headers.get("content-length");
	if (length !== null && !/^\d+$/.test(length))
		throw new CategoryError(400, "The category form could not be read.");
	if (length !== null && Number(length) > maxBodyBytes)
		throw new CategoryError(413, "The category form is too large.");
	if (!request.body)
		throw new CategoryError(400, "The category form is empty.");

	const reader = request.body.getReader();
	const chunks: ArrayBuffer[] = [];
	let size = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBodyBytes) {
				void reader.cancel().catch(() => undefined);
				throw new CategoryError(413, "The category form is too large.");
			}
			chunks.push(new Uint8Array(value).buffer);
		}
		return await new Response(new Blob(chunks), {
			headers: { "Content-Type": type },
		}).formData();
	} catch (error) {
		if (error instanceof CategoryError) throw error;
		throw new CategoryError(400, "The category form could not be read.");
	} finally {
		reader.releaseLock();
	}
}

function parseFields(form: FormData) {
	const fields: Record<string, string> = Object.create(null);
	const seen = new Set<string>();
	let image: File | undefined;
	for (const [key, value] of form) {
		if (seen.has(key))
			throw new CategoryError(
				400,
				"The category form contains duplicate fields.",
			);
		seen.add(key);
		if (key === "image") {
			if (typeof value === "string")
				throw new CategoryError(400, "Select an image file, not a URL.");
			if (value.size > 0 || value.name) image = value;
		} else {
			if (typeof value !== "string" || value.includes("\0"))
				throw new CategoryError(
					400,
					"The category form contains an invalid field.",
				);
			fields[key] = value;
		}
	}
	return { fields, image };
}

function categoryResponse(
	body: { ok: true } | { ok: false; message: string },
	status = 200,
) {
	return Response.json(body, {
		status,
		headers: {
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

interface CategoryMutationDependencies {
	requireAdmin: () => Promise<unknown>;
	save: typeof saveAdminCategory;
	setStatus: typeof setAdminCategoryStatus;
}

export async function handleAdminCategoryMutation(
	request: Request,
	deps: CategoryMutationDependencies = {
		requireAdmin: requireCategoryAdmin,
		save: saveAdminCategory,
		setStatus: setAdminCategoryStatus,
	},
) {
	try {
		assertSameOrigin(request);
		await deps.requireAdmin();
		const { fields, image } = parseFields(await readCategoryForm(request));
		if (fields.action === "status") {
			const status = setCategoryStatusSchema.safeParse(fields);
			if (!status.success || image)
				throw new CategoryError(400, "The category status is invalid.");
			await deps.setStatus(status.data);
		} else {
			const schema =
				fields.kind === "sub" ? saveSubcategorySchema : saveMainCategorySchema;
			const result = schema.safeParse(fields);
			if (!result.success)
				throw new CategoryError(
					400,
					result.error.issues[0]?.message ?? "Check the category details.",
				);
			await deps.save(result.data, image);
		}
		return categoryResponse({ ok: true });
	} catch (error) {
		if (error instanceof CsrfError || error instanceof CategoryError)
			return categoryResponse(
				{ ok: false, message: error.message },
				error.status,
			);
		console.error("Unable to save an admin category.");
		return categoryResponse(
			{ ok: false, message: "Could not save the category. Try again." },
			500,
		);
	}
}
