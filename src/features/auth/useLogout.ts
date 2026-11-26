import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { logoutCurrentUser } from "#/server/features/admin/auth";

export function useLogout() {
	const logout = useServerFn(logoutCurrentUser);
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	async function run() {
		setBusy(true);
		setError("");
		try {
			await logout();
			await router.navigate({ to: "/" });
			await router.invalidate();
		} catch {
			setError("Unable to log out. Please try again.");
		} finally {
			setBusy(false);
		}
	}
	return { run, busy, error };
}
