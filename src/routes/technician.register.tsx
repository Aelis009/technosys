import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { AuthPageCard } from "#/features/auth/AuthPageCard";
import { TechnicianRegistrationForm } from "#/features/auth/TechnicianRegistrationForm";
import { getPublicServiceCategories } from "#/server/features/service-categories/public";

export const Route = createFileRoute("/technician/register")({
	loader: async ({ context }) => ({
		ready: context.registrationReady,
		catalog: context.registrationReady
			? await getPublicServiceCategories()
			: { ok: false as const },
	}),
	component: RegistrationPage,
});

function RegistrationPage() {
	const { ready, catalog } = Route.useLoaderData();
	return (
		<PublicLayout>
			{ready && catalog.ok && catalog.categories.length ? (
				<TechnicianRegistrationForm categories={catalog.categories} />
			) : (
				<AuthPageCard title="Technician registration">
					<p>
						{ready
							? "Service categories are unavailable. Please try again later."
							: "Technician registration · Coming soon"}
					</p>
					<Link to="/technician/login" className="text-brand-700 underline">
						Sign in as technician
					</Link>
				</AuthPageCard>
			)}
		</PublicLayout>
	);
}
