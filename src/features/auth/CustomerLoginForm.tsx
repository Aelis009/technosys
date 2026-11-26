import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";
import { Button, FormField, TextInput } from "#/components/ui";
import { getAuthState } from "#/server/auth/state";
import {
	requestCustomerLoginOtp,
	verifyCustomerLoginOtp,
} from "#/server/features/customer/auth";

export function CustomerLoginForm() {
	const request = useServerFn(requestCustomerLoginOtp);
	const verify = useServerFn(verifyCustomerLoginOtp);
	const router = useRouter();
	const [mobile, setMobile] = useState("");
	const [otp, setOtp] = useState("");
	const [sent, setSent] = useState(false);
	const [devOtp, setDevOtp] = useState<string>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function sendOtp() {
		setError("");
		setBusy(true);
		try {
			const result = await request({ data: { mobile } });
			setDevOtp(result.devOtp);
			setSent(true);
			setOtp("");
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Unable to request an OTP. Please try again.",
			);
		} finally {
			setBusy(false);
		}
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!sent) {
			await sendOtp();
			return;
		}
		setError("");
		setBusy(true);
		try {
			await verify({ data: { mobile, otp } });
			setDevOtp(undefined);
			await router.invalidate();
			const auth = await getAuthState();
			if (auth.status !== "authenticated") {
				setError("Your session could not be loaded. Please try again.");
				return;
			}
			await router.navigate({
				to: auth.needsCustomerProfile ? "/customer/profile" : "/",
			});
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Unable to verify the OTP. Please try again.",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={submit} className="space-y-5">
			<FormField
				id="mobile"
				label="Mobile number"
				required
				hint="Enter a valid Indian mobile number."
			>
				<TextInput
					id="mobile"
					type="tel"
					autoComplete="tel"
					value={mobile}
					onChange={(event) => setMobile(event.target.value)}
					disabled={sent || busy}
					required
					pattern="(\+91)?[6-9][0-9]{9}"
					aria-describedby="mobile-hint"
				/>
			</FormField>
			{sent ? (
				<>
					<FormField id="otp" label="One-time password" required>
						<TextInput
							id="otp"
							inputMode="numeric"
							autoComplete="one-time-code"
							value={otp}
							onChange={(event) => setOtp(event.target.value)}
							required
							pattern="[0-9]{6}"
							maxLength={6}
						/>
					</FormField>
					{devOtp ? (
						<p className="text-sm text-slate-600">
							Development OTP: <strong>{devOtp}</strong>
						</p>
					) : (
						<p className="text-sm text-slate-600">
							Enter the code sent to your mobile.
						</p>
					)}
					<div className="flex gap-3">
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => {
								setSent(false);
								setOtp("");
								setDevOtp(undefined);
								setError("");
							}}
						>
							Change number
						</Button>
						<Button variant="outline" disabled={busy} onClick={sendOtp}>
							Resend OTP
						</Button>
					</div>
				</>
			) : null}
			{error ? (
				<p role="alert" className="text-sm text-rose-600">
					{error}
				</p>
			) : null}
			<Button type="submit" fullWidth isLoading={busy}>
				{sent ? "Verify and continue" : "Send OTP"}
			</Button>
			<Link
				to="/technician/login"
				className="block text-sm text-slate-600 hover:underline"
			>
				Technician login
			</Link>
		</form>
	);
}
