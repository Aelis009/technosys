/**
 * Secure technician registration.
 *
 * Identity bytes arrive in a bounded multipart request, are validated by MIME
 * type and file signature, and are uploaded with server-owned Cloudinary
 * credentials as a private authenticated asset. The browser never supplies a
 * document URL or public ID. Registration still persists the Stage 6 defaults:
 * verification "pending", active status "active", and no session is created.
 */

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/index.ts";
import {
	addresses,
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
import { hashPassword } from "../../auth/password.ts";
import {
	type CloudinaryConfig,
	CloudinaryConfigurationError,
	CloudinaryUploadError,
	deleteIdentityDocument,
	getCloudinaryConfig,
	uploadIdentityDocument,
	uploadTechnicianProfilePhoto,
} from "../../cloudinary.ts";
import { encryptAccountNumber } from "./auth.ts";
import type { ValidIdentityDocument } from "./identityDocument.ts";
import {
	mobileVerificationTokenPattern,
	verifyMobileVerificationProof,
} from "./mobileVerificationProof.ts";
import { hasVerifiedPrivateUploads } from "./privateUploadReadiness.ts";

const indianMobileSchema = z
	.string()
	.trim()
	.regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number.")
	.transform((mobile) => mobile.replace(/^\+91/, ""));

const coordinate = (limit: number) =>
	z
		.string()
		.trim()
		.max(40)
		.refine(
			(value) =>
				value === "" ||
				(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
					(() => {
						const [whole, fraction = ""] = value
							.replace(/^[+-]/, "")
							.split(".");
						const integer = Number(whole || "0");
						return (
							integer < limit || (integer === limit && !/[1-9]/.test(fraction))
						);
					})()),
			"Enter a valid coordinate within its permitted range.",
		)
		.transform((value) => (value === "" ? undefined : Number(value).toFixed(7)))
		.optional();

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
			.max(255)
			.toLowerCase(),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters.")
			.max(128, "Password must be no more than 128 characters."),
		confirmPassword: z.string(),
		mobile: indianMobileSchema,
		mobileVerificationToken: z
			.string()
			.trim()
			.regex(mobileVerificationTokenPattern, "Verify your mobile number."),
		serviceCategoryId: z.string().uuid("Select a valid service category."),
		gender: z.enum(["male", "female", "other"]).optional(),
		dateOfBirth: z
			.string()
			.date("Enter a valid date of birth.")
			.refine((date) => date <= new Date().toISOString().slice(0, 10), {
				message: "Date of birth cannot be in the future.",
			})
			.optional(),
		addressLine: z.string().trim().min(1, "Enter your address.").max(550),
		area: z.string().trim().min(1, "Enter an area.").max(150),
		city: z.string().trim().min(1, "Enter a city.").max(100),
		state: z.string().trim().min(1, "Enter a state.").max(100),
		pincode: z
			.string()
			.trim()
			.regex(/^[1-9]\d{5}$/, "Enter a valid six-digit PIN code."),
		latitude: coordinate(90),
		longitude: coordinate(180),
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
	})
	.refine(
		(data) => (data.latitude === undefined) === (data.longitude === undefined),
		{
			message: "Provide both latitude and longitude, or neither.",
			path: ["latitude"],
		},
	);

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
export async function requireRegistrationCloudinary(
	loadConfig = getCloudinaryConfig,
	verify = hasVerifiedPrivateUploads,
): Promise<CloudinaryConfig> {
	const config = loadConfig();
	if (!config || !(await verify(config))) {
		throw new CloudinaryConfigurationError();
	}
	return config;
}

