import type { ReactNode } from "react";

export type StatusTone =
	| "pending"
	| "approved"
	| "active"
	| "rejected"
	| "suspended"
	| "inactive"
	| "info"
	| "neutral";

const toneStyles: Record<
	StatusTone,
	{ container: string; dot: string; defaultLabel: string }
> = {
	pending: {
		container: "border-amber-200 bg-amber-50 text-amber-800",
		dot: "bg-amber-500",
		defaultLabel: "Pending",
	},
	approved: {
		container: "border-emerald-200 bg-emerald-50 text-emerald-800",
		dot: "bg-emerald-500",
		defaultLabel: "Approved",
	},
	active: {
		container: "border-emerald-200 bg-emerald-50 text-emerald-800",
		dot: "bg-emerald-500",
		defaultLabel: "Active",
	},
	rejected: {
		container: "border-rose-200 bg-rose-50 text-rose-800",
		dot: "bg-rose-500",
		defaultLabel: "Rejected",
	},
	suspended: {
		container: "border-rose-200 bg-rose-50 text-rose-800",
		dot: "bg-rose-500",
		defaultLabel: "Suspended",
	},
	inactive: {
		container: "border-slate-200 bg-slate-100 text-slate-700",
		dot: "bg-slate-400",
		defaultLabel: "Inactive",
	},
	info: {
		container: "border-brand-200 bg-brand-50 text-brand-700",
		dot: "bg-brand-500",
		defaultLabel: "Info",
	},
	neutral: {
		container: "border-slate-200 bg-slate-100 text-slate-700",
		dot: "bg-slate-500",
		defaultLabel: "Status",
	},
};

interface StatusBadgeProps {
	status: StatusTone;
	label?: ReactNode;
	className?: string;
}

export function StatusBadge({
	status,
	label,
	className = "",
}: StatusBadgeProps) {
	const style = toneStyles[status];

	return (
		<span
			className={[
				"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
				style.container,
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<span
				aria-hidden="true"
				className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
			/>
			<span>{label ?? style.defaultLabel}</span>
		</span>
	);
}

