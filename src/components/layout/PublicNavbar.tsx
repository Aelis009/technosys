import { Link } from "@tanstack/react-router";
import { type KeyboardEvent, useId, useState } from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { Button, buttonVariants } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { UserAvatar } from "../ui/UserAvatar";
import { AppNavLink } from "./AppNavLink";
import { MobileNavigation } from "./MobileNavigation";
import { getPublicNavItems, type LayoutUser } from "./navigation";

interface PublicNavbarProps {
	user?: LayoutUser | null;
	onLogout?: () => void;
	isLoggingOut?: boolean;
}

export function PublicNavbar({
	user,
	onLogout,
	isLoggingOut = false,
}: PublicNavbarProps) {
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [loginOpen, setLoginOpen] = useState(false);
	const mobileDrawerId = useId();
	const loginMenuId = useId();
	const navItems = getPublicNavItems(user);

	const isAdmin = Boolean(user?.roles.includes("admin"));
	const isTechnician = Boolean(user?.roles.includes("technician"));
	const isApprovedActiveTech =
		isTechnician &&
		user?.technicianStatus?.verificationStatus === "approved" &&
		user?.technicianStatus?.activeStatus === "active";

	const renderUserSummary = () => {
		if (!user) return null;
		return (
			<div className="flex items-center gap-2.5">
				<UserAvatar
					name={user.name}
					imageUrl={user.profileImageUrl}
					size="sm"
				/>
				<div className="min-w-0">
					<p className="truncate text-sm font-semibold text-slate-900">
						{user.name}
					</p>
					{isTechnician && user.technicianStatus ? (
						<StatusBadge status={user.technicianStatus.verificationStatus} />
					) : (
						<p className="truncate text-xs text-slate-500">
							{isAdmin ? "Administrator" : "Customer"}
						</p>
					)}
				</div>
			</div>
		);
	};

	const renderAuthActions = (mobile = false) => {
		const closeIfMobile = mobile ? () => setMobileMenuOpen(false) : undefined;
		const menuId = `${loginMenuId}-${mobile ? "mobile" : "desktop"}`;
		const dismissLogin = (event: KeyboardEvent<HTMLElement>) => {
			if (event.key !== "Escape" || !loginOpen) return;
			event.preventDefault();
			event.stopPropagation();
			setLoginOpen(false);
			event.currentTarget
				.closest("[data-login-menu]")
				?.querySelector<HTMLButtonElement>("button")
				?.focus();
		};

		if (!user) {
			return (
				<div
					className={
						mobile
							? "flex flex-col items-start gap-3"
							: "flex items-center gap-3"
					}
				>
					<div className="relative" data-login-menu>
						<button
							type="button"
							aria-expanded={loginOpen}
							aria-controls={menuId}
							onKeyDown={dismissLogin}
							onClick={() => setLoginOpen(!loginOpen)}
							className="text-sm font-medium text-slate-600 hover:text-slate-900"
						>
							Login
						</button>
						{loginOpen ? (
							<div
								id={menuId}
								className="z-50 mt-2 flex min-w-40 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:absolute"
							>
								<Link
									to="/customer/login"
									onKeyDown={dismissLogin}
									onClick={() => {
										setLoginOpen(false);
										closeIfMobile?.();
									}}
								>
									Customer
								</Link>
								<Link
									to="/technician/login"
									onKeyDown={dismissLogin}
									onClick={() => {
										setLoginOpen(false);
										closeIfMobile?.();
									}}
								>
									Technician
								</Link>
							</div>
						) : null}
					</div>
					{/* biome-ignore lint/a11y/useValidAnchor: The link navigates normally; the handler only closes the mobile drawer. */}
					<a
						href="/#technicians"
						onClick={closeIfMobile}
						className={buttonVariants({
							variant: "primary",
							size: "sm",
							fullWidth: mobile,
						})}
					>
						For technicians
					</a>
				</div>
			);
		}

		return (
			<div
				className={mobile ? "flex flex-col gap-2.5" : "flex items-center gap-3"}
			>
				{isAdmin ? (
					<Link to="/admin/dashboard" className="text-sm underline">
						Dashboard
					</Link>
				) : null}

				{isTechnician && !isAdmin ? (
					<Link
						to={
							isApprovedActiveTech
								? "/technician/dashboard"
								: "/technician/status"
						}
						className="text-sm underline"
					>
						{isApprovedActiveTech ? "Dashboard" : "Status"}
					</Link>
				) : null}

				{!mobile ? renderUserSummary() : null}

				{onLogout ? (
					<Button
						variant="outline"
						size="sm"
						fullWidth={mobile}
						isLoading={isLoggingOut}
						onClick={() => {
							closeIfMobile?.();
							onLogout();
						}}
					>
						Logout
					</Button>
				) : null}
			</div>
		);
	};

	return (
		<header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<Link
					to="/"
					className="shrink-0 rounded-lg focus-visible:outline-brand-600"
				>
					<BrandLogo subtitle="Service Management" />
				</Link>

				<nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
					<ul className="flex items-center gap-1">
						{navItems.map((item) => (
							<li key={item.id}>
								<AppNavLink item={item} variant="top" />
							</li>
						))}
					</ul>
				</nav>

				<div className="hidden shrink-0 items-center lg:flex">
					{renderAuthActions(false)}
				</div>

				<button
					type="button"
					onClick={() => setMobileMenuOpen(true)}
					aria-label="Open navigation menu"
					aria-controls={mobileDrawerId}
					aria-expanded={mobileMenuOpen}
					className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden cursor-pointer"
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
					<span className="ml-2 hidden sm:inline">Menu</span>
				</button>
			</div>

			<MobileNavigation
				id={mobileDrawerId}
				open={mobileMenuOpen}
				onClose={() => {
					setMobileMenuOpen(false);
					setLoginOpen(false);
				}}
				items={navItems}
				title="Menu"
				headerContent={user ? renderUserSummary() : undefined}
				footerActions={renderAuthActions(true)}
			/>
		</header>
	);
}
