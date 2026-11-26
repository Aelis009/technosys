import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PublicLayout } from "#/components/layout/PublicLayout";
import { AuthPageCard } from "#/features/auth/AuthPageCard";
import { getPublicServiceCategories } from "#/server/features/service-categories/public";
import { getTechnicianRegistrationAvailability } from "#/server/features/technician/availability";
import { requestRegistrationOtp } from "#/server/features/technician/registrationOtp";

export const Route = createFileRoute("/technician/register")({
	loader: async () => {
		const readiness = await getTechnicianRegistrationAvailability().catch(
			() => ({ available: false }),
		);
		return {
			readiness,
			categories: readiness.available
				? await getPublicServiceCategories()
				: { ok: false as const },
		};
	},
	component: RegistrationPage,
});

function RegistrationPage() {
	const { readiness, categories } = Route.useLoaderData();
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	async function sendOtp(form: HTMLFormElement) {
		setBusy(true);
		setMessage("");
		try {
			const mobile = String(new FormData(form).get("mobile") ?? "");
			const result = await requestRegistrationOtp({ data: { mobile } });
			setMessage(
				result.devOtp ? `Development OTP: ${result.devOtp}` : "OTP sent.",
			);
		} catch {
			setMessage("Could not send OTP. Check your mobile number and try again.");
		} finally {
			setBusy(false);
		}
	}
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		setBusy(true);
		setMessage("");
		try {
			const response = await fetch("/api/technician/register", {
				method: "POST",
				body: new FormData(form),
			});
			const result = await response.json();
			setMessage(
				response.ok
					? "Application submitted. Your account awaits review; please log in separately."
					: (result.error?.message ?? "Registration unavailable."),
			);
			if (response.ok) form.reset();
		} catch {
			setMessage("Could not submit registration. Please try again.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<PublicLayout>
			<AuthPageCard
				title="Technician registration"
				description="Apply to join the technician network."
			>
				{!readiness.available ? (
					<p>Technician registration · Coming soon</p>
				) : !categories.ok ? (
					<p>Service categories are unavailable. Please try again later.</p>
				) : (
					<form onSubmit={submit} className="grid gap-3">
						<label>
							Name
							<input
								name="name"
								required
								minLength={2}
								maxLength={100}
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Email
							<input
								name="email"
								type="email"
								required
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Password
							<input
								name="password"
								type="password"
								required
								minLength={8}
								maxLength={128}
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Confirm password
							<input
								name="confirmPassword"
								type="password"
								required
								minLength={8}
								maxLength={128}
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Mobile
							<input
								name="mobile"
								type="tel"
								required
								className="block w-full border rounded p-2"
							/>
						</label>
						<button
							type="button"
							disabled={busy}
							onClick={(event) => {
								if (event.currentTarget.form)
									void sendOtp(event.currentTarget.form);
							}}
							className="border rounded p-2"
						>
							Send OTP
						</button>
						<label>
							OTP
							<input
								name="otp"
								inputMode="numeric"
								required
								pattern="[0-9]{6}"
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Service category
							<select
								name="serviceCategoryId"
								required
								defaultValue=""
								className="block w-full border rounded p-2"
							>
								<option value="" disabled>
									Select a category
								</option>
								{categories.categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))}
							</select>
						</label>
						<label>
							Gender (optional)
							<select
								name="gender"
								defaultValue=""
								className="block w-full border rounded p-2"
							>
								<option value="">Prefer not to say</option>
								<option value="male">Male</option>
								<option value="female">Female</option>
								<option value="other">Other</option>
							</select>
						</label>
						<label>
							Date of birth (optional)
							<input
								name="dateOfBirth"
								type="date"
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Document type
							<input
								name="documentType"
								required
								maxLength={50}
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Identity document (JPG, JPEG or PNG, max 5 MB)
							<input
								name="document"
								type="file"
								accept=".jpg,.jpeg,.png,image/jpeg,image/png"
								required
								className="block w-full"
							/>
						</label>
						<label>
							Account holder name
							<input
								name="accountHolderName"
								required
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							Account number
							<input
								name="accountNumber"
								inputMode="numeric"
								required
								className="block w-full border rounded p-2"
							/>
						</label>
						<label>
							IFSC
							<input
								name="ifscCode"
								required
								className="block w-full border rounded p-2"
							/>
						</label>
						<button
							type="submit"
							disabled={busy}
							className="border rounded p-2"
						>
							Submit application
						</button>
					</form>
				)}
				{message ? <output className="mt-3">{message}</output> : null}
			</AuthPageCard>
		</PublicLayout>
	);
}
