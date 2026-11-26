/**
 * Identity-document validation for technician registration.
 *
 * The browser-supplied MIME type is never trusted on its own: the file must
 * also carry a real JPEG or PNG signature. Only these two formats are accepted.
 */

export const MAX_IDENTITY_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type IdentityDocumentFormat = "jpg" | "png";
export type IdentityDocumentMimeType = "image/jpeg" | "image/png";

export interface ValidIdentityDocument {
	bytes: Uint8Array;
	mimeType: IdentityDocumentMimeType;
	format: IdentityDocumentFormat;
	/** Original name, used only as the upload filename and never persisted. */
	fileName: string;
}

export class IdentityDocumentError extends Error {
	readonly status = 400;
	readonly code = "INVALID_IDENTITY_DOCUMENT";

	constructor(message: string) {
		super(message);
		this.name = "IdentityDocumentError";
	}
}

const jpegSignature = [0xff, 0xd8, 0xff] as const;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
	if (bytes.length < signature.length) return false;
	return signature.every((value, index) => bytes[index] === value);
}

/**
 * Detects the format from the file bytes. The extension and MIME type are not
 * considered here.
 */
export function detectIdentityImageFormat(
	bytes: Uint8Array,
): IdentityDocumentFormat | null {
	if (startsWith(bytes, pngSignature)) return "png";
	if (startsWith(bytes, jpegSignature)) return "jpg";
	return null;
}

function normalizeMimeType(mimeType: string): string {
	return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

/**
 * Validates an uploaded identity document. Throws IdentityDocumentError with a
 * user-safe message when the file is missing, too large, unsupported, or when
 * its MIME type does not match its actual signature.
 */
export function validateIdentityDocument(input: {
	bytes: Uint8Array;
	mimeType: string;
	fileName: string;
}): ValidIdentityDocument {
	const { bytes } = input;

	if (bytes.byteLength === 0) {
		throw new IdentityDocumentError(
			"Upload a JPG, JPEG, or PNG identity document.",
		);
	}

	if (bytes.byteLength > MAX_IDENTITY_DOCUMENT_BYTES) {
		throw new IdentityDocumentError(
			"Identity document must be 5 MB or smaller.",
		);
	}

	const declaredMimeType = normalizeMimeType(input.mimeType);
	const extension = input.fileName.split(".").pop()?.toLowerCase();
	const expectedFormat =
		declaredMimeType === "image/png"
			? "png"
			: declaredMimeType === "image/jpeg" || declaredMimeType === "image/jpg"
				? "jpg"
				: null;

	if (!expectedFormat) {
		throw new IdentityDocumentError(
			"Identity document must be a JPG, JPEG, or PNG image.",
		);
	}
	if (
		!(expectedFormat === "png"
			? extension === "png"
			: extension === "jpg" || extension === "jpeg")
	) {
		throw new IdentityDocumentError(
			"Identity document must be a JPG, JPEG, or PNG image.",
		);
	}

	const detectedFormat = detectIdentityImageFormat(bytes);
	if (!detectedFormat) {
		throw new IdentityDocumentError(
			"Identity document must be a JPG, JPEG, or PNG image.",
		);
	}

	if (detectedFormat !== expectedFormat) {
		throw new IdentityDocumentError(
			"The identity document content does not match its image type.",
		);
	}

	return {
		bytes,
		mimeType: detectedFormat === "png" ? "image/png" : "image/jpeg",
		format: detectedFormat,
		fileName: input.fileName,
	};
}
