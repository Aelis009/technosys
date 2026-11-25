import type { ReactNode } from "react";

interface SectionHeadingProps {
	eyebrow?: string;
	title: string;
	description?: string;
	align?: "left" | "center";
	headingAs?: "h1" | "h2" | "h3";
	actions?: ReactNode;
	className?: string;
}

export function SectionHeading({
	eyebrow,
	title,
	description,
	align = "left",
	headingAs: HeadingTag = "h2",
	actions,
	className = "",
}: SectionHeadingProps) {
	const isCentered = align === "center";

	return (
		<div
			className={[
				"flex flex-col gap-3",
				isCentered
					? "mx-auto max-w-2xl items-center text-center"
					: "sm:flex-row sm:items-end sm:justify-between",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div className={isCentered ? "space-y-2" : "max-w-2xl space-y-2"}>
				{eyebrow ? (
					<p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">
						{eyebrow}
					</p>
				) : null}
				<HeadingTag className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
					{title}
				</HeadingTag>
				{description ? (
					<p className="text-base leading-relaxed text-slate-600">
						{description}
					</p>
				) : null}
			</div>
			{actions ? <div className="shrink-0">{actions}</div> : null}
		</div>
	);
}

