import { Card, SectionHeading } from "#/components/ui";

const steps = [
	[
		"Explore a category",
		"Browse the catalog to find the kind of work your home needs.",
	],
	[
		"Prepare the details",
		"Note what needs attention so you can describe the job clearly when requests open.",
	],
	[
		"Connect with a technician",
		"Technician matching and online booking are planned for a later release.",
	],
] as const;

export function HowItWorksSection() {
	return (
		<section
			id="how-it-works"
			aria-label="How it works"
			className="scroll-mt-20"
		>
			<div className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="From task to technician"
					title="How it works"
				/>
				<ol className="grid gap-4 md:grid-cols-3">
					{steps.map(([title, description], index) => (
						<li key={title}>
							<Card className="h-full">
								<span
									aria-hidden="true"
									className="text-sm font-bold text-brand-700"
								>
									Step {index + 1}
								</span>
								<h3 className="mt-2 text-lg font-semibold">{title}</h3>
								<p className="mt-2 text-sm leading-relaxed text-slate-600">
									{description}
								</p>
							</Card>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
