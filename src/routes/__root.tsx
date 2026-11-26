import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactNode } from "react";

import { type AuthState, getAuthState } from "#/server/auth/state";
import { getTechnicianRegistrationAvailability } from "#/server/features/technician/availability";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	beforeLoad: async () => ({
		auth: await getAuthState().catch(
			(): AuthState => ({ status: "unavailable" }),
		),
		registrationReady: (
			await getTechnicianRegistrationAvailability().catch(() => ({
				available: false,
			}))
		).available,
	}),
	headers: () => ({ "Cache-Control": "private, no-store" }),
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Technosys – Service Management System",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body className="min-h-dvh bg-slate-50 text-slate-900">
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
