import { buttonVariants } from "#/components/ui";

export function CallToActionSection() {
	return (
		<section aria-labelledby="cta-heading" className="bg-brand-900 text-white">
			<div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center lg:px-8">
				<div>
					<h2 id="cta-heading" className="text-3xl font-bold tracking-tight">
						Start with the service catalog
					</h2>
					<p className="mt-2 max-w-xl text-blue-100">
						Explore the categories today, or see what Technosys is planning for
						technicians.
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap gap-3">
					<a
						href="#services"
						className={buttonVariants({ variant: "outline" })}
					>
						Explore services
					</a>
					<a
						href="#technicians"
						className={buttonVariants({ variant: "secondary" })}
					>
						For technicians
					</a>
				</div>
			</div>
		</section>
	);
}
