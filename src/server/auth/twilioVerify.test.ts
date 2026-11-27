import assert from "node:assert/strict";
import { test } from "node:test";
import {
	checkTwilioVerification,
	startTwilioVerification,
	twilioVerifyConfig,
	twilioVerifyConfigIssue,
	usesTwilioVerify,
} from "./twilioVerify.ts";

const service = `VA${"a".repeat(32)}`;
const sid = `VE${"b".repeat(32)}`;
const mobile = "9000000000";
const to = `+91${mobile}`;
const config = { service, account: "fixture-account", token: "fixture-token" };

test("real SMS requires an explicit development opt-in and is disabled in test", () => {
	assert.equal(
		usesTwilioVerify({ NODE_ENV: "development", TWILIO_VERIFY_IN_DEV: "0" }),
		false,
	);
	assert.equal(
		usesTwilioVerify({ NODE_ENV: "development", TWILIO_VERIFY_IN_DEV: "1" }),
		true,
	);
	assert.equal(
		usesTwilioVerify({ NODE_ENV: "production", TWILIO_VERIFY_IN_DEV: "0" }),
		true,
	);
	assert.equal(
		usesTwilioVerify({ NODE_ENV: "test", TWILIO_VERIFY_IN_DEV: "1" }),
		false,
	);
	assert.match(
		twilioVerifyConfigIssue({
			TWILIO_ACCOUNT_SID: config.account,
			TWILIO_AUTH_TOKEN: config.token,
			TWILIO_VERIFY_SERVICE_SID: sid,
		}) ?? "",
		/VA-prefixed Service SID/,
	);
});

test("Verify requires a service SID and credentials", () => {
	assert.equal(
		twilioVerifyConfig({ TWILIO_VERIFY_SERVICE_SID: service }),
		null,
	);
	assert.deepEqual(
		twilioVerifyConfig({
			TWILIO_VERIFY_SERVICE_SID: service,
			TWILIO_ACCOUNT_SID: config.account,
			TWILIO_AUTH_TOKEN: config.token,
		}),
		config,
	);
});

test("Verify sends and checks the provider-issued challenge, without a custom SMS", async (t) => {
	const mock = t.mock.method(globalThis, "fetch", async () =>
		Response.json({ sid, to, status: "pending" }, { status: 201 }),
	);
	assert.equal(await startTwilioVerification(config, mobile), sid);
	const [url, init] = mock.mock.calls[0].arguments;
	assert.equal(
		url,
		`https://verify.twilio.com/v2/Services/${service}/Verifications`,
	);
	assert.ok(init?.body instanceof URLSearchParams);
	assert.deepEqual(Object.fromEntries(init.body), { To: to, Channel: "sms" });

	for (const [status, expected] of [
		["pending", "invalid"],
		["approved", "approved"],
		["max_attempts_reached", "max-attempts"],
	]) {
		mock.mock.mockImplementationOnce(async () =>
			Response.json({ sid, to, status }),
		);
		assert.equal(
			await checkTwilioVerification(config, sid, mobile, "123456"),
			expected,
		);
	}
	const [checkUrl, checkInit] = mock.mock.calls[1].arguments;
	assert.equal(
		checkUrl,
		`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`,
	);
	assert.ok(checkInit?.body instanceof URLSearchParams);
	assert.deepEqual(Object.fromEntries(checkInit.body), {
		Code: "123456",
		VerificationSid: sid,
	});

	mock.mock.mockImplementationOnce(async () =>
		Response.json({ sid, to: "+919000000001", status: "approved" }),
	);
	await assert.rejects(
		checkTwilioVerification(config, sid, mobile, "123456"),
		/mismatched verification/,
	);
	mock.mock.mockImplementationOnce(async () =>
		Response.json({ code: 20404 }, { status: 404 }),
	);
	assert.equal(
		await checkTwilioVerification(config, sid, mobile, "123456"),
		"expired",
	);
	mock.mock.mockImplementationOnce(async () =>
		Response.json({ code: 60203, message: `Private: ${to}` }, { status: 429 }),
	);
	await assert.rejects(checkTwilioVerification(config, sid, mobile, "123456"), {
		message:
			"Twilio Verify rejected VerificationCheck (HTTP 429, error code 60203).",
	});
});
