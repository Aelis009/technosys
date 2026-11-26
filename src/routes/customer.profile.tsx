import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { AuthPageCard } from "#/features/auth/AuthPageCard";
import { CustomerProfileForm } from "#/features/auth/CustomerProfileForm";

export const Route = createFileRoute("/customer/profile")({
	beforeLoad: ({ context }) => {
		if (context.auth.status === "guest")
			throw redirect({ to: "/customer/login" });
	},
	component: CustomerProfile,
});

function CustomerProfile() {
	const { auth } = Route.useRouteContext();
	const customerOnly =
		auth.status === "authenticated" &&
		auth.user.roles.includes("customer") &&
		!auth.user.roles.includes("admin") &&
		!auth.user.roles.includes("technician");
	return (
		<PublicLayout>
			<AuthPageCard
				title="Customer profile"
				description="Add or update your name."
			>
				{auth.status === "unavailable" ? (
					<p role="alert">
						We could not check your session. Please try again later.
					</p>
				) : customerOnly && auth.status === "authenticated" ? (
					<CustomerProfileForm initialName={auth.user.name ?? ""} />
				) : (
					<div>
						<p role="alert">
							This page is only available to customer accounts.
						</p>
						<Link to="/" className="text-sm underline">
							Return home
						</Link>
					</div>
				)}
			</AuthPageCard>
		</PublicLayout>
	);
}
