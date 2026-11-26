import { randomUUID } from "node:crypto";
import {
	type CloudinaryConfig,
	createCloudinarySignature,
	getCloudinaryConfig,
} from "../../cloudinary.ts";
import { CategoryError, maxCategoryImageBytes } from "./admin-model.ts";

const uploadsPath = "technosys/category-images";
const ownedPublicId = /^technosys\/category-images\/[0-9a-f-]{36}$/;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
const jpegSignature = [255, 216, 255];

interface CategoryImageFile {
	bytes: Uint8Array;
	format: "png" | "jpg";
}

export interface StoredCategoryImage {
	imageUrl: string;
	imagePublicId: string;
}

export async function validateCategoryImage(
	file: File,
): Promise<CategoryImageFile> {
	if (file.size > maxCategoryImageBytes)
		throw new CategoryError(413, "Choose an image no larger than 5 MB.");

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (
		file.type === "image/png" &&
		pngSignature.every((byte, index) => bytes[index] === byte)
	)
		return { bytes, format: "png" };
	if (
		file.type === "image/jpeg" &&
		jpegSignature.every((byte, index) => bytes[index] === byte)
	)
		return { bytes, format: "jpg" };
	throw new CategoryError(400, "Choose a valid JPG or PNG image.");
}

function providerEndpoint(cloudName: string, action: "upload" | "destroy") {
	return `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/${action}`;
}

function timestamp() {
	return String(Math.floor(Date.now() / 1000));
}

export async function cleanupCategoryImage(
	publicId: string | null,
	config = getCloudinaryConfig(),
	request = fetch,
) {
	if (!publicId || !ownedPublicId.test(publicId) || !config) return;
	const fields = {
		invalidate: "true",
		public_id: publicId,
		timestamp: timestamp(),
		type: "upload",
	};
	try {
		const response = await request(
			providerEndpoint(config.cloudName, "destroy"),
			{
				method: "POST",
				redirect: "error",
				body: new URLSearchParams({
					...fields,
					api_key: config.apiKey,
					signature: createCloudinarySignature(fields, config.apiSecret),
				}),
				signal: AbortSignal.timeout(5000),
			},
		);
		if (!response.ok) throw new Error();
		const payload = await response.json();
		if (payload?.result !== "ok" && payload?.result !== "not found")
			throw new Error();
	} catch {
		console.error("Unable to clean up a category image.");
	}
}

function validateUploadResponse(
	payload: unknown,
	config: CloudinaryConfig,
	publicId: string,
	format: CategoryImageFile["format"],
): StoredCategoryImage {
	if (!payload || typeof payload !== "object") throw new Error();
	const data = payload as Record<string, unknown>;
	if (
		data.public_id !== publicId ||
		data.resource_type !== "image" ||
		data.type !== "upload" ||
		data.format !== format ||
		typeof data.bytes !== "number" ||
		!Number.isSafeInteger(data.bytes) ||
		data.bytes <= 0 ||
		data.bytes > maxCategoryImageBytes ||
		typeof data.version !== "number" ||
		!Number.isSafeInteger(data.version) ||
		data.version <= 0
	)
		throw new Error();
	const imageUrl = `https://res.cloudinary.com/${config.cloudName}/image/upload/v${data.version}/${publicId}.${format}`;
	if (data.secure_url !== imageUrl) throw new Error();
	return { imageUrl, imagePublicId: publicId };
}

export async function uploadCategoryImage(
	file: CategoryImageFile,
	config = getCloudinaryConfig(),
	request = fetch,
): Promise<StoredCategoryImage> {
	if (!config)
		throw new CategoryError(
			503,
			"Image upload is unavailable. Try again or save without a new image.",
		);

	const publicId = `${uploadsPath}/${randomUUID()}`;
	const fields = {
		allowed_formats: "jpg,png",
		overwrite: "false",
		public_id: publicId,
		timestamp: timestamp(),
		type: "upload",
	};
	const form = new FormData();
	form.set(
		"file",
		new Blob([new Uint8Array(file.bytes)], {
			type: file.format === "jpg" ? "image/jpeg" : "image/png",
		}),
		`category.${file.format}`,
	);
	for (const [name, value] of Object.entries(fields)) form.set(name, value);
	form.set("api_key", config.apiKey);
	form.set("signature", createCloudinarySignature(fields, config.apiSecret));

	try {
		const response = await request(
			providerEndpoint(config.cloudName, "upload"),
			{
				method: "POST",
				redirect: "error",
				body: form,
				signal: AbortSignal.timeout(20000),
			},
		);
		if (!response.ok) throw new Error();
		return validateUploadResponse(
			await response.json(),
			config,
			publicId,
			file.format,
		);
	} catch {
		// Cloudinary may have created the image before a timeout or bad response.
		await cleanupCategoryImage(publicId, config, request);
		throw new CategoryError(
			502,
			"Could not upload the image. Try again or save without a new image.",
		);
	}
}
