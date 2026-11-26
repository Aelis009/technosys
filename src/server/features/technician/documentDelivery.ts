import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { technicianDocuments, technicianProfiles } from "../../../db/schema.ts";
import {
	AuthenticationError,
	AuthorizationError,
	requireAuthenticatedUser,
	requireRole,
} from "../../auth/session.ts";
import { getCloudinaryConfig } from "../../cloudinary.ts";

type DocumentMetadata = { publicId: string | null; url: string };
type DeliveryDependencies = {
	authorize: () => Promise<unknown>;
	find: (id: string) => Promise<DocumentMetadata | undefined>;
	fetchDocument: (
		metadata: DocumentMetadata,
	) => Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }>;
};

const defaultDependencies: DeliveryDependencies = {
	authorize: () => requireRole("admin"),
	find: async (id) => {
		const [row] = await db
			.select({
				publicId: technicianDocuments.cloudinaryPublicId,
				url: technicianDocuments.documentUrl,
			})
			.from(technicianDocuments)
			.where(eq(technicianDocuments.id, id))
			.limit(1);
		return row;
	},
	fetchDocument: fetchPrivateCloudinaryDocument,
};

async function fetchPrivateCloudinaryDocument(
	metadata: DocumentMetadata,
	folder = "technician-documents",
) {
	const config = getCloudinaryConfig();
	const id = metadata.publicId;
	// Only assets created by this application are eligible; never fetch stored URLs.
	if (
		!config ||
		!id ||
		!id.startsWith(`technosys/${folder}/`) ||
		!/^[A-Za-z0-9_-]+$/.test(id.split("/").at(-1) ?? "") ||
		id.split("/").length !== 3
	)
		throw new Error("Unavailable");
	let stored: URL;
	try {
		stored = new URL(metadata.url);
	} catch {
		throw new Error("Unavailable");
	}
	if (
		stored.protocol !== "https:" ||
		stored.hostname !== "res.cloudinary.com" ||
		stored.search ||
		stored.hash
	)
		throw new Error("Unavailable");
	const format = /\.(png|jpg|jpeg)$/i.exec(stored.pathname)?.[1]?.toLowerCase();
	const expectedSuffix = `/${id}.${format}`;
	if (
		!format ||
		!stored.pathname.startsWith(`/${config.cloudName}/image/authenticated/`) ||
		!stored.pathname.endsWith(expectedSuffix)
	)
		throw new Error("Unavailable");
	const path = `${id}.${format}`;
	const signature = createHash("sha1")
		.update(`${path}${config.apiSecret}`)
		.digest("base64url")
		.slice(0, 8);
	const url = `https://res.cloudinary.com/${encodeURIComponent(config.cloudName)}/image/authenticated/s--${signature}--/${path}`;
	const response = await fetch(url, {
		redirect: "error",
		cache: "no-store",
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) throw new Error("Unavailable");
	const mime = format === "png" ? "image/png" : "image/jpeg";
	if (
		response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
		mime
	)
		throw new Error("Unavailable");
	const reader = response.body?.getReader();
	if (!reader) throw new Error("Unavailable");
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > 5 * 1024 * 1024) {
				await reader.cancel();
				throw new Error("Unavailable");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return { bytes, mime };
}

export async function deliverTechnicianProfilePhoto(
	id: string,
): Promise<Response> {
	let ownerId: string | undefined;
	return deliverTechnicianDocument(id, {
		authorize: async () => {
			const user = await requireAuthenticatedUser();
			if (user.roles.includes("admin")) return;
			if (!user.roles.includes("technician")) throw new AuthorizationError();
			ownerId = user.id;
		},
		find: async (id) => {
			const [row] = await db
				.select({
					publicId: technicianProfiles.profileImagePublicId,
					url: technicianProfiles.profileImageUrl,
				})
				.from(technicianProfiles)
				.where(
					and(
						eq(technicianProfiles.id, id),
						ownerId ? eq(technicianProfiles.userId, ownerId) : undefined,
					),
				)
				.limit(1);
			return row?.url ? { publicId: row.publicId, url: row.url } : undefined;
		},
		fetchDocument: (metadata) =>
			fetchPrivateCloudinaryDocument(metadata, "technician-photos"),
	});
}

export async function deliverTechnicianDocument(
	id: string,
	dependencies: DeliveryDependencies = defaultDependencies,
): Promise<Response> {
	const headers = {
		"Cache-Control": "private, no-store",
		"Cross-Origin-Resource-Policy": "same-origin",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox",
		"Content-Disposition": "inline",
	};
	try {
		await dependencies.authorize();
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				id,
			)
		)
			return new Response(null, { status: 404, headers });
		const metadata = await dependencies.find(id);
		if (!metadata) return new Response(null, { status: 404, headers });
		const document = await dependencies.fetchDocument(metadata);
		return new Response(document.bytes, {
			headers: { ...headers, "Content-Type": document.mime },
		});
	} catch (error) {
		const status =
			error instanceof AuthenticationError
				? 401
				: error instanceof AuthorizationError
					? 403
					: 503;
		return new Response(null, { status, headers });
	}
}
