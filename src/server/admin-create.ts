import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { roles, userRoles, users } from "../db/schema.ts";
import { hashPassword } from "./auth/password.ts";
import { getServerEnv } from "./env.ts";

const adminIdentitySchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(100),
	email: z
		.string()
		.trim()
		.max(255)
		.email("Enter a valid email address")
		.transform((email) => email.toLowerCase()),
});

const adminPasswordSchema = z
	.string()
	.min(6, "Password must be at least 6 characters")
	.max(128, "Password must be no more than 128 characters");

type KeypressKey = {
	ctrl?: boolean;
	meta?: boolean;
	name?: string;
};

function requireInteractiveTerminal(): void {
	if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
		throw new Error(
			"Run admin:create in an interactive terminal so the password can be entered without echo.",
		);
	}
}

function promptHidden(prompt: string): Promise<string> {
	const input = process.stdin;
	requireInteractiveTerminal();
	emitKeypressEvents(input);

	return new Promise((resolve, reject) => {
		const wasRaw = input.isRaw;
		const wasPaused = input.isPaused();
		let value = "";

		const cleanup = () => {
			input.off("keypress", onKeypress);
			input.setRawMode(wasRaw);
			if (wasPaused) input.pause();
			process.stdout.write("\n");
		};

		const onKeypress = (character: string, key: KeypressKey) => {
			if (key.ctrl && (key.name === "c" || key.name === "d")) {
				cleanup();
				reject(new Error("Administrator creation was cancelled."));
				return;
			}

			if (
				key.name === "return" ||
				key.name === "enter" ||
				character === "\r" ||
				character === "\n"
			) {
				cleanup();
				resolve(value);
				return;
			}

			if (key.name === "backspace") {
				value = value.slice(0, -1);
				return;
			}

			if (!key.ctrl && !key.meta && character) {
				value += character;
			}
		};

		// Raw mode prevents stdin from echoing password characters.
		input.setRawMode(true);
		input.on("keypress", onKeypress);
		input.resume();
		process.stdout.write(prompt);
	});
}

function getValidationMessage(error: z.ZodError): string {
	return error.issues
		.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
		.join("; ");
}

function getAdminEnvironment() {
	if (!process.env.NODE_ENV) {
		throw new Error(
			"Set NODE_ENV explicitly to development, test, or production before creating an administrator.",
		);
	}

	try {
		return getServerEnv();
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new Error(getValidationMessage(error));
		}
		throw error;
	}
}

function isUniqueConstraintError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "23505"
	);
}

async function collectAdminDetails(nodeEnv: string) {
	requireInteractiveTerminal();

	const prompts = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	let rawIdentity: { name: string; email: string };
	try {
		if (nodeEnv === "production") {
			const confirmation = await prompts.question(
				"Production database detected. Type CREATE ADMIN IN PRODUCTION to continue: ",
			);
			if (confirmation !== "CREATE ADMIN IN PRODUCTION") {
				throw new Error(
					"Production confirmation did not match; no administrator was created.",
				);
			}
		}

		rawIdentity = {
			name: await prompts.question("Administrator name: "),
			email: await prompts.question("Administrator email: "),
		};
	} finally {
		prompts.close();
	}

	const identity = adminIdentitySchema.safeParse(rawIdentity);
	if (!identity.success) {
		throw new Error(getValidationMessage(identity.error));
	}

	const password = await promptHidden("Password (input hidden): ");
	const passwordConfirmation = await promptHidden(
		"Confirm password (input hidden): ",
	);
	if (password !== passwordConfirmation) {
		throw new Error("Passwords do not match.");
	}

	const validatedPassword = adminPasswordSchema.safeParse(password);
	if (!validatedPassword.success) {
		throw new Error(getValidationMessage(validatedPassword.error));
	}

	return {
		...identity.data,
		password: validatedPassword.data,
	};
}

async function createAdministrator(
	name: string,
	email: string,
	passwordHash: string,
): Promise<void> {
	const { closeDb, db } = await import("../db/index.ts");

	try {
		await db.transaction(async (transaction) => {
			const [adminRole] = await transaction
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.name, "admin"))
				.limit(1);

			if (!adminRole) {
				throw new Error(
					'The "admin" role does not exist. Run "npm run db:seed" first.',
				);
			}

			const existingAccounts = await transaction
				.select({ roleName: roles.name })
				.from(users)
				.leftJoin(userRoles, eq(userRoles.userId, users.id))
				.leftJoin(roles, eq(roles.id, userRoles.roleId))
				.where(sql`lower(${users.email}) = ${email}`);

			if (existingAccounts.length > 0) {
				const alreadyAdmin = existingAccounts.some(
					(account) => account.roleName === "admin",
				);
				throw new Error(
					alreadyAdmin
						? "An administrator with this email already exists."
						: "An account with this email already exists. Existing accounts are never promoted by this command.",
				);
			}

			const [user] = await transaction
				.insert(users)
				.values({ name, email, passwordHash })
				.returning({ id: users.id });

			await transaction.insert(userRoles).values({
				userId: user.id,
				roleId: adminRole.id,
			});
		});
	} catch (error) {
		if (isUniqueConstraintError(error)) {
			throw new Error(
				"An account with this email already exists. Existing accounts are never promoted by this command.",
			);
		}
		throw error;
	} finally {
		await closeDb();
	}
}

async function main(): Promise<void> {
	try {
		const { NODE_ENV } = getAdminEnvironment();
		const { email, name, password } = await collectAdminDetails(NODE_ENV);
		const passwordHash = await hashPassword(password);

		await createAdministrator(name, email, passwordHash);
		console.info("Administrator created successfully.");
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown administrator error";
		console.error(`Administrator creation failed: ${message}`);
		process.exitCode = 1;
	}
}

void main();
