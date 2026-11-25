import { z } from "zod";

export const serverEnvSchema = z.object({
	DATABASE_URL: z
		.string()
		.url()
		.refine(
			(value) => /^postgres(?:ql)?:\/\//i.test(value),
			"DATABASE_URL must be a PostgreSQL connection URL",
		),
	NODE_ENV: z
		.enum(["development", "test", "production"])
		.default("development"),
});
