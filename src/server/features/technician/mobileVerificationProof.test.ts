import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createMobileVerificationProof,
	verifyMobileVerificationProof,
} from "./mobileVerificationProof.ts";

test("registration verification proof is signed, expires, and is bound to the mobile", () => {
	const mobile = "9000000000";
	const id = "11111111-1111-4111-8111-111111111111";
	const now = 1_800_000_000_000;
	const secret = "fixture-secret";
	const token = createMobileVerificationProof(mobile, id, now, secret);
	assert.deepEqual(
		verifyMobileVerificationProof({ mobile, token }, now, secret),
		{
			otpRecordId: id,
		},
	);
	assert.throws(
		() =>
			verifyMobileVerificationProof(
				{ mobile: "9000000001", token },
				now,
				secret,
			),
		{ code: "EXPIRED" },
	);
	assert.throws(
		() =>
			verifyMobileVerificationProof(
				{ mobile, token },
				now + 30 * 60_000,
				secret,
			),
		{ code: "EXPIRED" },
	);
	assert.throws(
		() =>
			verifyMobileVerificationProof(
				{ mobile, token: token.replace(/^1/, "2") },
				now,
				secret,
			),
		{ code: "EXPIRED" },
	);
});
