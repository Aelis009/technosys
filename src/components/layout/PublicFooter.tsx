import { Link } from "@tanstack/react-router";
import { BrandLogo } from "../ui/BrandLogo";

export function PublicFooter({
	registrationReady = false,
}: {
	registrationReady?: boolean;
}) {
	const currentYear = new Date().getFullYear();

	return (
		<footer
			id="contact"
			className="scroll-mt-20 border-t border-slate-200 bg-slate-900 text-slate-300"
		>
			<div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-4">
						<div className="inline-flex rounded-xl bg-white px-3 py-2">
							<BrandLogo subtitle="Home Services Platform" />
						</div>
						<p className="text-sm leading-relaxed text-slate-400">
							A public catalog for home maintenance and repairs, with more tools
							for customers and technicians on the way.
						</p>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-wider text-white uppercase">
							Explore
						</h2>
						<ul className="mt-4 space-y-2.5 text-sm">
							<li>
								<Link to="/" className="transition-colors hover:text-white">
									Home
								</Link>
							</li>
							<li>
								<a
									href="/#services"
									className="transition-colors hover:text-white"
								>
									Services
								</a>
							</li>
							<li>
								<a
									href="/#about"
									className="transition-colors hover:text-white"
								>
									About Technosys
								</a>
							</li>
							<li>
								<a
									href="/#how-it-works"
									className="transition-colors hover:text-white"
								>
									How It Works
								</a>
							</li>
						</ul>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-wider text-white uppercase">
							Portals
						</h2>
						<ul className="mt-4 space-y-2.5 text-sm">
							<li>
								<Link
									to="/customer/login"
									className="transition-colors hover:text-white"
								>
									Customer login
								</Link>
							</li>
							<li>
								<Link
									to="/technician/login"
									className="transition-colors hover:text-white"
								>
									Technician login
								</Link>
							</li>
							<li>
								{registrationReady ? (
									<Link
										to="/technician/register"
										className="transition-colors hover:text-white"
									>
										Technician registration
									</Link>
								) : (
									"Technician registration · Coming soon"
								)}
							</li>
						</ul>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-wider text-white uppercase">
							Contact
						</h2>
						<p className="mt-4 text-sm text-slate-400">
							Support contact details · Coming soon
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-400 sm:flex-row">
					<p>© {currentYear} Technosys Service Management System.</p>
					<p>Built with TanStack Start, Drizzle ORM, and PostgreSQL.</p>
				</div>
			</div>
		</footer>
	);
}
