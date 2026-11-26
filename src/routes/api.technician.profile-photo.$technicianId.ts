import { createFileRoute } from "@tanstack/react-router";
import { deliverTechnicianProfilePhoto } from "#/server/features/technician/documentDelivery";

export const Route = createFileRoute(
	"/api/technician/profile-photo/$technicianId",
)({
	server: {
		handlers: {
			GET: ({ params }) => deliverTechnicianProfilePhoto(params.technicianId),
		},
	},
});
