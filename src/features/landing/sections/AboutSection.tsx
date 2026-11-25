import { SectionHeading } from "#/components/ui";

export function AboutSection() {
	return (
		<section
			id="about"
			aria-label="About Technosys"
			className="scroll-mt-20 border-y border-brand-100 bg-brand-50"
		>
			<div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2 md:items-center lg:px-8">
				<SectionHeading
					eyebrow="About us"
					title="A clearer starting point for home maintenance"
				/>
				<p className="max-w-xl text-base leading-relaxed text-slate-700">
					Technosys is building one place for people to discover home services
					and for technicians to present their skills. The public catalog is the
					first step: it shows what kinds of work the platform is set up to
					support.
				</p>
			</div>
		</section>
	);
}
