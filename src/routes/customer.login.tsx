import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { AuthPageCard } from "#/features/auth/AuthPageCard";
import { CustomerLoginForm } from "#/features/auth/CustomerLoginForm";

export const Route = createFileRoute("/customer/login")({
	component: CustomerLogin,
});

function CustomerLogin() {
	return (
		<PublicLayout>
			<AuthPageCard
				title="Customer login or signup"
				description="Use your mobile number to sign in or create an account."
			>
				<CustomerLoginForm />
			</AuthPageCard>
		</PublicLayout>
	);
}
