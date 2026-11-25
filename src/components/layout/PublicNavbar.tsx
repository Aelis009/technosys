import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
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
	const mobileDrawerId = useId();
	const navItems = getPublicNavItems(user).map((item) =>
		item.to === "/" ? item : { ...item, comingSoon: true },
	);

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

		if (!user) {
			return (
				<div
					className={
						mobile
							? "flex flex-col items-start gap-3"
							: "flex items-center gap-3"
					}
				>
					<span className="text-xs font-medium text-slate-600">
						Login · Coming soon
					</span>
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
					<span className="text-xs text-slate-600">
						Admin dashboard · Coming soon
					</span>
				) : null}

				{isApprovedActiveTech ? (
					<span className="text-xs text-slate-600">
						Technician dashboard · Coming soon
					</span>
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
				onClose={() => setMobileMenuOpen(false)}
				items={navItems}
				title="Menu"
				headerContent={user ? renderUserSummary() : undefined}
				footerActions={renderAuthActions(true)}
			/>
		</header>
	);
}
