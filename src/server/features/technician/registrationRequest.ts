/**
 * HTTP request handling for secure technician registration.
 *
 * The body is read through a hard byte limit before multipart parsing, so a
 * missing or false Content-Length cannot bypass the cap. Only the documented
 * form fields plus one identity file are accepted; legacy client-supplied
 * document URLs/public IDs are rejected outright.
 */

import { ZodError } from "zod";
import { assertSameOrigin, CsrfError } from "../../auth/csrf.ts";
import { OtpError } from "../../auth/otp.ts";
import {
	CloudinaryConfigurationError,
	CloudinaryDeleteError,
	CloudinaryUploadError,
} from "../../cloudinary.ts";
import {
	IdentityDocumentError,
	MAX_IDENTITY_DOCUMENT_BYTES,
	validateIdentityDocument,
} from "./identityDocument.ts";
import {
	registerTechnicianWithIdentityDocument,
	requireRegistrationCloudinary,
	TechnicianRegistrationError,
	type TechnicianRegistrationFields,
	technicianRegistrationFieldsSchema,
} from "./registration.ts";

export const MAX_REGISTRATION_BODY_BYTES =
	MAX_IDENTITY_DOCUMENT_BYTES + 512 * 1024;

const allowedFieldNames = [
	"name",
	"email",
	"password",
	"confirmPassword",
	"mobile",
	"otp",
	"serviceCategoryId",
	"gender",
	"dateOfBirth",
	"documentType",
	"accountHolderName",
	"accountNumber",
	"ifscCode",
] as const;

const allowedFieldSet = new Set<string>(allowedFieldNames);

const legacyMetadataFieldNames = [
	"documentUrl",
	"documentPublicId",
	"cloudinaryPublicId",
	"profileImageUrl",
	"profileImagePublicId",
] as const;

const legacyMetadataFieldSet = new Set<string>(legacyMetadataFieldNames);

export class RegistrationRequestError extends Error {
	readonly status: 400 | 413 | 415;
	readonly code: string;

	constructor(status: 400 | 413 | 415, code: string, message: string) {
		super(message);
		this.name = "RegistrationRequestError";
		this.status = status;
		this.code = code;
	}
}

function isFileLike(value: FormDataEntryValue | null): value is File {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		"type" in value &&
		"size" in value &&
		"arrayBuffer" in value
	);
}

/**
 * Reads the request body while counting actual bytes. Content-Length is checked
 * first when present, but the stream itself remains bounded when the header is
 * absent, falsified low, or the client uses chunked transfer encoding.
 */
