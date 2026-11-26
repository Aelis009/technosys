/**
 * Minimal Cloudinary adapter for private technician identity documents.
 *
 * Only server-owned credentials are used. Uploaded assets are stored as
 * Cloudinary "authenticated" resources, which cannot be delivered from a public
 * URL, and every response is handled without logging provider payloads or
 * secrets. No insecure local/disk fallback exists.
 */

import { createHash, randomUUID } from "node:crypto";
import { getServerEnv } from "./env.ts";
import type {
	IdentityDocumentFormat,
	IdentityDocumentMimeType,
} from "./features/technician/identityDocument.ts";

const cloudinaryApiBase = "https://api.cloudinary.com/v1_1";
const identityDocumentFolder = "technosys/technician-documents";
const profilePhotoFolder = "technosys/technician-photos";
const verificationTimeoutMs = 5_000;
const uploadTimeoutMs = 20_000;

export interface CloudinaryConfig {
	cloudName: string;
	apiKey: string;
	apiSecret: string;
}

export interface UploadedIdentityDocument {
	publicId: string;
	secureUrl: string;
	format: IdentityDocumentFormat;
	bytes: number;
}

export class CloudinaryConfigurationError extends Error {
	readonly status = 503;
	readonly code = "CLOUDINARY_UNAVAILABLE";

	constructor(
		message = "Technician registration is not available yet. Please try again later.",
	) {
		super(message);
		this.name = "CloudinaryConfigurationError";
	}
}

export class CloudinaryUploadError extends Error {
	readonly status = 502;
	readonly code = "CLOUDINARY_UPLOAD_FAILED";

	constructor(
		message = "We could not securely store your identity document. Please try again.",
	) {
		super(message);
		this.name = "CloudinaryUploadError";
	}
}

export class CloudinaryDeleteError extends Error {
	readonly status = 502;
	readonly code = "CLOUDINARY_DELETE_FAILED";

	constructor(message = "The stored identity document could not be removed.") {
		super(message);
		this.name = "CloudinaryDeleteError";
	}
}

function cloudNameIsValid(cloudName: string): boolean {
	return /^[A-Za-z0-9_-]{1,100}$/.test(cloudName);
}

/**
 * Reads Cloudinary credentials from the server environment. Returns null when
 * any part is missing or invalid so callers can keep the feature unavailable.
 */
export function getCloudinaryConfig(): CloudinaryConfig | null {
	const env = getServerEnv();
	const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
	const apiKey = env.CLOUDINARY_API_KEY?.trim() ?? "";
	const apiSecret = env.CLOUDINARY_API_SECRET?.trim() ?? "";

	if (!cloudName || !apiKey || !apiSecret || !cloudNameIsValid(cloudName)) {
		return null;
	}

	return { cloudName, apiKey, apiSecret };
}

export function requireCloudinaryConfig(): CloudinaryConfig {
	const config = getCloudinaryConfig();
	if (!config) throw new CloudinaryConfigurationError();
	return config;
}

function basicAuthHeader(config: CloudinaryConfig): string {
	return `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`;
}

export function createCloudinarySignature(
	params: Record<string, string>,
	apiSecret: string,
): string {
	const canonical = Object.keys(params)
		.filter((key) => params[key] !== undefined && params[key] !== "")
		.sort()
		.map((key) => `${key}=${params[key]}`)
		.join("&");
	return createHash("sha1").update(`${canonical}${apiSecret}`).digest("hex");
}

function providerUrl(config: CloudinaryConfig, path: string): string {
	return `${cloudinaryApiBase}/${encodeURIComponent(config.cloudName)}${path}`;
}

/**
 * Verifies that the configured credentials can actually be used. A failure is
 * treated as "registration unavailable" rather than falling back to an
 * unverified local store.
 */
export async function verifyCloudinaryConfiguration(
	config: CloudinaryConfig,
): Promise<boolean> {
	try {
		const response = await fetch(providerUrl(config, "/ping"), {
			method: "GET",
			headers: { Authorization: basicAuthHeader(config) },
			cache: "no-store",
			signal: AbortSignal.timeout(verificationTimeoutMs),
		});
		return response.ok;
	} catch {
		return false;
	}
}

