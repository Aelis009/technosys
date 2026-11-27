import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ComponentProps, type FormEvent, useState } from "react";
import { Button, FormField, TextInput } from "#/components/ui";
import type {
	AddressFields,
	AddressLookup,
} from "#/server/features/technician/addressLookup";
import {
	requestRegistrationOtp,
	verifyRegistrationOtp,
} from "#/server/features/technician/registrationOtp";
import { AddressMapPicker, type AddressPin } from "./AddressMapPicker";
import { MobileVerificationDialog } from "./MobileVerificationDialog";

const acceptedImages = ".jpg,.jpeg,.png,image/jpeg,image/png";
const selectStyle =
	"w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900";
const addressInputs = [
	{
		name: "addressLine",
		label: "Address line",
		maxLength: 550,
		autoComplete: "street-address",
		placeholder: "e.g. Flat 12, Green Society",
	},
	{
		name: "area",
		label: "Area",
		maxLength: 150,
		placeholder: "e.g. Hirabag",
	},
	{
		name: "city",
		label: "City",
		maxLength: 100,
		autoComplete: "address-level2",
		placeholder: "Surat",
	},
	{
		name: "state",
		label: "State",
		maxLength: 100,
		autoComplete: "address-level1",
		placeholder: "Gujarat",
	},
	{
		name: "pincode",
		label: "PIN code",
		maxLength: 6,
		autoComplete: "postal-code",
		inputMode: "numeric",
		pattern: "[1-9][0-9]{5}",
		placeholder: "e.g. 395009",
	},
] as const;

type RegistrationAddress = Pick<
	AddressFields,
	"area" | "city" | "state" | "pincode"
> & {
	addressLine: string;
};

function Field({
	name,
	label,
	...props
}: { name: string; label: string } & Omit<
	ComponentProps<typeof TextInput>,
	"id" | "name"
>) {
	return (
		<FormField id={name} label={label} required={props.required}>
			<TextInput id={name} name={name} {...props} />
		</FormField>
	);
}

function ImageUpload({
	name,
	label,
	required = false,
}: {
	name: "document" | "profilePhoto";
	label: string;
	required?: boolean;
}) {
	const [filename, setFilename] = useState("");
	return (
		<FormField id={name} label={label} required={required}>
			<label className="relative flex min-h-29 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-3 text-center hover:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500">
				<input
					id={name}
					name={name}
					type="file"
					accept={acceptedImages}
					required={required}
					aria-label={label}
					aria-describedby={`${name}-formats`}
					onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")}
					className="absolute inset-0 size-full cursor-pointer opacity-0"
				/>
				<svg
					aria-hidden="true"
					className="size-8 rounded-lg bg-indigo-100 p-1.5 text-indigo-700"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
				>
					<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" />
				</svg>
				<span className="max-w-full truncate text-sm font-semibold text-indigo-700">
					{filename || `Upload ${required ? "ID proof" : "photo"}`}
				</span>
				<span id={`${name}-formats`} className="text-xs text-slate-600">
					JPG, JPEG or PNG · Max 5 MB
				</span>
			</label>
		</FormField>
	);
}

