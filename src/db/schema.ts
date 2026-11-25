import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
	timestamp("created_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull();
const updatedAt = () =>
	timestamp("updated_at", { withTimezone: true, mode: "date" })
		.defaultNow()
		.notNull();

export const verificationStatusEnum = pgEnum("verification_status", [
	"pending",
	"approved",
	"rejected",
]);

export const technicianActiveStatusEnum = pgEnum("technician_active_status", [
	"active",
	"inactive",
	"suspended",
]);

export const otpContactTypeEnum = pgEnum("otp_contact_type", [
	"email",
	"mobile",
]);

export const users = pgTable(
	"users",
	{
		id: id(),
		name: varchar("name", { length: 100 }).notNull(),
		email: varchar("email", { length: 255 }),
		mobile: varchar("mobile", { length: 20 }),
		passwordHash: varchar("password_hash", { length: 255 }),
		isEmailVerified: boolean("is_email_verified").default(false).notNull(),
		isMobileVerified: boolean("is_mobile_verified").default(false).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("users_email_unique")
			.on(table.email)
			.where(sql`${table.email} IS NOT NULL`),
		uniqueIndex("users_mobile_unique")
			.on(table.mobile)
			.where(sql`${table.mobile} IS NOT NULL`),
		check(
			"users_login_identifier_check",
			sql`(
        (${table.email} IS NOT NULL AND length(trim(${table.email})) > 0)
        OR (${table.mobile} IS NOT NULL AND length(trim(${table.mobile})) > 0)
      )`,
		),
	],
);

export const roles = pgTable("roles", {
	id: id(),
	name: varchar("name", { length: 30 }).notNull().unique(),
	description: text("description"),
});

export const userRoles = pgTable(
	"user_roles",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		roleId: uuid("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "restrict" }),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("user_roles_user_role_unique").on(table.userId, table.roleId),
		index("user_roles_role_id_idx").on(table.roleId),
	],
);

export const customerProfiles = pgTable("customer_profiles", {
	id: id(),
	userId: uuid("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	profileImageUrl: text("profile_image_url"),
	profileImagePublicId: text("profile_image_public_id"),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const technicianProfiles = pgTable(
	"technician_profiles",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		dateOfBirth: date("date_of_birth"),
		gender: varchar("gender", { length: 20 }),
		profileImageUrl: text("profile_image_url"),
		profileImagePublicId: text("profile_image_public_id"),
		verificationStatus: verificationStatusEnum("verification_status")
			.default("pending")
			.notNull(),
		verificationReason: text("verification_reason"),
		activeStatus: technicianActiveStatusEnum("active_status").notNull(),
		approvedBy: uuid("approved_by").references(() => users.id, {
			onDelete: "set null",
		}),
		approvedAt: timestamp("approved_at", {
			withTimezone: true,
			mode: "date",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("technician_profiles_verification_status_idx").on(
			table.verificationStatus,
		),
		index("technician_profiles_approved_by_idx").on(table.approvedBy),
	],
);

export const addresses = pgTable(
	"addresses",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		label: varchar("label", { length: 50 }).notNull(),
		houseNumber: varchar("house_number", { length: 100 }).notNull(),
		street: varchar("street", { length: 255 }).notNull(),
		area: varchar("area", { length: 150 }).notNull(),
		city: varchar("city", { length: 100 }).notNull(),
		state: varchar("state", { length: 100 }).notNull(),
		pincode: varchar("pincode", { length: 15 }).notNull(),
		latitude: numeric("latitude", { precision: 10, scale: 7 }),
		longitude: numeric("longitude", { precision: 10, scale: 7 }),
		isDefault: boolean("is_default").default(false).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("addresses_user_id_idx").on(table.userId),
		uniqueIndex("addresses_one_default_per_user_unique")
			.on(table.userId)
			.where(sql`${table.isDefault}`),
		check(
			"addresses_coordinates_pair_check",
			sql`(
        (${table.latitude} IS NULL AND ${table.longitude} IS NULL)
        OR (${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL)
      )`,
		),
		check(
			"addresses_latitude_range_check",
			sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`,
		),
		check(
			"addresses_longitude_range_check",
			sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`,
		),
	],
);

export const technicianDocuments = pgTable(
	"technician_documents",
	{
		id: id(),
		technicianId: uuid("technician_id")
			.notNull()
			.references(() => technicianProfiles.id, { onDelete: "cascade" }),
		documentType: varchar("document_type", { length: 50 }).notNull(),
		documentUrl: text("document_url").notNull(),
		cloudinaryPublicId: text("cloudinary_public_id").notNull(),
		verificationStatus: verificationStatusEnum("verification_status")
			.default("pending")
			.notNull(),
		rejectionReason: text("rejection_reason"),
		reviewedBy: uuid("reviewed_by").references(() => users.id, {
			onDelete: "set null",
		}),
		reviewedAt: timestamp("reviewed_at", {
			withTimezone: true,
			mode: "date",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("technician_documents_technician_id_idx").on(table.technicianId),
		index("technician_documents_reviewed_by_idx").on(table.reviewedBy),
	],
);

export const technicianBankDetails = pgTable("technician_bank_details", {
	id: id(),
	technicianId: uuid("technician_id")
		.notNull()
		.unique()
		.references(() => technicianProfiles.id, { onDelete: "cascade" }),
	accountHolderName: varchar("account_holder_name", { length: 150 }).notNull(),
	accountNumberEncrypted: text("account_number_encrypted").notNull(),
	ifscCode: varchar("ifsc_code", { length: 20 }).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const otpVerifications = pgTable(
	"otp_verifications",
	{
		id: id(),
		userId: uuid("user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		contactType: otpContactTypeEnum("contact_type").notNull(),
		contactValue: varchar("contact_value", { length: 255 }).notNull(),
		purpose: varchar("purpose", { length: 50 }).notNull(),
		otpHash: varchar("otp_hash", { length: 255 }).notNull(),
		expiresAt: timestamp("expires_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		verifiedAt: timestamp("verified_at", {
			withTimezone: true,
			mode: "date",
		}),
		attempts: integer("attempts").default(0).notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("otp_verifications_user_id_idx").on(table.userId),
		index("otp_verifications_lookup_idx").on(
			table.contactType,
			table.contactValue,
			table.purpose,
			table.createdAt,
		),
		index("otp_verifications_expires_at_idx").on(table.expiresAt),
		check(
			"otp_verifications_attempts_nonnegative_check",
			sql`${table.attempts} >= 0`,
		),
	],
);

export const sessions = pgTable(
	"sessions",
	{
		id: id(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		expiresAt: timestamp("expires_at", {
			withTimezone: true,
			mode: "date",
		}).notNull(),
		revokedAt: timestamp("revoked_at", {
			withTimezone: true,
			mode: "date",
		}),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
		index("sessions_user_id_idx").on(table.userId),
		index("sessions_expires_at_idx").on(table.expiresAt),
	],
);

export const loginAttempts = pgTable(
	"login_attempts",
	{
		id: id(),
		identifier: varchar("identifier", { length: 255 }).notNull().unique(),
		attempts: integer("attempts").default(0).notNull(),
		blockedUntil: timestamp("blocked_until", {
			withTimezone: true,
			mode: "date",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		check(
			"login_attempts_attempts_nonnegative_check",
			sql`${table.attempts} >= 0`,
		),
	],
);

export const serviceCategories = pgTable("service_categories", {
	id: id(),
	name: varchar("name", { length: 100 }).notNull().unique(),
	description: text("description"),
	imageUrl: text("image_url"),
	imagePublicId: text("image_public_id"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const subServiceCategories = pgTable(
	"sub_service_categories",
	{
		id: id(),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => serviceCategories.id, { onDelete: "restrict" }),
		name: varchar("name", { length: 200 }).notNull(),
		description: text("description").notNull(),
		price: numeric("price", { precision: 12, scale: 2 }).notNull(),
		estimatedDurationMinutes: integer("estimated_duration_minutes").notNull(),
		coinsRequired: integer("coins_required").notNull(),
		imageUrl: text("image_url"),
		imagePublicId: text("image_public_id"),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("sub_service_categories_category_name_unique").on(
			table.categoryId,
			table.name,
		),
		check(
			"sub_service_categories_price_nonnegative_check",
			sql`${table.price} >= 0`,
		),
		check(
			"sub_service_categories_duration_positive_check",
			sql`${table.estimatedDurationMinutes} > 0`,
		),
		check(
			"sub_service_categories_coins_nonnegative_check",
			sql`${table.coinsRequired} >= 0`,
		),
	],
);

export const technicianServiceCategories = pgTable(
	"technician_service_categories",
	{
		id: id(),
		technicianId: uuid("technician_id")
			.notNull()
			.references(() => technicianProfiles.id, { onDelete: "cascade" }),
		categoryId: uuid("category_id")
			.notNull()
			.references(() => serviceCategories.id, { onDelete: "cascade" }),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("technician_service_categories_pair_unique").on(
			table.technicianId,
			table.categoryId,
		),
		index("technician_service_categories_category_id_idx").on(table.categoryId),
	],
);
