import type { ReactNode } from "react";
import { DashboardShell } from "./DashboardShell";
import { getCustomerNavItems, type LayoutUser } from "./navigation";

interface CustomerLayoutProps {
	user: LayoutUser;
	onLogout?: () => void;
	isLoggingOut?: boolean;
	pageTitle?: string;
	pageDescription?: string;
	pageActions?: ReactNode;
	children: ReactNode;
}

export function CustomerLayout({
	user,
	onLogout,
	isLoggingOut = false,
	pageTitle,
	pageDescription,
	pageActions,
	children,
}: CustomerLayoutProps) {
	return (
		<DashboardShell
			portalTitle="Customer Account"
			portalSubtitle="Customer Portal"
			navLabel="Customer"
			navItems={getCustomerNavItems()}
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

