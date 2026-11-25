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
			<img
				src="/Brandlogo.png"
				alt={compact ? "Technosys" : ""}
				width={44}
				height={44}
				className="size-11 shrink-0 object-contain"
			/>
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
