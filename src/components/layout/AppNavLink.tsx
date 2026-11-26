import { Link, type LinkProps, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";
import type { NavItem } from "./navigation";

interface AppNavLinkProps {
	item: NavItem;
	variant?: "top" | "sidebar" | "mobile";
	onNavigate?: () => void;
}

export function AppNavLink({
	item,
	variant = "top",
	onNavigate,
}: AppNavLinkProps) {
	const location = useRouterState({ select: (state) => state.location });
	const disclosure = useRef<HTMLDetailsElement>(null);
	const summary = useRef<HTMLElement>(null);
	const currentHash = location.hash.replace(/^#/, "");

	const isActive = (() => {
		if (item.comingSoon) return false;
		if (item.hash) {
			return location.pathname === item.to && currentHash === item.hash;
		}
		if (item.exact) {
			return location.pathname === item.to && currentHash === "";
		}
		return (
			location.pathname === item.to ||
			location.pathname.startsWith(`${item.to}/`)
		);
	})();

	const baseClasses = {
		top: "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
		sidebar:
			"flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
		mobile:
			"flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
	}[variant];

	if (item.comingSoon) {
		return (
			<span
				aria-disabled="true"
				className={`${baseClasses} cursor-not-allowed text-slate-400`}
			>
				<span className="inline-flex items-center gap-2.5">
					{item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
					<span>{item.label}</span>
				</span>
				<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
					Soon
				</span>
			</span>
		);
	}

	const activeClasses =
		variant === "top"
			? "bg-brand-50 text-brand-700 font-semibold"
			: "bg-brand-50 text-brand-700 font-semibold border border-brand-200/80";

	const inactiveClasses =
		"text-slate-600 hover:bg-slate-100 hover:text-slate-900";

	const className = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;
	if (item.children) {
		return (
			<details
				ref={disclosure}
				className="relative"
				onKeyDown={(event) => {
					if (event.key !== "Escape" || !disclosure.current?.open) return;
					event.preventDefault();
					event.stopPropagation();
					disclosure.current.open = false;
					summary.current?.focus();
				}}
			>
				<summary
					ref={summary}
					className={`${className} cursor-pointer list-none`}
				>
					{item.label} <span aria-hidden="true">▾</span>
				</summary>
				<ul
					className={
						variant === "top"
							? "absolute top-full left-0 z-50 mt-2 min-w-44 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
							: "space-y-1 pl-3"
					}
				>
					{item.children.map((child) => (
						<li key={child.id}>
							<AppNavLink
								item={child}
								variant="mobile"
								onNavigate={() => {
									if (disclosure.current) disclosure.current.open = false;
									onNavigate?.();
								}}
							/>
						</li>
					))}
				</ul>
			</details>
		);
	}
	const content = (
		<>
			<span className="inline-flex items-center gap-2.5">
				{item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
				<span>{item.label}</span>
			</span>
			{item.badge !== undefined ? (
				<span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
					{item.badge}
				</span>
			) : null}
		</>
	);

	if (item.hash && location.pathname === item.to) {
		return (
			<a
				href={`#${item.hash}`}
				aria-current={isActive ? "location" : undefined}
				onClick={onNavigate}
				className={className}
			>
				{content}
			</a>
		);
	}

	return (
		<Link
			to={item.to as LinkProps["to"]}
			hash={item.hash}
			aria-current={isActive ? "page" : undefined}
			onClick={onNavigate}
			className={className}
		>
			{content}
		</Link>
	);
}
