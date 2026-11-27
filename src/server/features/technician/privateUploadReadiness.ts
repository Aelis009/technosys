import {
	type CloudinaryConfig,
	deleteIdentityDocument,
	uploadIdentityDocument,
} from "../../cloudinary.ts";
import { fetchPrivateCloudinaryDocument } from "./documentDelivery.ts";

// A one-pixel PNG; no identity, customer or account data.
const probeImage = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
	"base64",
);

export async function verifyPrivateUploads(
	config: CloudinaryConfig,
	{
		upload = uploadIdentityDocument,
		remove = deleteIdentityDocument,
		deliver = fetchPrivateCloudinaryDocument,
		request = fetch,
	} = {},
): Promise<boolean> {
	let publicId: string | undefined;
	let verified = false;
	try {
		const asset = await upload({
			config,
			bytes: probeImage,
			mimeType: "image/png",
			format: "png",
		});
		publicId = asset.publicId;
		const unsignedUrl = `https://res.cloudinary.com/${config.cloudName}/image/authenticated/${publicId}.png`;
		const unsigned = await request(unsignedUrl, {
			redirect: "error",
			cache: "no-store",
			signal: AbortSignal.timeout(5_000),
		});
		await unsigned.body?.cancel();
		if ([401, 403, 404].includes(unsigned.status)) {
			const image = await deliver(
				{ publicId, url: asset.secureUrl },
				"technician-documents",
				config,
			);
			verified =
				image.mime === "image/png" &&
				Buffer.from(image.bytes).equals(probeImage);
		}
	} catch {
		return false;
	} finally {
		if (publicId) {
			try {
				await remove(config, publicId);
			} catch {
				verified = false;
				console.error(
					"[Technician registration] storage probe cleanup failed.",
				);
			}
		}
	}
	return verified;
}

let readiness:
	| { cloudName: string; expiresAt: number; result: Promise<boolean> }
	| undefined;

export function hasVerifiedPrivateUploads(config: CloudinaryConfig) {
	if (
		readiness?.cloudName === config.cloudName &&
		readiness.expiresAt > Date.now()
	)
		return readiness.result;

	const entry = {
		cloudName: config.cloudName,
		expiresAt: Number.POSITIVE_INFINITY,
		result: verifyPrivateUploads(config).then((ready) => {
			entry.expiresAt = Date.now() + (ready ? 3_600_000 : 60_000);
			return ready;
		}),
	};
	readiness = entry;
	return entry.result;
}
