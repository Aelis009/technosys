import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
	| "primary"
	| "secondary"
	| "outline"
	| "ghost"
	| "danger";

export type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
	primary:
		"bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-300",
	secondary:
		"bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:bg-slate-950 disabled:bg-slate-400",
	outline:
		"border border-slate-300 bg-white text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400",
	ghost:
		"bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400",
	danger:
		"bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300",
};

const sizeStyles: Record<ButtonSize, string> = {
	sm: "min-h-9 px-3 py-1.5 text-sm rounded-lg gap-1.5",
	md: "min-h-10 px-4 py-2 text-sm rounded-xl gap-2",
	lg: "min-h-11 px-5 py-2.5 text-base rounded-xl gap-2.5",
};

export function buttonVariants({
	variant = "primary",
	size = "md",
	fullWidth = false,
	className = "",
}: {
	variant?: ButtonVariant;
	size?: ButtonSize;
	fullWidth?: boolean;
	className?: string;
} = {}): string {
	return [
		"inline-flex items-center justify-center font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed",
		variantStyles[variant],
		sizeStyles[size],
		fullWidth ? "w-full" : "",
		className,
	]
		.filter(Boolean)
		.join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	fullWidth?: boolean;
	isLoading?: boolean;
	leftIcon?: ReactNode;
	rightIcon?: ReactNode;
}

export function Button({
	variant = "primary",
	size = "md",
	fullWidth = false,
	isLoading = false,
	leftIcon,
	rightIcon,
	disabled,
	type = "button",
	className = "",
	children,
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			disabled={disabled || isLoading}
			aria-busy={isLoading || undefined}
			className={buttonVariants({ variant, size, fullWidth, className })}
			{...props}
		>
			{isLoading ? (
				<span
					aria-hidden="true"
					className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
				/>
			) : (
				leftIcon
			)}
			<span>{children}</span>
			{!isLoading ? rightIcon : null}
		</button>
	);
}

