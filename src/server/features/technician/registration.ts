/**
 * Secure technician registration.
 *
 * Identity bytes arrive in a bounded multipart request, are validated by MIME
 * type and file signature, and are uploaded with server-owned Cloudinary
 * credentials as a private authenticated asset. The browser never supplies a
 * document URL or public ID. Registration still persists the Stage 6 defaults:
 * verification "pending", active status "active", and no session is created.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/index.ts";
import {
	otpVerifications,
	roles,
	serviceCategories,
	technicianBankDetails,
	technicianDocuments,
	technicianProfiles,
	technicianServiceCategories,
	userRoles,
	users,
} from "../../../db/schema.ts";
import { verifyOtp } from "../../auth/otp.ts";
import { hashPassword } from "../../auth/password.ts";
import {
	type CloudinaryConfig,
	CloudinaryConfigurationError,
	deleteIdentityDocument,
	getCloudinaryConfig,
	uploadIdentityDocument,
	verifyCloudinaryConfiguration,
} from "../../cloudinary.ts";
import {
	encryptAccountNumber,
	technicianRegistrationOtpPurpose,
} from "./auth.ts";
import type { ValidIdentityDocument } from "./identityDocument.ts";

const indianMobileSchema = z
	.string()
	.trim()
	.regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number.")
	.transform((mobile) => mobile.replace(/^\+91/, ""));

export const technicianRegistrationFieldsSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters.")
			.max(100),
		email: z
			.string()
			.trim()
			.email("Enter a valid email address.")
			.toLowerCase(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters.")
			.max(128, "Password must be no more than 128 characters."),
		confirmPassword: z.string(),
		mobile: indianMobileSchema,
		otp: z
			.string()
			.trim()
			.regex(/^\d{6}$/, "Enter the six-digit OTP."),
		serviceCategoryId: z.string().uuid("Select a valid service category."),
		gender: z.enum(["male", "female", "other"]).optional(),
		dateOfBirth: z
			.string()
			.regex(
				/^\d{4}-\d{2}-\d{2}$/,
				"Date of birth must be in YYYY-MM-DD format.",
			)
			.optional(),
		documentType: z
			.string()
			.trim()
			.min(1, "Document type is required.")
			.max(50),
		accountHolderName: z
			.string()
			.trim()
			.min(2, "Account holder name is required.")
			.max(150),
		accountNumber: z
			.string()
			.trim()
			.min(8, "Account number must be at least 8 digits.")
			.max(20, "Account number must be no more than 20 digits.")
			.regex(/^\d+$/, "Account number must contain only digits."),
		ifscCode: z
			.string()
			.trim()
			.toUpperCase()
			.regex(
				/^[A-Z]{4}0[A-Z0-9]{6}$/,
				"Enter a valid IFSC code (e.g. SBIN0001234).",
			),
	})
	.strict()
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

export type TechnicianRegistrationFields = z.infer<
	typeof technicianRegistrationFieldsSchema
>;

export class TechnicianRegistrationError extends Error {
	readonly status: 400 | 409 | 500 | 503;
	readonly code: string;

	constructor(status: 400 | 409 | 500 | 503, code: string, message: string) {
		super(message);
		this.name = "TechnicianRegistrationError";
		this.status = status;
		this.code = code;
	}
}

/**
 * Registration stays closed until the full private delivery flow is verified.
 */
export async function requireRegistrationCloudinary(): Promise<CloudinaryConfig> {
	// This code gate cannot be switched on through configuration or a request.
	// Change it only after a live private-asset delivery security closeout.
	if (!privateDeliveryVerified()) throw new CloudinaryConfigurationError();
	const config = getCloudinaryConfig();
	if (!config || !(await verifyCloudinaryConfiguration(config))) {
		throw new CloudinaryConfigurationError();
	}
	return config;
}

function privateDeliveryVerified(): boolean {
	return false;
}

