import { createFileRoute } from "@tanstack/react-router";
import { handleTechnicianRegistrationRequest } from "#/server/features/technician/registrationRequest";

export const Route = createFileRoute("/api/technician/register")({
	server: {
		handlers: {
			POST: ({ request }) => handleTechnicianRegistrationRequest(request),
		},
	},
});
