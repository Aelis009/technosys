import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	SectionHeading,
	StatusBadge,
} from "#/components/ui";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<PublicLayout>
			<section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
				<div className="space-y-8">
					<div className="space-y-4">
						<StatusBadge status="info" label="Stage 6 – Layout & UI Shell" />
						<SectionHeading
							headingAs="h1"
							title="Technosys – Service Management System"
							description="Reusable public and role-based layouts, responsive navigation, and Tailwind UI primitives are ready. Database-driven landing page sections will be added in Stage 7."
						/>
					</div>

					<div className="grid gap-6 md:grid-cols-3">
						<Card>
							<CardHeader>
								<CardTitle>Public Layout</CardTitle>
								<CardDescription>
									Sticky responsive navbar, native modal mobile navigation
									drawer, skip links, and structured footer.
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-4">
								<StatusBadge status="active" label="Configured" />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Role Layouts</CardTitle>
								<CardDescription>
									Dedicated customer, technician, and admin layouts sharing a
									reusable dashboard shell without duplicated UI.
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-4">
								<StatusBadge status="active" label="Configured" />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>UI Primitives</CardTitle>
								<CardDescription>
									Accessible buttons, cards, form fields, modal dialog, status
									badges, spinners, and empty states.
								</CardDescription>
							</CardHeader>
							<CardContent className="mt-4">
								<StatusBadge status="active" label="Configured" />
							</CardContent>
						</Card>
					</div>
				</div>
			</section>
		</PublicLayout>
	);
}