export function TechnicianRegistrationForm({
	categories,
}: {
	categories: { id: string; name: string }[];
}) {
	const requestOtp = useServerFn(requestRegistrationOtp);
	const verifyOtp = useServerFn(verifyRegistrationOtp);
	const [feedback, setFeedback] = useState("");
	const [otpFeedback, setOtpFeedback] = useState("");
	const [dialogFeedback, setDialogFeedback] = useState("");
	const [otpMobile, setOtpMobile] = useState("");
	const [showOtp, setShowOtp] = useState(false);
	const [resendAt, setResendAt] = useState(0);
	const [verificationToken, setVerificationToken] = useState("");
	const [busy, setBusy] = useState<"otp" | "verify" | "submit" | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const [pin, setPin] = useState<AddressPin | null>(null);
	const [address, setAddress] = useState<
		Partial<
			Record<keyof RegistrationAddress, { value: string; suggested?: boolean }>
		>
	>({});
	const [addressFeedback, setAddressFeedback] = useState("");
	function selectPin(next: AddressPin | null, result?: AddressLookup) {
		setPin(next);
		const suggestions: RegistrationAddress | undefined =
			result?.status === "found"
				? {
						...result.address,
						addressLine: "",
					}
				: undefined;
		setAddress((current) => {
			const updated = { ...current };
			for (const { name } of addressInputs) {
				if (updated[name]?.suggested) delete updated[name];
				const suggestion = suggestions?.[name];
				if (!updated[name]?.value.trim() && suggestion)
					updated[name] = { value: suggestion, suggested: true };
			}
			return updated;
		});
		setAddressFeedback(
			!next
				? ""
				: suggestions
					? "Check the suggested address and fill in any missing details."
					: "No address suggestions were available. Enter the address manually.",
		);
	}

	async function sendOtp(mobile: string) {
		if (busy) return;
		setBusy("otp");
		setOtpFeedback("");
		setDialogFeedback("");
		try {
			const { devOtp } = await requestOtp({ data: { mobile } });
			setOtpMobile(mobile);
			setResendAt(Date.now() + 60_000);
			setOtpFeedback(
				devOtp ? `Development OTP: ${devOtp}` : "OTP sent to your mobile.",
			);
			if (devOtp) setDialogFeedback(`Development OTP: ${devOtp}`);
		} catch {
			const message = "Could not send OTP. Please wait a moment and try again.";
			setOtpFeedback(message);
			setDialogFeedback(message);
		} finally {
			setBusy(null);
		}
	}

	async function checkOtp(otp: string) {
		if (busy) return;
		setBusy("verify");
		setDialogFeedback("");
		try {
			const result = await verifyOtp({ data: { mobile: otpMobile, otp } });
			if (!result.success) {
				setDialogFeedback(result.message);
				return;
			}
			setVerificationToken(result.token);
			setOtpFeedback("Mobile number verified.");
			setShowOtp(false);
		} catch {
			setDialogFeedback("Could not verify the code. Please try again.");
		} finally {
			setBusy(null);
		}
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (busy) return;
		if (!verificationToken) {
			setFeedback("Verify your mobile number before submitting.");
			return;
		}
		const data = new FormData(event.currentTarget);
		const photo = data.get("profilePhoto");
		if (photo instanceof File && !photo.name) data.delete("profilePhoto");
		if (data.get("password") !== data.get("confirmPassword")) {
			setFeedback("Passwords do not match.");
			return;
		}
		setFeedback("");
		setBusy("submit");
		try {
			const response = await fetch("/api/technician/register", {
				method: "POST",
				body: data,
			});
			const result = await response.json();
			if (response.ok) setSubmitted(true);
			else {
				setFeedback(result.error?.message ?? "Registration unavailable.");
				if (
					["OTP_EXPIRED", "MOBILE_VERIFICATION_USED"].includes(
						result.error?.code,
					)
				) {
					setVerificationToken("");
					setOtpMobile("");
					setOtpFeedback("Verify your mobile number again.");
				}
			}
		} catch {
			setFeedback("Could not submit registration. Please try again.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
			<div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg md:grid-cols-[2fr_3fr]">
				<aside className="flex flex-col items-center justify-center gap-5 bg-linear-to-br from-indigo-600 to-fuchsia-700 px-6 py-8 text-center text-white md:px-8">
					<div
						aria-hidden="true"
						className="grid size-12 place-items-center rounded-xl bg-white/20 text-2xl"
					>
						⚙
					</div>
					<h2 className="text-2xl font-bold">Join Our Technician Network</h2>
					<p className="max-w-xs text-sm text-indigo-50">
						Connect with customers seeking your expertise.
					</p>
					<Link
						to="/technician/login"
						className="rounded-lg border border-white/60 px-4 py-2 text-sm font-semibold hover:bg-white/15"
					>
						Already registered? Sign in
					</Link>
				</aside>
				<div className="min-w-0 p-5 sm:p-8">
					<header className="mb-6 text-center">
						<div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								width="22"
								height="22"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.7"
							>
								<circle cx="12" cy="8" r="3" />
								<path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2z" />
							</svg>
						</div>
						<h1 className="text-2xl font-bold tracking-tight">
							Create Technician Account
						</h1>
						<p className="mt-2 text-sm text-slate-600">
							Fill in your details to join our network.
						</p>
					</header>
					{submitted ? (
						<div className="space-y-4">
							<output className="block">
								Application submitted. Sign in to follow its review status.
							</output>
							<Link
								to="/technician/login"
								className="font-semibold text-brand-700 underline"
							>
								Sign in as technician
							</Link>
						</div>
					) : (
						<form onSubmit={submit} className="space-y-5">
							<div className="grid gap-3 sm:grid-cols-2">
								<Field
									name="name"
									label="Full name"
									autoComplete="name"
									minLength={2}
									maxLength={100}
									required
								/>
								<FormField
									id="serviceCategoryId"
									label="Service category"
									required
								>
									<select
										id="serviceCategoryId"
										name="serviceCategoryId"
										className={selectStyle}
										defaultValue=""
										required
									>
										<option value="" disabled>
											Select specialty
										</option>
										{categories.map(({ id, name }) => (
											<option key={id} value={id}>
												{name}
											</option>
										))}
									</select>
								</FormField>
								<div className="flex min-w-0 items-end gap-2 sm:col-span-2 [&>div]:min-w-0 [&>div]:flex-1">
									<Field
										name="mobile"
										label="Mobile number"
										type="tel"
										autoComplete="tel"
										pattern="(?:\+91)?[6-9][0-9]{9}"
										required
										readOnly={busy !== null}
										onChange={() => {
											setOtpMobile("");
											setOtpFeedback("");
											setDialogFeedback("");
											setVerificationToken("");
										}}
									/>
									<Button
										variant="outline"
										isLoading={busy === "otp"}
										disabled={busy !== null || !!verificationToken}
										onClick={(event) => {
											if (otpMobile) {
												setShowOtp(true);
												return;
											}
											const mobile =
												event.currentTarget.form?.elements.namedItem("mobile");
											if (
												mobile instanceof HTMLInputElement &&
												mobile.reportValidity()
											)
												void sendOtp(mobile.value.trim());
										}}
									>
										{verificationToken
											? "Verified"
											: otpMobile
												? "Verify"
												: "Send OTP"}
									</Button>
								</div>
								<input
									type="hidden"
									name="mobileVerificationToken"
									value={verificationToken}
								/>
								{otpFeedback && (
									<output
										className={`text-sm sm:col-span-2 ${verificationToken ? "font-semibold text-emerald-700" : "text-slate-600"}`}
									>
										{otpFeedback}
									</output>
								)}
							</div>
							<fieldset className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
								<legend className="pr-2 text-sm font-semibold">Address</legend>
								<input type="hidden" name="latitude" value={pin?.lat ?? ""} />
								<input type="hidden" name="longitude" value={pin?.lon ?? ""} />
								{addressInputs.map((field) => (
									<div
										key={field.name}
										className={
											field.name === "addressLine"
												? "flex items-end gap-2 sm:col-span-2 [&>div]:min-w-0 [&>div]:flex-1"
												: undefined
										}
									>
										<Field
											{...field}
											value={address[field.name]?.value ?? ""}
											onChange={(event) => {
												const value = event.target.value;
												setAddress((current) => ({
													...current,
													[field.name]: { value },
												}));
											}}
											required
										/>
										{field.name === "addressLine" && (
											<AddressMapPicker value={pin} onChange={selectPin} />
										)}
									</div>
								))}
								<output className="block text-sm text-slate-600 sm:col-span-2">
									{pin
										? `Map pin selected. ${addressFeedback}`
										: "Map pin optional."}
								</output>
							</fieldset>
							<fieldset className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
								<legend className="pr-2 text-sm font-semibold">
									Bank details
								</legend>
								<Field
									name="accountNumber"
									label="Account number"
									placeholder="Enter account number"
									inputMode="numeric"
									pattern="[0-9]{8,20}"
									maxLength={20}
									required
								/>
								<Field
									name="ifscCode"
									label="IFSC code"
									placeholder="e.g. SBIN0001234"
									maxLength={11}
									required
								/>
								<Field
									name="accountHolderName"
									label="Account holder name"
									maxLength={150}
									required
								/>
							</fieldset>
							<fieldset className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
								<legend className="pr-2 text-sm font-semibold">
									Account details
								</legend>
								<div className="sm:col-span-2">
									<Field
										name="email"
										label="Email address"
										type="email"
										autoComplete="email"
										maxLength={255}
										required
									/>
								</div>
								<Field
									name="password"
									label="Password"
									type="password"
									autoComplete="new-password"
									minLength={8}
									maxLength={128}
									required
								/>
								<Field
									name="confirmPassword"
									label="Confirm password"
									type="password"
									autoComplete="new-password"
									minLength={8}
									maxLength={128}
									required
								/>
								<FormField id="gender" label="Gender (optional)">
									<select
										id="gender"
										name="gender"
										className={selectStyle}
										defaultValue=""
									>
										<option value="">Prefer not to say</option>
										<option value="male">Male</option>
										<option value="female">Female</option>
										<option value="other">Other</option>
									</select>
								</FormField>
								<Field
									name="dateOfBirth"
									label="Date of birth (optional)"
									type="date"
									autoComplete="bday"
								/>
							</fieldset>
							<fieldset className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
								<legend className="pr-2 text-sm font-semibold">
									Identity and photo
								</legend>
								<p
									id="upload-note"
									className="text-xs text-slate-600 sm:col-span-2"
								>
									An administrator will review your ID proof.
								</p>
								<ImageUpload name="document" label="ID proof" required />
								<ImageUpload
									name="profilePhoto"
									label="Profile photo (optional)"
								/>
							</fieldset>
							{feedback && (
								<p role="alert" className="text-sm text-rose-700">
									{feedback}
								</p>
							)}
							<Button
								type="submit"
								fullWidth
								isLoading={busy === "submit"}
								disabled={busy !== null}
								className="bg-linear-to-r from-indigo-600 to-fuchsia-700 text-white"
							>
								Submit application
							</Button>
						</form>
					)}
				</div>
			</div>
			{showOtp && (
				<MobileVerificationDialog
					mobile={otpMobile}
					busy={busy !== null}
					message={dialogFeedback}
					resendAt={resendAt}
					onClose={() => setShowOtp(false)}
					onVerify={(code) => void checkOtp(code)}
					onResend={() => void sendOtp(otpMobile)}
				/>
			)}
		</div>
	);
}
