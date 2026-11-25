import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export class CsrfError extends Error {
	readonly status = 403;

	constructor() {
		super("Request origin is not allowed.");
		this.name = "CsrfError";
	}
}

export function assertSameOrigin(request: Request = getRequest()): void {
	const origin = request.headers.get("origin");
	if (!origin) throw new CsrfError();

	let requestOrigin: string;
	let suppliedOrigin: string;
	try {
		requestOrigin = new URL(request.url).origin;
		suppliedOrigin = new URL(origin).origin;
	} catch {
		throw new CsrfError();
	}

	if (
		suppliedOrigin !== requestOrigin ||
		request.headers.get("sec-fetch-site") === "cross-site"
	) {
		throw new CsrfError();
	}
}

export const csrfMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		assertSameOrigin();
		return next();
	},
);
