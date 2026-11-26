import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";
import { Button, FormField, TextInput } from "#/components/ui";
import { saveCustomerName } from "#/server/features/customer/profile";

export function CustomerProfileForm({ initialName }: { initialName: string }) {
	const [name, setName] = useState(initialName);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const save = useServerFn(saveCustomerName);
	const router = useRouter();
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!name.trim()) {
			setError("Enter your name.");
			return;
		}
		setError("");
		setBusy(true);
		try {
			await save({ data: { name } });
			await router.invalidate();
			await router.navigate({ to: "/" });
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Unable to save your name. Please try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<form onSubmit={submit} className="space-y-5">
			<FormField id="name" label="Name" required>
				<TextInput
					id="name"
					autoComplete="name"
					maxLength={100}
					required
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
			</FormField>
			{error ? (
				<p role="alert" className="text-sm text-rose-600">
					{error}
				</p>
			) : null}
			<Button type="submit" fullWidth isLoading={busy}>
				Save name
			</Button>
		</form>
	);
}
