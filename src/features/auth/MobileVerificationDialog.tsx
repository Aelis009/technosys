import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "#/components/ui";

export function MobileVerificationDialog({
	mobile,
	busy,
	message,
	resendAt,
	onClose,
	onVerify,
	onResend,
}: {
	mobile: string;
	busy: boolean;
	message: string;
	resendAt: number;
	onClose: () => void;
	onVerify: (code: string) => void;
	onResend: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const title = useId();
	const description = useId();
	const [code, setCode] = useState("");
	const [now, setNow] = useState(Date.now);
	const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		input.current?.focus();
		const timer = window.setInterval(() => setNow(Date.now()), 250);
		return () => {
			window.clearInterval(timer);
			element?.close();
		};
	}, []);

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!busy && code.length === 6) onVerify(code);
	}

	return (
		<dialog
			ref={dialog}
			aria-labelledby={title}
			aria-describedby={description}
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) onClose();
			}}
			className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-slate-700 bg-linear-to-br from-slate-800 to-slate-900 p-5 text-center text-white shadow-2xl backdrop:bg-slate-950/70 backdrop:backdrop-blur-sm sm:p-8"
		>
			<div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-linear-to-br from-indigo-500 to-purple-600">
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					className="size-8"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
				>
					<rect x="4" y="10" width="16" height="11" rx="2" />
					<path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
				</svg>
			</div>
			<h2 id={title} className="text-xl font-bold sm:text-2xl">
				Enter Verification Code
			</h2>
			<p id={description} className="mt-2 text-sm text-slate-300">
				Enter the 6-digit code sent to{" "}
				<strong className="text-white">{mobile}</strong>.
			</p>
			<form onSubmit={submit} className="mt-6">
				<div className="relative grid grid-cols-6 gap-1.5 rounded-xl focus-within:ring-2 focus-within:ring-indigo-400 focus-within:ring-offset-2 focus-within:ring-offset-slate-900 sm:gap-2">
					<input
						ref={input}
						aria-label="Six-digit verification code"
						inputMode="numeric"
						autoComplete="one-time-code"
						value={code}
						readOnly={busy}
						onChange={(event) =>
							setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
						}
						className="absolute inset-0 size-full opacity-0"
					/>
					{Array.from({ length: 6 }, (_, index) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: Each box is a fixed digit position.
							key={index}
							aria-hidden="true"
							className="pointer-events-none grid h-12 place-items-center rounded-xl border border-slate-500 bg-slate-700/60 text-xl font-bold"
						>
							{code[index]}
						</span>
					))}
				</div>
				{message && (
					<output className="mt-3 block text-sm text-slate-200">
						{message}
					</output>
				)}
				<div className="mt-6 grid grid-cols-2 gap-3">
					<Button
						type="submit"
						isLoading={busy}
						disabled={busy || code.length !== 6}
						className="bg-linear-to-r from-indigo-500 to-indigo-700 text-white"
					>
						Verify Code
					</Button>
					<button
						type="button"
						disabled={busy}
						onClick={onClose}
						className="rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-400"
					>
						Cancel
					</button>
				</div>
				<div className="mt-5 text-sm text-slate-300">
					{remaining > 0 ? (
						<>
							Resend OTP in {Math.floor(remaining / 60)}:
							{String(remaining % 60).padStart(2, "0")}
						</>
					) : (
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								setCode("");
								onResend();
								input.current?.focus();
							}}
							className="font-semibold text-indigo-300 underline"
						>
							Resend OTP
						</button>
					)}
				</div>
			</form>
		</dialog>
	);
}
