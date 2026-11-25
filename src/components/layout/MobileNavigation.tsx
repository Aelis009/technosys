import { type ReactNode, useEffect, useId, useRef } from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { AppNavLink } from "./AppNavLink";
import type { NavItem } from "./navigation";

interface MobileNavigationProps {
	id?: string;
	open: boolean;
	onClose: () => void;
	items: NavItem[];
	title?: string;
	headerContent?: ReactNode;
	footerActions?: ReactNode;
}

export function MobileNavigation({
	id,
	open,
	onClose,
	items,
	title = "Navigation",
	headerContent,
	footerActions,
}: MobileNavigationProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const navLabelId = useId();

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	return (
		<dialog
			id={id}
			ref={dialogRef}
			aria-label={title}
			onClose={onClose}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onClose();
				}
			}}
			onClick={(event) => {
				if (event.target === dialogRef.current) {
					onClose();
				}
			}}
			className="app-dialog fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-xs border-l border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
		>
			<div className="flex h-full flex-col">
				<div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
					<BrandLogo subtitle={title} />
					<button
						type="button"
						onClick={onClose}
						aria-label="Close navigation menu"
						className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
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
								d="M6 18 18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{headerContent ? (
					<div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3.5">
						{headerContent}
					</div>
				) : null}

				<nav
					aria-labelledby={navLabelId}
					className="flex-1 overflow-y-auto px-3 py-4"
				>
					<span id={navLabelId} className="visually-hidden">
						{title}
					</span>
					<ul className="flex flex-col gap-1">
						{items.map((item) => (
							<li key={item.id}>
								<AppNavLink item={item} variant="mobile" onNavigate={onClose} />
							</li>
						))}
					</ul>
				</nav>

				{footerActions ? (
					<div className="border-t border-slate-100 p-4">{footerActions}</div>
				) : null}
			</div>
		</dialog>
	);
}
