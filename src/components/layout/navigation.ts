import type { ReactNode } from "react";

export interface NavItem {
	id: string;
	label: string;
	to: string;
	hash?: string;
	exact?: boolean;
	comingSoon?: boolean;
	badge?: string | number;
	icon?: ReactNode;
}

export interface TechnicianLayoutStatus {
	verificationStatus: "pending" | "approved" | "rejected";
	activeStatus: "active" | "inactive" | "suspended";
	verificationReason?: string | null;
}

export interface LayoutUser {
	id: string;
	name: string;
	email?: string | null;
	mobile?: string | null;
	roles: string[];
	profileImageUrl?: string | null;
	technicianStatus?: TechnicianLayoutStatus | null;
}

export function getPublicNavItems(user?: LayoutUser | null): NavItem[] {
	const isCustomerOnly =
		Boolean(user?.roles.includes("customer")) &&
		!user?.roles.includes("admin") &&
		!user?.roles.includes("technician");

	if (isCustomerOnly) {
		return [
			{ id: "home", label: "Home", to: "/", exact: true },
			{ id: "services", label: "Services", to: "/", hash: "services" },
			{
				id: "bookings",
				label: "My Bookings",
				to: "/customer/bookings",
				comingSoon: true,
			},
			{ id: "profile", label: "Profile", to: "/customer/profile" },
		];
	}

	return [
		{ id: "home", label: "Home", to: "/", exact: true },
		{ id: "services", label: "Services", to: "/", hash: "services" },
		{ id: "about", label: "About", to: "/", hash: "about" },
		{ id: "contact", label: "Contact", to: "/", hash: "contact" },
	];
}

export function getCustomerNavItems(): NavItem[] {
	return [
		{ id: "home", label: "Home", to: "/", exact: true },
		{ id: "services", label: "Services", to: "/", hash: "services" },
		{
			id: "bookings",
			label: "My Bookings",
			to: "/customer/bookings",
			comingSoon: true,
		},
		{ id: "profile", label: "Profile", to: "/customer/profile" },
	];
}

export function getTechnicianNavItems(): NavItem[] {
	return [
		{
			id: "dashboard",
			label: "Dashboard",
			to: "/technician/dashboard",
			exact: true,
		},
		{
			id: "availability",
			label: "Availability",
			to: "/technician/availability",
			comingSoon: true,
		},
		{
			id: "bookings",
			label: "Bookings",
			to: "/technician/bookings",
			comingSoon: true,
		},
		{
			id: "subscription",
			label: "Subscription",
			to: "/technician/subscription",
			comingSoon: true,
		},
		{
			id: "feedback",
			label: "Feedback",
			to: "/technician/feedback",
			comingSoon: true,
		},
		{
			id: "analytics",
			label: "My Analytics",
			to: "/technician/analytics",
			comingSoon: true,
		},
		{
			id: "profile",
			label: "Profile",
			to: "/technician/profile",
			comingSoon: true,
		},
	];
}

export function getAdminNavItems(pendingTechniciansCount?: number): NavItem[] {
	return [
		{
			id: "dashboard",
			label: "Dashboard",
			to: "/admin/dashboard",
			exact: true,
		},
		{
			id: "technicians",
			label: "Technicians",
			to: "/admin/technicians",
			badge:
				pendingTechniciansCount && pendingTechniciansCount > 0
					? pendingTechniciansCount
					: undefined,
		},
		{
			id: "customers",
			label: "Customers",
			to: "/admin/customers",
			comingSoon: true,
		},
		{
			id: "categories",
			label: "Categories",
			to: "/admin/categories",
			comingSoon: true,
		},
		{
			id: "subscriptions",
			label: "Subscriptions",
			to: "/admin/subscriptions",
			comingSoon: true,
		},
		{
			id: "feedback",
			label: "Feedback",
			to: "/admin/feedback",
			comingSoon: true,
		},
		{
			id: "profile",
			label: "Profile",
			to: "/admin/profile",
			comingSoon: true,
		},
	];
}