export async function registerTechnicianWithIdentityDocument(
	input: {
		fields: TechnicianRegistrationFields;
		document: ValidIdentityDocument;
		config: CloudinaryConfig;
	},
	dependencies = {
		database: db,
		verify: verifyOtp,
		hash: hashPassword,
		encrypt: encryptAccountNumber,
		upload: uploadIdentityDocument,
		remove: deleteIdentityDocument,
		requireConfig: requireRegistrationCloudinary,
	},
): Promise<{ success: true }> {
	await dependencies.requireConfig();
	const { fields, document, config } = input;
	const db = dependencies.database;

	const [emailConflict, mobileConflict, technicianRole] = await Promise.all([
		db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, fields.email))
			.limit(1),
		db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.mobile, fields.mobile))
			.limit(1),
		db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.name, "technician"))
			.limit(1),
	]);

	if (emailConflict.length > 0) {
		throw new TechnicianRegistrationError(
			409,
			"EMAIL_TAKEN",
			"An account with this email address already exists.",
		);
	}

	if (mobileConflict.length > 0) {
		throw new TechnicianRegistrationError(
			409,
			"MOBILE_TAKEN",
			"An account with this mobile number already exists.",
		);
	}

	const role = technicianRole[0];
	if (!role) {
		throw new TechnicianRegistrationError(
			503,
			"ROLE_UNAVAILABLE",
			"Technician registration is not available yet. Please try again later.",
		);
	}

	const [activeCategory] = await db
		.select({ id: serviceCategories.id })
		.from(serviceCategories)
		.where(
			and(
				eq(serviceCategories.id, fields.serviceCategoryId),
				eq(serviceCategories.isActive, true),
			),
		)
		.limit(1);

	if (!activeCategory) {
		throw new TechnicianRegistrationError(
			400,
			"INACTIVE_SERVICE_CATEGORY",
			"Select an active service category.",
		);
	}

	// Purpose and mobile are checked by the existing atomic OTP service.
	const { otpRecordId } = await dependencies.verify({
		mobile: fields.mobile,
		otp: fields.otp,
		purpose: technicianRegistrationOtpPurpose,
	});

	const [passwordHash, accountNumberEncrypted] = await Promise.all([
		dependencies.hash(fields.password),
		Promise.resolve(dependencies.encrypt(fields.accountNumber)),
	]);

	// Upload only after the request and OTP have been validated. The returned
	// identifiers are provider-owned; no client value is reused.
	const uploadedDocument = await dependencies.upload({
		config,
		bytes: document.bytes,
		mimeType: document.mimeType,
		format: document.format,
	});

	try {
		await db.transaction(async (tx) => {
			const [newUser] = await tx
				.insert(users)
				.values({
					name: fields.name,
					email: fields.email,
					mobile: fields.mobile,
					passwordHash,
					isEmailVerified: false,
					isMobileVerified: true,
					isActive: true,
				})
				.returning({ id: users.id });

			if (!newUser) throw new Error("Failed to create user record.");

			const userId = newUser.id;

			await tx.insert(userRoles).values({
				userId,
				roleId: role.id,
			});

			const [techProfile] = await tx
				.insert(technicianProfiles)
				.values({
					userId,
					gender: fields.gender ?? null,
					dateOfBirth: fields.dateOfBirth ?? null,
					verificationStatus: "pending",
					activeStatus: "active",
				})
				.returning({ id: technicianProfiles.id });

			if (!techProfile) {
				throw new Error("Failed to create technician profile.");
			}

			const technicianId = techProfile.id;

			await tx.insert(technicianServiceCategories).values({
				technicianId,
				categoryId: fields.serviceCategoryId,
			});

			await tx.insert(technicianDocuments).values({
				technicianId,
				documentType: fields.documentType,
				documentUrl: uploadedDocument.secureUrl,
				cloudinaryPublicId: uploadedDocument.publicId,
				verificationStatus: "pending",
			});

			await tx.insert(technicianBankDetails).values({
				technicianId,
				accountHolderName: fields.accountHolderName,
				accountNumberEncrypted,
				ifscCode: fields.ifscCode,
			});

			await tx
				.update(otpVerifications)
				.set({ userId })
				.where(eq(otpVerifications.id, otpRecordId));
		});
	} catch {
		// The database rejected the application after the private asset existed.
		// Remove it so orphaned identity documents cannot accumulate.
		try {
			await dependencies.remove(config, uploadedDocument.publicId);
		} catch {
			console.error("[Technician registration] private asset cleanup failed.");
		}

		throw new TechnicianRegistrationError(
			500,
			"REGISTRATION_FAILED",
			"We could not complete your registration. Please try again.",
		);
	}

	return { success: true };
}
