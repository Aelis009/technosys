type SpinnerSize = "sm" | "md" | "lg";

const spinnerSizes: Record<SpinnerSize, string> = {
	sm: "h-4 w-4 border-2",
	md: "h-6 w-6 border-2",
	lg: "h-10 w-10 border-[3px]",
};

interface LoadingSpinnerProps {
	size?: SpinnerSize;
	label?: string;
	centered?: boolean;
	className?: string;
}

export function LoadingSpinner({
	size = "md",
	label = "Loading...",
	centered = false,
	className = "",
}: LoadingSpinnerProps) {
	return (
		<output
			aria-live="polite"
			className={[
				"inline-flex items-center gap-2.5 text-slate-600",
				centered ? "w-full justify-center py-8" : "",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<span
				aria-hidden="true"
				className={`animate-spin rounded-full border-brand-600 border-t-transparent ${spinnerSizes[size]}`}
			/>
			<span className="text-sm font-medium">{label}</span>
		</output>
	);
}
