import { Card, SectionHeading } from "#/components/ui";

export function TechnicianBenefitsSection() {
	return (
		<section
			id="technicians"
			aria-label="Technician benefits"
			className="scroll-mt-20"
		>
			<Card className="flex h-full flex-col items-start gap-5">
				<SectionHeading
					eyebrow="For technicians"
					title="Show customers what you do best"
				/>
				<p className="text-slate-700">
					Technosys is building a place to present your trade, connect your
					profile to a service category, and apply to join a reviewed technician
					network.
				</p>
				<p className="mt-auto rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
					Technician registration · Coming soon
				</p>
			</Card>
		</section>
	);
}
