import {
	Card,
	CardDescription,
	CardTitle,
	SectionHeading,
} from "#/components/ui";

const reasons = [
	[
		"A current service catalog",
		"See active service categories straight from the Technosys catalog.",
	],
	[
		"Technician review",
		"Technician applications are designed to go through a review before dashboard access is granted.",
	],
	[
		"Clear availability",
		"See what you can use today and what is still coming, without being sent to unfinished pages.",
	],
] as const;

export function WhyChooseUsSection() {
	return (
		<section aria-label="Why choose Technosys" className="bg-white">
			<div className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading title="Why choose Technosys?" />
				<ul className="grid gap-4 md:grid-cols-3">
					{reasons.map(([title, description]) => (
						<li key={title}>
							<Card className="h-full space-y-2">
								<CardTitle>{title}</CardTitle>
								<CardDescription>{description}</CardDescription>
							</Card>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
