import { createFileRoute } from "@tanstack/react-router";
import { deliverTechnicianDocument } from "#/server/features/technician/documentDelivery";

export const Route = createFileRoute(
	"/api/admin/technician-documents/$documentId",
)({
	server: {
		handlers: {
			GET: ({ params }) => deliverTechnicianDocument(params.documentId),
		},
	},
});
