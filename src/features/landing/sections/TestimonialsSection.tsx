import { Card, SectionHeading } from "#/components/ui";

export function TestimonialsSection() {
	return (
		<section
			aria-label="Demo testimonials"
			className="border-t border-slate-200 bg-white"
		>
			<div className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Demo testimonials"
					title="What a good experience could look like"
					description="These fictional examples are not reviews from real customers or technicians."
				/>
				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<figure>
							<blockquote className="leading-relaxed text-slate-800">
								“I’d like to know which type of service I need before I start
								calling around.”
							</blockquote>
							<figcaption className="mt-4 text-sm font-semibold text-slate-600">
								Demo · Homeowner
							</figcaption>
						</figure>
					</Card>
					<Card>
						<figure>
							<blockquote className="leading-relaxed text-slate-800">
								“I’d like customers to see the kind of work I do before they
								contact me.”
							</blockquote>
							<figcaption className="mt-4 text-sm font-semibold text-slate-600">
								Demo · Technician
							</figcaption>
						</figure>
					</Card>
				</div>
			</div>
		</section>
	);
}
