import type { ReactNode } from "react";
import type { LayoutUser } from "./navigation";
import { PublicFooter } from "./PublicFooter";
import { PublicNavbar } from "./PublicNavbar";

interface PublicLayoutProps {
	user?: LayoutUser | null;
	onLogout?: () => void;
	isLoggingOut?: boolean;
	children: ReactNode;
}

export function PublicLayout({
	user,
	onLogout,
	isLoggingOut = false,
	children,
}: PublicLayoutProps) {
	return (
		<div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
			<a href="#main-content" className="skip-link visually-hidden">
				Skip to main content
			</a>
			<PublicNavbar
				user={user}
				onLogout={onLogout}
				isLoggingOut={isLoggingOut}
			/>
			<main id="main-content" tabIndex={-1} className="flex-1 outline-none">
				{children}
			</main>
			<PublicFooter />
		</div>
	);
}