export async function registerTechnicianWithIdentityDocument(
	input: {
		fields: TechnicianRegistrationFields;
		document: ValidIdentityDocument;
		profilePhoto?: ValidIdentityDocument;
		config: CloudinaryConfig;
	},
	dependencies = {
		database: db,
		verify: async (input: { mobile: string; token: string }) =>
			verifyMobileVerificationProof(input),
		hash: hashPassword,
		encrypt: encryptAccountNumber,
		upload: uploadIdentityDocument,
		uploadPhoto: uploadTechnicianProfilePhoto,
		remove: deleteIdentityDocument,
		requireConfig: requireRegistrationCloudinary,
	},
): Promise<{ success: true }> {
	await dependencies.requireConfig();
	const { fields, document, profilePhoto, config } = input;
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

	// Only a successful registration OTP check can mint proof for this number.
	const { otpRecordId } = await dependencies.verify({
		mobile: fields.mobile,
		token: fields.mobileVerificationToken,
	});

	const [passwordHash, accountNumberEncrypted] = await Promise.all([
		dependencies.hash(fields.password),
		Promise.resolve(dependencies.encrypt(fields.accountNumber)),
	]);

	// Upload only after the request and OTP have been validated. The returned
	// identifiers are provider-owned; no client value is reused.
	const uploadedIds: string[] = [];
	try {
		const uploadedDocument = await dependencies.upload({ config, ...document });
		uploadedIds.push(uploadedDocument.publicId);
		const uploadedPhoto = profilePhoto
			? await dependencies.uploadPhoto({ config, ...profilePhoto })
			: undefined;
		if (uploadedPhoto) uploadedIds.push(uploadedPhoto.publicId);
		await db.transaction(async (tx) => {
			const [category] = await tx
				.select({ id: serviceCategories.id })
				.from(serviceCategories)
				.where(
					and(
						eq(serviceCategories.id, fields.serviceCategoryId),
						eq(serviceCategories.isActive, true),
					),
				)
				.limit(1)
				.for("share");
			if (!category) {
				throw new TechnicianRegistrationError(
					400,
					"INACTIVE_SERVICE_CATEGORY",
					"Select an active service category.",
				);
			}
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
					profileImageUrl: uploadedPhoto?.secureUrl ?? null,
					profileImagePublicId: uploadedPhoto?.publicId ?? null,
					verificationStatus: "pending",
					activeStatus: "active",
				})
				.returning({ id: technicianProfiles.id });

			if (!techProfile) {
				throw new Error("Failed to create technician profile.");
			}

			const technicianId = techProfile.id;

			await tx.insert(addresses).values({
				userId,
				label: "Home",
				addressLine: fields.addressLine,
				area: fields.area,
				city: fields.city,
				state: fields.state,
				pincode: fields.pincode,
				latitude: fields.latitude ?? null,
				longitude: fields.longitude ?? null,
				isDefault: true,
			});

			await tx.insert(technicianServiceCategories).values({
				technicianId,
				categoryId: fields.serviceCategoryId,
			});

			await tx.insert(technicianDocuments).values({
				technicianId,
				documentType: "identity",
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

			const [claimedOtp] = await tx
				.update(otpVerifications)
				.set({ userId })
				.where(
					and(
						eq(otpVerifications.id, otpRecordId),
						eq(otpVerifications.contactType, "mobile"),
						eq(otpVerifications.contactValue, fields.mobile),
						eq(otpVerifications.purpose, "technician_mobile_verify"),
						isNotNull(otpVerifications.verifiedAt),
						isNull(otpVerifications.userId),
					),
				)
				.returning({ id: otpVerifications.id });
			if (!claimedOtp)
				throw new TechnicianRegistrationError(
					400,
					"MOBILE_VERIFICATION_USED",
					"Please verify your mobile number again.",
				);
		});
	} catch (error) {
		const cleanup = await Promise.allSettled(
			uploadedIds.map((id) => dependencies.remove(config, id)),
		);
		if (cleanup.some((result) => result.status === "rejected")) {
			console.error("[Technician registration] private asset cleanup failed.");
		}
		if (
			error instanceof TechnicianRegistrationError ||
			error instanceof CloudinaryUploadError
		)
			throw error;

		throw new TechnicianRegistrationError(
			500,
			"REGISTRATION_FAILED",
			"We could not complete your registration. Please try again.",
		);
	}

	return { success: true };
}
