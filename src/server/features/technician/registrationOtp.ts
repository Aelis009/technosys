import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

export const requestRegistrationOtp = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) =>
		z
			.object({
				mobile: z
					.string()
					.trim()
					.regex(/^(?:\+91)?[6-9]\d{9}$/)
					.transform((value) => value.replace(/^\+91/, "")),
			})
			.parse(raw),
	)
	.handler(async ({ data }) => {
		const { requireRegistrationCloudinary } = await import("./registration.ts");
		await requireRegistrationCloudinary();
		const { requestOtp } = await import("../../auth/otp.ts");
		return requestOtp({
			mobile: data.mobile,
			purpose: "technician_mobile_verify",
		});
	});

export const verifyRegistrationOtp = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) =>
		z
			.object({
				mobile: z
					.string()
					.trim()
					.regex(/^(?:\+91)?[6-9]\d{9}$/)
					.transform((value) => value.replace(/^\+91/, "")),
				otp: z.string().regex(/^\d{6}$/),
			})
			.parse(raw),
	)
	.handler(async ({ data }) => {
		const { OtpError, verifyOtp } = await import("../../auth/otp.ts");
		const { createMobileVerificationProof } = await import(
			"./mobileVerificationProof.ts"
		);
		try {
			const { otpRecordId } = await verifyOtp({
				...data,
				purpose: "technician_mobile_verify",
			});
			return {
				success: true as const,
				token: createMobileVerificationProof(data.mobile, otpRecordId),
			};
		} catch (error) {
			if (error instanceof OtpError)
				return { success: false as const, message: error.message };
			throw error;
		}
	});
