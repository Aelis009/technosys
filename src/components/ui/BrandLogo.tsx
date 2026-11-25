interface BrandLogoProps {
	subtitle?: string;
	compact?: boolean;
	className?: string;
}

export function BrandLogo({
	subtitle,
	compact = false,
	className = "",
}: BrandLogoProps) {
	return (
		<span className={`inline-flex items-center gap-2.5 ${className}`}>
			<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					className="h-5 w-5"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
				</svg>
			</span>
			{!compact && (
				<span className="flex flex-col leading-none">
					<span className="text-lg font-bold tracking-tight text-slate-900">
						Technosys
					</span>
					{subtitle ? (
						<span className="mt-0.5 text-[11px] font-medium tracking-wide text-slate-500">
							{subtitle}
						</span>
					) : null}
				</span>
			)}
		</span>
	);
}

