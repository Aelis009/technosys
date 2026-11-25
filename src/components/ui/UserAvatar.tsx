interface UserAvatarProps {
	name: string;
	imageUrl?: string | null;
	size?: "sm" | "md" | "lg";
	decorative?: boolean;
	className?: string;
}

const avatarSizes = {
	sm: "h-8 w-8 text-xs",
	md: "h-10 w-10 text-sm",
	lg: "h-12 w-12 text-base",
};

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "U";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function UserAvatar({
	name,
	imageUrl,
	size = "sm",
	decorative = true,
	className = "",
}: UserAvatarProps) {
	const sizeClass = avatarSizes[size];

	if (imageUrl) {
		return (
			<img
				src={imageUrl}
				alt={decorative ? "" : `${name} avatar`}
				className={`shrink-0 rounded-full border border-slate-200 object-cover ${sizeClass} ${className}`}
			/>
		);
	}

	return (
		<span
			aria-hidden={decorative || undefined}
			className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ${sizeClass} ${className}`}
		>
			{getInitials(name)}
		</span>
	);
}

