import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useLogout } from "#/features/auth/useLogout";
import type { LayoutUser } from "./navigation";
import { PublicFooter } from "./PublicFooter";
import { PublicNavbar } from "./PublicNavbar";

const rootRoute = getRouteApi("__root__");

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
	const { auth, registrationReady } = rootRoute.useRouteContext();
	const logout = useLogout();
	const layoutUser: LayoutUser | null =
		user !== undefined
			? user
			: auth.status === "authenticated"
				? {
						...auth.user,
						name: auth.user.name?.trim() || "Account",
						technicianStatus: auth.technicianStatus,
					}
				: null;

	return (
		<div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
			<a href="#main-content" className="skip-link visually-hidden">
				Skip to main content
			</a>
			<PublicNavbar
				user={layoutUser}
				onLogout={onLogout ?? logout.run}
				isLoggingOut={isLoggingOut || logout.busy}
			/>
			{logout.error ? <p role="alert">{logout.error}</p> : null}
			{auth.status === "unavailable" ? (
				<p role="alert">Session unavailable. Please try again later.</p>
			) : null}
			<main id="main-content" tabIndex={-1} className="flex-1 outline-none">
				{children}
			</main>
			<PublicFooter registrationReady={registrationReady} />
		</div>
	);
}
