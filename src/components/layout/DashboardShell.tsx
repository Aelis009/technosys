import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { useLogout } from "#/features/auth/useLogout";
import { BrandLogo } from "../ui/BrandLogo";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { UserAvatar } from "../ui/UserAvatar";
import { AppNavLink } from "./AppNavLink";
import { type LogoHome, MobileNavigation } from "./MobileNavigation";
import type { LayoutUser, NavItem } from "./navigation";

interface DashboardShellProps {
	homeTo?: LogoHome;
	portalTitle: string;
	portalSubtitle: string;
	navLabel: string;
	navItems: NavItem[];
	user: LayoutUser;
	onLogout?: () => void;
	isLoggingOut?: boolean;
	headerSlot?: ReactNode;
	sidebarFooter?: ReactNode;
	pageTitle?: string;
	pageDescription?: string;
	pageActions?: ReactNode;
	children: ReactNode;
}
 
export function DashboardShell({
	homeTo = "/",
	portalTitle,
	portalSubtitle,
	navLabel,
	navItems,
	user,
	onLogout,
	isLoggingOut = false,
	headerSlot,
	sidebarFooter,
	pageTitle,
	pageDescription,
	pageActions,
	children,
}: DashboardShellProps) {
	const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
	const logout = useLogout();
	onLogout ??= logout.run;
	isLoggingOut ||= logout.busy;
	const mobileDrawerId = useId();

	const userSummary = (
		<div className="flex items-center gap-3">
			<UserAvatar name={user.name} imageUrl={user.profileImageUrl} size="md" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-slate-900">
					{user.name}
				</p>
				<p className="truncate text-xs text-slate-500">
					{user.email ?? user.mobile ?? portalTitle}
				</p>
			</div>
		</div>
	);

	return (
		<div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
			{logout.error ? <p role="alert">{logout.error}</p> : null}
			<a href="#dashboard-content" className="skip-link visually-hidden">
				Skip to dashboard content
			</a>

			<header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
				<div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setMobileDrawerOpen(true)}
							aria-label={`Open ${portalTitle} menu`}
							aria-controls={mobileDrawerId}
							aria-expanded={mobileDrawerOpen}
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 xl:hidden cursor-pointer"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								className="h-5 w-5"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M4 6h16M4 12h16M4 18h16"
								/>
							</svg>
						</button>

						<Link to={homeTo} className="rounded-lg">
							<BrandLogo subtitle={portalSubtitle} />
						</Link>
					</div>

					<nav aria-label={navLabel} className="hidden xl:block">
						<ul className="flex flex-wrap items-center gap-0.5">
							{navItems.map((item) => (
								<li key={item.id}>
									<AppNavLink item={item} />
								</li>
							))}
						</ul>
					</nav>

					<div className="flex items-center gap-3">
						{headerSlot}

						{user.technicianStatus ? (
							<div className="hidden sm:block">
								<StatusBadge status={user.technicianStatus.activeStatus} />
							</div>
						) : null}

						<div className="hidden items-center gap-2.5 sm:flex">
							<UserAvatar
								name={user.name}
								imageUrl={user.profileImageUrl}
								size="sm"
							/>
							<span className="max-w-36 truncate text-sm font-medium text-slate-700">
								{user.name}
							</span>
						</div>

						{onLogout ? (
							<Button
								variant="outline"
								size="sm"
								isLoading={isLoggingOut}
								onClick={onLogout}
							>
								Logout
							</Button>
						) : null}
					</div>
				</div>
			</header>

			<div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:px-8">
				<main
					id="dashboard-content"
					tabIndex={-1}
					className="min-w-0 flex-1 outline-none"
				>
					{pageTitle ? (
						<div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h1 className="text-2xl font-bold tracking-tight text-slate-900">
									{pageTitle}
								</h1>
								{pageDescription ? (
									<p className="mt-1 text-sm text-slate-600">
										{pageDescription}
									</p>
								) : null}
							</div>
							{pageActions ? (
								<div className="shrink-0">{pageActions}</div>
							) : null}
						</div>
					) : null}

					{children}
				</main>
			</div>

			<MobileNavigation
				homeTo={homeTo}
				id={mobileDrawerId}
				open={mobileDrawerOpen}
				onClose={() => setMobileDrawerOpen(false)}
				items={navItems}
				title={portalTitle}
				headerContent={userSummary}
				footerActions={
					onLogout ? (
						<div className="space-y-3">
							{sidebarFooter}
							<Button
								variant="outline"
								size="sm"
								fullWidth
								isLoading={isLoggingOut}
								onClick={() => {
									setMobileDrawerOpen(false);
									onLogout();
								}}
							>
								Logout
							</Button>
						</div>
					) : (
						sidebarFooter
					)
				}
			/>
		</div>
	);
}
