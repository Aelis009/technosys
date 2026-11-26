import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { Button, FormField, TextInput } from "#/components/ui";
import { AuthPageCard } from "#/features/auth/AuthPageCard";
import { getTechnicianHome } from "#/features/auth/staffHome";
import { loginStaff } from "#/server/auth/staffLogin";

export const Route = createFileRoute("/technician/login")({ component: Login });

function Login() {
	const login = useServerFn(loginStaff);
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError("");
		try {
			const result = await login({ data: { email, password } });
			await router.invalidate();
			await router.navigate({
				to:
					result.role === "admin"
						? "/admin/dashboard"
						: getTechnicianHome(result.canAccessDashboard),
			});
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Unable to log in. Please try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<PublicLayout>
			<AuthPageCard
				title="Technician login"
				description="Sign in with your email and password."
			>
				<form onSubmit={submit} className="space-y-5">
					<FormField id="email" label="Email" required>
						<TextInput
							id="email"
							type="email"
							autoComplete="username"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</FormField>
					<FormField id="password" label="Password" required>
						<TextInput
							id="password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</FormField>
					{error ? <p role="alert">{error}</p> : null}
					<Button type="submit" fullWidth isLoading={busy}>
						Login
					</Button>
				</form>
			</AuthPageCard>
		</PublicLayout>
	);
}
