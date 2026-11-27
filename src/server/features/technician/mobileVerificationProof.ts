import { createHmac, timingSafeEqual } from "node:crypto";
import { OtpError } from "../../auth/otp.ts";
import { getServerEnv } from "../../env.ts";

const lifetime = 30 * 60_000;
export const mobileVerificationTokenPattern =
	/^([0-9a-f-]{36})\.(\d{13})\.([0-9a-f]{64})$/;

function signature(mobile: string, id: string, expiry: string, secret: string) {
	return createHmac("sha256", secret)
		.update(`technician-registration-mobile:${mobile}:${id}:${expiry}`)
		.digest();
}

export function createMobileVerificationProof(
	mobile: string,
	id: string,
	now = Date.now(),
	secret = getServerEnv().OTP_SECRET,
) {
	const expiry = String(now + lifetime);
	return `${id}.${expiry}.${signature(mobile, id, expiry, secret).toString("hex")}`;
}

export function verifyMobileVerificationProof(
	input: { mobile: string; token: string },
	now = Date.now(),
	secret = getServerEnv().OTP_SECRET,
) {
	const match = mobileVerificationTokenPattern.exec(input.token);
	if (
		!match ||
		Number(match[2]) <= now ||
		!timingSafeEqual(
			Buffer.from(match[3], "hex"),
			signature(input.mobile, match[1], match[2], secret),
		)
	) {
		throw new OtpError("EXPIRED", "Please verify your mobile number again.");
	}
	return { otpRecordId: match[1] };
}
