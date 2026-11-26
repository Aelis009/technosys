import { createServerFn } from "@tanstack/react-start";

// This is deliberately not environment-controlled. A successful credentials
// ping does not establish authenticated-asset privacy or delivery safety.
// Enable only after a separate live private-delivery security closeout.
export const getTechnicianRegistrationAvailability = createServerFn({
	method: "GET",
}).handler(async () => {
	try {
		const { requireRegistrationCloudinary } = await import("./registration.ts");
		await requireRegistrationCloudinary();
		return { available: true };
	} catch {
		return { available: false };
	}
});
