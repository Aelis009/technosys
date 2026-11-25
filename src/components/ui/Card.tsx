import type { HTMLAttributes, ReactNode } from "react";

type CardPadding = "none" | "sm" | "md" | "lg";

const paddingStyles: Record<CardPadding, string> = {
	none: "",
	sm: "p-4",
	md: "p-6",
	lg: "p-8",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
	padding?: CardPadding;
	interactive?: boolean;
}

export function Card({
	padding = "md",
	interactive = false,
	className = "",
	children,
	...props
}: CardProps) {
	return (
		<div
			className={[
				"rounded-2xl border border-slate-200 bg-white shadow-xs",
				interactive
					? "transition-shadow duration-200 hover:border-slate-300 hover:shadow-md"
					: "",
				paddingStyles[padding],
				className,
			]
				.filter(Boolean)
				.join(" ")}
			{...props}
		>
			{children}
		</div>
	);
}

export function CardHeader({
	className = "",
	children,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={`flex flex-col gap-1.5 ${className}`} {...props}>
			{children}
		</div>
	);
}

export function CardTitle({
	as: Tag = "h3",
	className = "",
	children,
}: {
	as?: "h2" | "h3" | "h4";
	className?: string;
	children: ReactNode;
}) {
	return (
		<Tag
			className={`text-lg font-semibold tracking-tight text-slate-900 ${className}`}
		>
			{children}
		</Tag>
	);
}

export function CardDescription({
	className = "",
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<p className={`text-sm leading-relaxed text-slate-600 ${className}`}>
			{children}
		</p>
	);
}

export function CardContent({
	className = "",
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <div className={className}>{children}</div>;
}

export function CardFooter({
	className = "",
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={`mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 ${className}`}
		>
			{children}
		</div>
	);
}

