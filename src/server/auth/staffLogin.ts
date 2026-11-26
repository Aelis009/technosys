import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { csrfMiddleware } from "./csrfMiddleware.ts";

const loginSchema = z.object({
	email: z.string().trim().email("Enter a valid email address.").toLowerCase(),
	password: z.string().min(1, "Password is required."),
});

export const loginStaff = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => loginSchema.parse(raw))
	.handler(async ({ data }) => {
		const { loginWithPassword } = await import("./passwordLogin.ts");
		return loginWithPassword(data, "either");
	});
