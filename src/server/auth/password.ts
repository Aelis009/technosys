import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const scryptParameters = {
	N: 2 ** 15,
	r: 8,
	p: 1,
	maxmem: 64 * 1024 * 1024,
};
const keyLength = 64;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, keyLength, scryptParameters, (error, key) => {
			if (error) {
				reject(error);
				return;
			}

			resolve(key);
		});
	});
}

export async function hashPassword(password: string): Promise<string> {
	if (password.length > 128) {
		throw new RangeError("Password must be no more than 128 characters.");
	}

	const salt = randomBytes(16);
	const key = await deriveKey(password, salt);

	return [
		"scrypt",
		scryptParameters.N,
		scryptParameters.r,
		scryptParameters.p,
		salt.toString("base64url"),
		key.toString("base64url"),
	].join("$");
}

export async function verifyPassword(
	password: string,
	passwordHash: string,
): Promise<boolean> {
	if (password.length > 128) return false;

	const parts = passwordHash.split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return false;

	const [algorithm, n, r, p, saltValue, keyValue] = parts;
	if (
		algorithm !== "scrypt" ||
		Number(n) !== scryptParameters.N ||
		Number(r) !== scryptParameters.r ||
		Number(p) !== scryptParameters.p ||
		!saltValue ||
		!keyValue
	) {
		return false;
	}

	const salt = Buffer.from(saltValue, "base64url");
	const expectedKey = Buffer.from(keyValue, "base64url");
	if (
		salt.length !== 16 ||
		expectedKey.length !== keyLength ||
		salt.toString("base64url") !== saltValue ||
		expectedKey.toString("base64url") !== keyValue
	) {
		return false;
	}

	const actualKey = await deriveKey(password, salt);
	return timingSafeEqual(actualKey, expectedKey);
}
