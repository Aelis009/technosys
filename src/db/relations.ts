import { relations } from "drizzle-orm";
import {
	addresses,
	customerProfiles,
	otpVerifications,
	roles,
	serviceCategories,
	sessions,
	subServiceCategories,
	technicianBankDetails,
	technicianDocuments,
	technicianProfiles,
	technicianServiceCategories,
	userRoles,
	users,
} from "./schema.ts";

export const usersRelations = relations(users, ({ many, one }) => ({
	userRoles: many(userRoles),
	customerProfile: one(customerProfiles),
	technicianProfile: one(technicianProfiles, {
		fields: [users.id],
		references: [technicianProfiles.userId],
		relationName: "technicianUser",
	}),
	approvedTechnicianProfiles: many(technicianProfiles, {
		relationName: "technicianApprover",
	}),
	addresses: many(addresses),
	reviewedTechnicianDocuments: many(technicianDocuments, {
		relationName: "documentReviewer",
	}),
	otpVerifications: many(otpVerifications),
	sessions: many(sessions),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
	userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
	user: one(users, {
		fields: [userRoles.userId],
		references: [users.id],
	}),
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.id],
	}),
}));

export const customerProfilesRelations = relations(
	customerProfiles,
	({ one }) => ({
		user: one(users, {
			fields: [customerProfiles.userId],
			references: [users.id],
		}),
	}),
);

export const technicianProfilesRelations = relations(
	technicianProfiles,
	({ many, one }) => ({
		user: one(users, {
			fields: [technicianProfiles.userId],
			references: [users.id],
			relationName: "technicianUser",
		}),
		approvedBy: one(users, {
			fields: [technicianProfiles.approvedBy],
			references: [users.id],
			relationName: "technicianApprover",
		}),
		documents: many(technicianDocuments),
		bankDetails: one(technicianBankDetails),
		serviceCategories: many(technicianServiceCategories),
	}),
);

export const addressesRelations = relations(addresses, ({ one }) => ({
	user: one(users, {
		fields: [addresses.userId],
		references: [users.id],
	}),
}));

export const technicianDocumentsRelations = relations(
	technicianDocuments,
	({ one }) => ({
		technician: one(technicianProfiles, {
			fields: [technicianDocuments.technicianId],
			references: [technicianProfiles.id],
		}),
		reviewedBy: one(users, {
			fields: [technicianDocuments.reviewedBy],
			references: [users.id],
			relationName: "documentReviewer",
		}),
	}),
);

export const technicianBankDetailsRelations = relations(
	technicianBankDetails,
	({ one }) => ({
		technician: one(technicianProfiles, {
			fields: [technicianBankDetails.technicianId],
			references: [technicianProfiles.id],
		}),
	}),
);

export const otpVerificationsRelations = relations(
	otpVerifications,
	({ one }) => ({
		user: one(users, {
			fields: [otpVerifications.userId],
			references: [users.id],
		}),
	}),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const serviceCategoriesRelations = relations(
	serviceCategories,
	({ many }) => ({
		subServiceCategories: many(subServiceCategories),
		technicians: many(technicianServiceCategories),
	}),
);

export const subServiceCategoriesRelations = relations(
	subServiceCategories,
	({ one }) => ({
		category: one(serviceCategories, {
			fields: [subServiceCategories.categoryId],
			references: [serviceCategories.id],
		}),
	}),
);

export const technicianServiceCategoriesRelations = relations(
	technicianServiceCategories,
	({ one }) => ({
		technician: one(technicianProfiles, {
			fields: [technicianServiceCategories.technicianId],
			references: [technicianProfiles.id],
		}),
		category: one(serviceCategories, {
			fields: [technicianServiceCategories.categoryId],
			references: [serviceCategories.id],
		}),
	}),
);
