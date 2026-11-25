import { Link, type LinkProps } from "@tanstack/react-router";
import { BrandLogo } from "../ui/BrandLogo";

export function PublicFooter() {
	const currentYear = new Date().getFullYear();

	return (
		<footer
			id="contact"
			className="border-t border-slate-200 bg-slate-900 text-slate-300"
		>
			<div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
				<div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
					<div className="space-y-4">
						<div className="inline-flex rounded-xl bg-white px-3 py-2">
							<BrandLogo subtitle="Home Services Platform" />
						</div>
						<p className="text-sm leading-relaxed text-slate-400">
							Connecting homeowners with verified, skilled service professionals
							for reliable home maintenance and repairs.
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
								<Link
									to="/"
									hash="services"
									className="transition-colors hover:text-white"
								>
									Services
								</Link>
							</li>
							<li>
								<Link
									to="/"
									hash="about"
									className="transition-colors hover:text-white"
								>
									About Technosys
								</Link>
							</li>
							<li>
								<Link
									to="/"
									hash="how-it-works"
									className="transition-colors hover:text-white"
								>
									How It Works
								</Link>
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
									to={"/customer/login" as LinkProps["to"]}
									className="transition-colors hover:text-white"
								>
									Customer Login
								</Link>
							</li>
							<li>
								<Link
									to={"/technician/login" as LinkProps["to"]}
									className="transition-colors hover:text-white"
								>
									Technician Login
								</Link>
							</li>
							<li>
								<Link
									to={"/technician/register" as LinkProps["to"]}
									className="transition-colors hover:text-white"
								>
									Become a Technician
								</Link>
							</li>
							<li>
								<Link
									to={"/admin/login" as LinkProps["to"]}
									className="transition-colors hover:text-white"
								>
									Admin Portal
								</Link>
							</li>
						</ul>
					</div>

					<div>
						<h2 className="text-sm font-semibold tracking-wider text-white uppercase">
							Contact
						</h2>
						<ul className="mt-4 space-y-2.5 text-sm text-slate-400">
							<li>Support: support@technosys.local</li>
							<li>Service Hours: Mon – Sat, 8:00 AM – 8:00 PM</li>
							<li>Verified Professionals Network</li>
						</ul>
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

