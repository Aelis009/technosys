import type { ReactNode } from "react";
import { Card } from "./Card";

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
	tone?: "default" | "error";
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	tone = "default",
	className = "",
}: EmptyStateProps) {
	const isError = tone === "error";

	return (
		<Card
			padding="lg"
			className={[
				"flex flex-col items-center justify-center text-center",
				isError ? "border-rose-200 bg-rose-50/40" : "",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div
				className={[
					"mb-4 flex h-12 w-12 items-center justify-center rounded-2xl",
					isError ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600",
				].join(" ")}
			>
				{icon ?? (
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						className="h-6 w-6"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-2.586a1 1 0 0 0-.707.293l-2.414 2.414a1 1 0 0 1-.707.293h-3.172a1 1 0 0 1-.707-.293l-2.414-2.414A1 1 0 0 0 6.586 13H4"
						/>
					</svg>
				)}
			</div>
			<h3 className="text-base font-semibold text-slate-900">{title}</h3>
			<p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
				{description}
			</p>
			{action ? <div className="mt-5">{action}</div> : null}
		</Card>
	);
}