export async function readBoundedRequestBody(
	request: Request,
	limit: number = MAX_REGISTRATION_BODY_BYTES,
): Promise<Uint8Array> {
	const declaredLength = request.headers.get("content-length");
	if (declaredLength !== null) {
		if (!/^\d+$/.test(declaredLength)) {
			throw new RegistrationRequestError(
				400,
				"INVALID_CONTENT_LENGTH",
				"The request could not be read.",
			);
		}

		const length = Number(declaredLength);
		if (!Number.isSafeInteger(length)) {
			throw new RegistrationRequestError(
				400,
				"INVALID_CONTENT_LENGTH",
				"The request could not be read.",
			);
		}

		if (length > limit) {
			throw new RegistrationRequestError(
				413,
				"REQUEST_TOO_LARGE",
				"The registration request is too large.",
			);
		}
	}

	if (!request.body) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			total += value.byteLength;
			if (total > limit) {
				await reader.cancel().catch(() => undefined);
				throw new RegistrationRequestError(
					413,
					"REQUEST_TOO_LARGE",
					"The registration request is too large.",
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}

async function parseMultipartForm(formData: FormData) {
	const seen = new Set<string>();
	for (const key of formData.keys()) {
		if (seen.has(key)) {
			throw new RegistrationRequestError(
				400,
				"DUPLICATE_FIELD",
				"The registration request contains duplicate fields.",
			);
		}
		seen.add(key);

		if (legacyMetadataFieldSet.has(key)) {
			throw new RegistrationRequestError(
				400,
				"CLIENT_DOCUMENT_METADATA",
				"Document URLs and public IDs are not accepted. Upload the identity document with this form.",
			);
		}

		if (key !== "document" && !allowedFieldSet.has(key)) {
			throw new RegistrationRequestError(
				400,
				"UNEXPECTED_FIELD",
				"The registration request contains an unexpected field.",
			);
		}
	}

	const raw: Record<string, string> = {};
	for (const name of allowedFieldNames) {
		const value = formData.get(name);
		if (value === null) continue;
		if (typeof value !== "string") {
			throw new RegistrationRequestError(
				400,
				"INVALID_FIELD",
				"The registration request contains an invalid field.",
			);
		}
		raw[name] = value;
	}

	for (const optionalName of ["gender", "dateOfBirth"] as const) {
		if (raw[optionalName] === "") delete raw[optionalName];
	}

	const file = formData.get("document");
	if (!isFileLike(file)) {
		throw new IdentityDocumentError(
			"Upload a JPG, JPEG, or PNG identity document.",
		);
	}

	if (file.size > MAX_IDENTITY_DOCUMENT_BYTES) {
		throw new IdentityDocumentError(
			"Identity document must be 5 MB or smaller.",
		);
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const document = validateIdentityDocument({
		bytes,
		mimeType: file.type,
		fileName: file.name,
	});

	let fields: TechnicianRegistrationFields;
	try {
		fields = technicianRegistrationFieldsSchema.parse(raw);
	} catch (error) {
		if (error instanceof ZodError) {
			throw new RegistrationRequestError(
				400,
				"INVALID_REGISTRATION",
				error.issues[0]?.message ??
					"Check the registration details and try again.",
			);
		}
		throw error;
	}

	return { fields, document };
}

function jsonResponse(status: number, body: unknown): Response {
	return Response.json(body, {
		status,
		headers: {
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

function errorResponse(error: unknown): Response {
	if (error instanceof CsrfError) {
		return jsonResponse(403, {
			error: {
				code: "CSRF_REJECTED",
				message: "Request origin is not allowed.",
			},
		});
	}

	if (error instanceof RegistrationRequestError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	if (error instanceof IdentityDocumentError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	if (error instanceof OtpError) {
		return jsonResponse(400, {
			error: { code: `OTP_${error.code}`, message: error.message },
		});
	}

	if (error instanceof CloudinaryConfigurationError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	if (error instanceof CloudinaryUploadError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	if (error instanceof CloudinaryDeleteError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	if (error instanceof TechnicianRegistrationError) {
		return jsonResponse(error.status, {
			error: { code: error.code, message: error.message },
		});
	}

	// Never log request bodies, OTPs, provider payloads, or document metadata.
	console.error("[Technician registration] unexpected failure.");
	return jsonResponse(500, {
		error: {
			code: "REGISTRATION_FAILED",
			message: "We could not complete your registration. Please try again.",
		},
	});
}

export async function handleTechnicianRegistrationRequest(
	request: Request,
	dependencies = {
		requireConfig: requireRegistrationCloudinary,
		register: registerTechnicianWithIdentityDocument,
	},
): Promise<Response> {
	try {
		assertSameOrigin(request);

		const contentType =
			request.headers.get("content-type")?.toLowerCase() ?? "";
		if (!contentType.startsWith("multipart/form-data")) {
			throw new RegistrationRequestError(
				415,
				"UNSUPPORTED_CONTENT_TYPE",
				"Registration requires a multipart form upload.",
			);
		}

		const body = await readBoundedRequestBody(request);
		const headers = new Headers(request.headers);
		headers.set("content-length", String(body.byteLength));
		headers.delete("transfer-encoding");

		let formData: FormData;
		try {
			formData = await new Request(request.url, {
				method: "POST",
				headers,
				body: new Uint8Array(body),
			}).formData();
		} catch {
			throw new RegistrationRequestError(
				400,
				"INVALID_MULTIPART",
				"The registration form could not be read.",
			);
		}

		const { fields, document } = await parseMultipartForm(formData);
		const config = await dependencies.requireConfig();
		const result = await dependencies.register({
			fields,
			document,
			config,
		});

		return jsonResponse(200, result);
	} catch (error) {
		return errorResponse(error);
	}
}
