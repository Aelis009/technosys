export const verificationSidPattern = /^VE[0-9a-f]{32}$/i;
const serviceSidPattern = /^VA[0-9a-f]{32}$/i;

type VerifyEnv = {
	TWILIO_ACCOUNT_SID?: string;
	TWILIO_AUTH_TOKEN?: string;
	TWILIO_VERIFY_SERVICE_SID?: string;
};

export function usesTwilioVerify(env: {
	NODE_ENV: "development" | "test" | "production";
	TWILIO_VERIFY_IN_DEV: "0" | "1";
}) {
	return (
		env.NODE_ENV === "production" ||
		(env.NODE_ENV === "development" && env.TWILIO_VERIFY_IN_DEV === "1")
	);
}

export function twilioVerifyConfigIssue(env: VerifyEnv): string | undefined {
	if (!env.TWILIO_ACCOUNT_SID?.trim()) return "TWILIO_ACCOUNT_SID is missing.";
	if (!env.TWILIO_AUTH_TOKEN?.trim()) return "TWILIO_AUTH_TOKEN is missing.";
	const service = env.TWILIO_VERIFY_SERVICE_SID?.trim();
	if (!serviceSidPattern.test(service ?? "")) {
		return "TWILIO_VERIFY_SERVICE_SID must be the VA-prefixed Service SID from Identity → Verify → Services (not a VE-prefixed verification ID).";
	}
}

export function twilioVerifyConfig(env: VerifyEnv) {
	const account = env.TWILIO_ACCOUNT_SID?.trim();
	const token = env.TWILIO_AUTH_TOKEN?.trim();
	const service = env.TWILIO_VERIFY_SERVICE_SID?.trim();
	if (!account || !token || !service || !serviceSidPattern.test(service))
		return null;
	return { account, token, service };
}

type Config = NonNullable<ReturnType<typeof twilioVerifyConfig>>;
type Resource = "Verifications" | "VerificationCheck";

async function post(
	config: Config,
	resource: Resource,
	data: Record<string, string>,
) {
	const response = await fetch(
		`https://verify.twilio.com/v2/Services/${config.service}/${resource}`,
		{
			method: "POST",
			headers: {
				Authorization: `Basic ${Buffer.from(`${config.account}:${config.token}`).toString("base64")}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams(data),
			redirect: "error",
			signal: AbortSignal.timeout(5000),
		},
	).catch(() => {
		throw new Error("Twilio Verify request did not complete.");
	});
	const payload: unknown = await response.json().catch(() => null);
	const result =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: {};
	if (!response.ok) {
		if (
			resource === "VerificationCheck" &&
			response.status === 404 &&
			result.code === 20404
		)
			return null;
		// Do not log the response text, which can contain phone numbers.
		const code =
			typeof result.code === "number" && Number.isSafeInteger(result.code)
				? `, error code ${result.code}`
				: "";
		throw new Error(
			`Twilio Verify rejected ${resource} (HTTP ${response.status}${code}).`,
		);
	}
	return result;
}

export async function startTwilioVerification(config: Config, mobile: string) {
	const to = `+91${mobile}`;
	const result = await post(config, "Verifications", {
		To: to,
		Channel: "sms",
	});
	if (
		result?.status !== "pending" ||
		result.to !== to ||
		typeof result.sid !== "string" ||
		!verificationSidPattern.test(result.sid)
	) {
		throw new Error("Twilio Verify did not return a pending SMS verification.");
	}
	return result.sid;
}

export async function checkTwilioVerification(
	config: Config,
	sid: string,
	mobile: string,
	code: string,
): Promise<"approved" | "invalid" | "expired" | "max-attempts"> {
	const result = await post(config, "VerificationCheck", {
		VerificationSid: sid,
		Code: code,
	});
	if (!result) return "expired";
	if (result.sid !== sid || result.to !== `+91${mobile}`)
		throw new Error("Twilio Verify returned a mismatched verification.");
	switch (result.status) {
		case "approved":
			return "approved";
		case "pending":
			return "invalid";
		case "max_attempts_reached":
			return "max-attempts";
		case "expired":
		case "canceled":
		case "deleted":
		case "failed":
			return "expired";
		default:
			throw new Error("Twilio Verify returned an unexpected status.");
	}
}
