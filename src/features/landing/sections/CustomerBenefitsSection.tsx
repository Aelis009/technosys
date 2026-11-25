import { buttonVariants, Card, SectionHeading } from "#/components/ui";

export function CustomerBenefitsSection() {
	return (
		<section
			id="customers"
			aria-label="Customer benefits"
			className="scroll-mt-20"
		>
			<Card className="flex h-full flex-col items-start gap-5">
				<SectionHeading
					eyebrow="For customers"
					title="Plan your next home project"
				/>
				<ul className="list-disc space-y-2 ps-5 text-slate-700">
					<li>Browse available service categories without signing in.</li>
					<li>Use category descriptions to identify the help you need.</li>
				</ul>
				<a
					href="#services"
					className={buttonVariants({
						variant: "outline",
						className: "mt-auto",
					})}
				>
					Browse the catalog
				</a>
			</Card>
		</section>
	);
}
