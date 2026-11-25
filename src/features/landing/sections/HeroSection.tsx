import { buttonVariants } from "#/components/ui";

export function HeroSection() {
	return (
		<section
			aria-labelledby="hero-heading"
			className="overflow-hidden bg-slate-950 text-white"
		>
			<div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:px-8">
				<div>
					<p className="mb-5 text-xs font-semibold tracking-[0.25em] text-blue-200 uppercase">
						Home services · Technosys
					</p>
					<h1
						id="hero-heading"
						className="max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl"
					>
						Find the right service for your home.
					</h1>
					<p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
						Browse home service categories and see how Technosys is bringing
						customers and skilled technicians together.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<a href="#services" className={buttonVariants({ size: "lg" })}>
							Explore services <span aria-hidden="true">↓</span>
						</a>
						<a
							href="#technicians"
							className={buttonVariants({ variant: "outline", size: "lg" })}
						>
							For technicians
						</a>
					</div>
				</div>
				<div
					aria-hidden="true"
					className="grid min-h-56 place-items-center rounded-3xl border border-white/15 bg-linear-to-br from-brand-900 via-slate-900 to-slate-950 p-8 sm:min-h-80"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 160 120"
						fill="none"
						className="w-full max-w-64 text-blue-200"
					>
						<circle
							cx="80"
							cy="60"
							r="52"
							fill="currentColor"
							fillOpacity=".08"
						/>
						<path
							d="M36 60 80 24l44 36M47 55v42h66V55M69 97V72h22v25M127 32v16m-8-8h16M29 78v12m-6-6h12"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</div>
			</div>
		</section>
	);
}
