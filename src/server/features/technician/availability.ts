import { createServerFn } from "@tanstack/react-start";

// A credentials ping alone is not enough: the registration server verifies
// authenticated delivery and denial of unsigned access before opening the form.
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
