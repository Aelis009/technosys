import type { ReactNode } from "react";
import { Card, SectionHeading } from "#/components/ui";

interface AuthPageCardProps {
	title: string;
	description?: string;
	children: ReactNode;
}

export function AuthPageCard({
	title,
	description,
	children,
}: AuthPageCardProps) {
	return (
		<div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-16">
			<Card className="space-y-6">
				<SectionHeading
					headingAs="h1"
					title={title}
					description={description}
				/>
				{children}
			</Card>
		</div>
	);
}
