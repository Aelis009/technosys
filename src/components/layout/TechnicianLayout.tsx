import type { ReactNode } from "react";
import { DashboardShell } from "./DashboardShell";
import { getTechnicianNavItems, type LayoutUser } from "./navigation";

interface TechnicianLayoutProps {
	user: LayoutUser;
	coinBalance?: number | null;
	onLogout?: () => void;
	isLoggingOut?: boolean;
	pageTitle?: string;
	pageDescription?: string;
	pageActions?: ReactNode;
	children: ReactNode;
}

export function TechnicianLayout({
	user,
	coinBalance,
	onLogout,
	isLoggingOut = false,
	pageTitle,
	pageDescription,
	pageActions,
	children,
}: TechnicianLayoutProps) {
	const coinBadge = (
		<div
			className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
			title="Coin balance"
		>
			<span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
			<span>Coins: {coinBalance ?? "—"}</span>
		</div>
	);

	return (
		<DashboardShell
			portalTitle="Technician Portal"
			portalSubtitle="Technician Workspace"
			navLabel="Technician"
			navItems={getTechnicianNavItems()}
			user={user}
			onLogout={onLogout}
			isLoggingOut={isLoggingOut}
			headerSlot={coinBadge}
			pageTitle={pageTitle}
			pageDescription={pageDescription}
			pageActions={pageActions}
		>
			{children}
		</DashboardShell>
	);
}

