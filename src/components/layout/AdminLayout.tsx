import type { ReactNode } from "react";
import { DashboardShell } from "./DashboardShell";
import { getAdminNavItems, type LayoutUser } from "./navigation";

interface AdminLayoutProps {
	user: LayoutUser;
	pendingTechniciansCount?: number;
	onLogout?: () => void;
	isLoggingOut?: boolean;
	pageTitle?: string;
	pageDescription?: string;
	pageActions?: ReactNode;
	children: ReactNode;
}

export function AdminLayout({
	user,
	pendingTechniciansCount,
	onLogout,
	isLoggingOut = false,
	pageTitle,
	pageDescription,
	pageActions,
	children,
}: AdminLayoutProps) {
	return (
		<DashboardShell
			homeTo="/admin/dashboard"
			portalTitle="Admin Console"
			portalSubtitle="Administration"
			navLabel="Administrator"
			navItems={getAdminNavItems(pendingTechniciansCount)}
			user={user}
			onLogout={onLogout}
			isLoggingOut={isLoggingOut}
			pageTitle={pageTitle}
			pageDescription={pageDescription}
			pageActions={pageActions}
		>
			{children}
		</DashboardShell>
	);
}
