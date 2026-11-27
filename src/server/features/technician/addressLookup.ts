import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { csrfMiddleware } from "../../auth/csrfMiddleware.ts";

export const addressFields = {
	houseNumber: 100,
	street: 255,
	area: 150,
	city: 100,
	state: 100,
	pincode: 6,
} as const;

export type AddressFields = Record<keyof typeof addressFields, string>;
export type AddressLookup =
	| { status: "not-configured" | "unavailable" }
	| { status: "found"; address: AddressFields; displayName: string };

const pinSchema = z
	.object({
		lat: z.number().min(-90).max(90),
		lon: z.number().min(-180).max(180),
	})
	.strict();

export function mapAddress(value: unknown): AddressFields {
	const address = z.record(z.string(), z.unknown()).safeParse(value).data;
	function first(maxLength: number, ...keys: string[]) {
		for (const key of keys) {
			const value = address?.[key];
			if (typeof value === "string" && value.trim())
				return value.trim().slice(0, maxLength);
		}
		return "";
	}
	const postcode = address?.postcode;
	const city = first(addressFields.city, "city", "town", "municipality");
	const locality = first(addressFields.area, "village", "hamlet");
	const district = first(addressFields.city, "state_district", "district");
	const isSuratDistrict = /^surat(?: district)?$/i.test(district);
	const area = first(
		addressFields.area,
		"suburb",
		"neighbourhood",
		"city_block",
		"hamlet",
		"quarter",
		"city_district",
	);
	// Some provider records label a Surat locality as the city. Keep these
	// in Area, and use Surat as the city suggestion when there is no city.
	const localityAsCity =
		isSuratDistrict && /^(laskana|kamrej)$/i.test(city) ? city : "";
	const citySuggestion =
		(city && !localityAsCity ? city : "") ||
		(isSuratDistrict ? "Surat" : locality);
	const areaSuggestion = [area, localityAsCity, locality].find(
		(value) => value && value.toLowerCase() !== citySuggestion.toLowerCase(),
	);
	return {
		houseNumber: first(addressFields.houseNumber, "house_number"),
		street: first(addressFields.street, "road", "pedestrian", "residential"),
		area: areaSuggestion ?? "",
		city: citySuggestion,
		state: first(addressFields.state, "state"),
		pincode:
			typeof postcode === "string" && /^[1-9]\d{5}$/.test(postcode.trim())
				? postcode.trim()
				: "",
	};
}

export async function lookupAddress(
	endpoint: string | undefined,
	pin: z.infer<typeof pinSchema>,
	request = fetch,
): Promise<AddressLookup> {
	if (!endpoint?.trim()) return { status: "not-configured" as const };
	try {
		const url = new URL(endpoint);
		const localHttp =
			url.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		if (
			(!localHttp && url.protocol !== "https:") ||
			url.username ||
			url.password
		)
			return { status: "unavailable" as const };
		url.searchParams.set("format", "jsonv2");
		url.searchParams.set("addressdetails", "1");
		url.searchParams.set("lat", pin.lat.toFixed(7));
		url.searchParams.set("lon", pin.lon.toFixed(7));
		const response = await request(url, {
			cache: "no-store",
			redirect: "error",
			signal: AbortSignal.timeout(3_500),
			headers: {
				Accept: "application/json",
				"User-Agent": "Technosys address picker",
			},
		});
		if (!response.ok) return { status: "unavailable" as const };
		const result = z
			.object({ address: z.unknown(), display_name: z.string().optional() })
			.safeParse(await response.json());
		if (!result.success) return { status: "unavailable" as const };
		const address = mapAddress(result.data.address);
		const displayName = result.data.display_name?.trim().slice(0, 600) ?? "";
		return displayName || Object.values(address).some(Boolean)
			? { status: "found" as const, address, displayName }
			: { status: "unavailable" as const };
	} catch {
		return { status: "unavailable" as const };
	}
}

export const reverseGeocodeTechnicianPin = createServerFn({ method: "POST" })
	.middleware([csrfMiddleware])
	.validator((raw: unknown) => pinSchema.parse(raw))
	.handler(async ({ data }) => {
		const { setResponseHeader } = await import("@tanstack/react-start/server");
		const { getServerEnv } = await import("../../env.ts");
		setResponseHeader("Cache-Control", "private, no-store");
		return lookupAddress(getServerEnv().REVERSE_GEOCODER_URL, data);
	});
