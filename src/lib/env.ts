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
	// Required for session encryption and bank-account AES key derivation
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters."),
	// Required for HMAC-SHA256 OTP hashing
	OTP_SECRET: z.string().min(32, "OTP_SECRET must be at least 32 characters."),
	// Twilio – required in production, optional in development (OTP returned in response)
	TWILIO_ACCOUNT_SID: z.string().optional(),
	TWILIO_AUTH_TOKEN: z.string().optional(),
	TWILIO_PHONE_NUMBER: z.string().optional(),
	CLOUDINARY_CLOUD_NAME: z.string().optional(),
	CLOUDINARY_API_KEY: z.string().optional(),
	CLOUDINARY_API_SECRET: z.string().optional(),
});
