import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { UserAvatar } from "../ui/UserAvatar";
import type { LayoutUser } from "./navigation";

export function TechnicianAccountMenu({ user }: { user: LayoutUser }) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		function dismiss(event: PointerEvent) {
			if (event.target instanceof Node && !root.current?.contains(event.target))
				setOpen(false);
		}
		function dismissOnEscape(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			setOpen(false);
			trigger.current?.focus();
		}
		document.addEventListener("pointerdown", dismiss);
		document.addEventListener("keydown", dismissOnEscape);
		function dismissOnFocus(event: FocusEvent) {
			if (event.target instanceof Node && !root.current?.contains(event.target))
				setOpen(false);
		}
		document.addEventListener("focusin", dismissOnFocus);
		return () => {
			document.removeEventListener("pointerdown", dismiss);
			document.removeEventListener("keydown", dismissOnEscape);
			document.removeEventListener("focusin", dismissOnFocus);
		};
	}, [open]);

	return (
		<div ref={root} className="relative">
			<button
				ref={trigger}
				type="button"
				aria-label={`Account options for ${user.name}`}
				aria-expanded={open}
				aria-controls={menuId}
				onClick={() => setOpen(!open)}
				className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100 sm:px-2"
			>
				<UserAvatar
					name={user.name}
					imageUrl={user.profileImageUrl}
					size="sm"
				/>
				<span className="hidden max-w-36 truncate text-sm font-medium text-slate-700 sm:block">
					{user.name}
				</span>
				<svg
					aria-hidden="true"
					className="size-3.5 text-slate-500"
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				>
					<path d="m5 7 5 5 5-5" />
				</svg>
			</button>
			<div
				id={menuId}
				hidden={!open}
				className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-lg"
			>
				<Link
					to="/technician/profile"
					onClick={() => setOpen(false)}
					className="block rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100"
				>
					Profile
				</Link>
				<div className="flex items-center justify-between gap-2 px-3 py-2 text-slate-500">
					<span>Settings</span>
					<span className="text-xs">Soon</span>
				</div>
			</div>
		</div>
	);
}