function parseUploadResponse(
	payload: unknown,
	expectedFormat: IdentityDocumentFormat,
	expectedPublicId: string,
): UploadedIdentityDocument {
	if (!payload || typeof payload !== "object") {
		throw new CloudinaryUploadError();
	}

	const record = payload as Record<string, unknown>;
	const publicId = record.public_id;
	const secureUrl = record.secure_url;
	const format = record.format;
	const bytes = record.bytes;

	if (
		typeof publicId !== "string" ||
		publicId !== expectedPublicId ||
		publicId.length > 500 ||
		typeof secureUrl !== "string" ||
		!/^https:\/\//i.test(secureUrl) ||
		record.resource_type !== "image" ||
		record.type !== "authenticated" ||
		format !== expectedFormat ||
		typeof bytes !== "number" ||
		!Number.isFinite(bytes) ||
		bytes <= 0
	) {
		throw new CloudinaryUploadError();
	}

	return {
		publicId,
		secureUrl,
		format: expectedFormat,
		bytes,
	};
}

/**
 * Uploads identity bytes as a private authenticated Cloudinary image. The
 * caller cannot supply a Cloudinary URL, public ID, or credentials.
 */
type ImageUpload = {
	config: CloudinaryConfig;
	bytes: Uint8Array;
	mimeType: IdentityDocumentMimeType;
	format: IdentityDocumentFormat;
};

export function uploadIdentityDocument(input: ImageUpload) {
	return uploadAuthenticatedImage(input, identityDocumentFolder);
}

export function uploadTechnicianProfilePhoto(input: ImageUpload) {
	return uploadAuthenticatedImage(input, profilePhotoFolder);
}

async function uploadAuthenticatedImage(
	input: ImageUpload,
	folder: string,
): Promise<UploadedIdentityDocument> {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const publicId = `${folder}/${randomUUID()}`;
	const signedParams = {
		public_id: publicId,
		timestamp,
		type: "authenticated",
	};
	const form = new FormData();
	form.append(
		"file",
		new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
		`identity.${input.format}`,
	);
	form.append("api_key", input.config.apiKey);
	for (const [key, value] of Object.entries(signedParams)) {
		form.append(key, value);
	}
	form.append(
		"signature",
		createCloudinarySignature(signedParams, input.config.apiSecret),
	);

	try {
		const response = await fetch(providerUrl(input.config, "/image/upload"), {
			method: "POST",
			body: form,
			cache: "no-store",
			signal: AbortSignal.timeout(uploadTimeoutMs),
		});
		if (!response.ok) throw new CloudinaryUploadError();
		const payload: unknown = await response.json();
		return parseUploadResponse(payload, input.format, publicId);
	} catch {
		// A timed-out or malformed response may still have created the asset.
		try {
			await deleteIdentityDocument(input.config, publicId);
		} catch {
			console.error("[Technician registration] private asset cleanup failed.");
		}
		throw new CloudinaryUploadError();
	}
}

/**
 * Best-effort compensation used when the registration transaction fails after
 * an asset has already been uploaded.
 */
export async function deleteIdentityDocument(
	config: CloudinaryConfig,
	publicId: string,
): Promise<void> {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const signedParams = {
		invalidate: "true",
		public_id: publicId,
		timestamp,
		type: "authenticated",
	};
	const body = new URLSearchParams({
		...signedParams,
		api_key: config.apiKey,
		signature: createCloudinarySignature(signedParams, config.apiSecret),
	});

	let response: Response;
	try {
		response = await fetch(providerUrl(config, "/image/destroy"), {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: body.toString(),
			cache: "no-store",
			signal: AbortSignal.timeout(verificationTimeoutMs),
		});
	} catch {
		throw new CloudinaryDeleteError();
	}

	if (!response.ok) {
		throw new CloudinaryDeleteError();
	}
	try {
		const result: unknown = await response.json();
		if (
			!result ||
			typeof result !== "object" ||
			!("result" in result) ||
			(result.result !== "ok" && result.result !== "not found")
		) {
			throw new CloudinaryDeleteError();
		}
	} catch {
		throw new CloudinaryDeleteError();
	}
}
