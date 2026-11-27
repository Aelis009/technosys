import { useServerFn } from "@tanstack/react-start";
import type { Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Button, Modal } from "#/components/ui";
import {
	type AddressLookup,
	reverseGeocodeTechnicianPin,
} from "#/server/features/technician/addressLookup";

export type AddressPin = { lat: number; lon: number };
const surat: AddressPin = { lat: 21.1702, lon: 72.8311 };

export function AddressMapPicker({
	value,
	onChange,
}: {
	value: AddressPin | null;
	onChange: (pin: AddressPin | null, lookup?: AddressLookup) => void;
}) {
	const reverseGeocode = useServerFn(reverseGeocodeTechnicianPin);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<AddressPin | null>(null);
	const [error, setError] = useState("");
	const [ready, setReady] = useState(false);
	const [preview, setPreview] = useState<{
		pin: AddressPin;
		result: AddressLookup;
	} | null>(null);
	const lookup = preview && preview.pin === draft ? preview.result : undefined;
	const container = useRef<HTMLDivElement>(null);
	const map = useRef<LeafletMap | null>(null);
	const marker = useRef<Marker | null>(null);
	const leaflet = useRef<typeof import("leaflet") | null>(null);

	useEffect(() => {
		if (!open || !draft) return;
		let current = true;
		const timer = window.setTimeout(() => {
			void reverseGeocode({ data: draft })
				.catch((): AddressLookup => ({ status: "unavailable" }))
				.then((result) => {
					if (current) setPreview({ pin: draft, result });
				});
		}, 450);
		return () => {
			current = false;
			window.clearTimeout(timer);
		};
	}, [draft, open, reverseGeocode]);

	useEffect(() => {
		if (!open || !container.current) return;
		let cancelled = false;
		let instance: LeafletMap | undefined;
		void import("leaflet")
			.then((L) => {
				if (cancelled || !container.current) return;
				leaflet.current = L;
				const center = value ?? surat;
				instance = L.map(container.current).setView(
					[center.lat, center.lon],
					13,
				);
				map.current = instance;
				setReady(true);
				L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
					maxZoom: 19,
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				}).addTo(instance);
				instance.on("click", (event) => {
					const point = event.latlng.wrap();
					setDraft({
						lat: Math.max(-90, Math.min(90, point.lat)),
						lon: point.lng,
					});
				});
				requestAnimationFrame(() => instance?.invalidateSize());
			})
			.catch(() => {
				if (!cancelled)
					setError("Map unavailable. You can continue without a pin.");
			});
		return () => {
			cancelled = true;
			instance?.remove();
			map.current = null;
			marker.current = null;
			leaflet.current = null;
			setReady(false);
		};
	}, [open, value]);

	useEffect(() => {
		if (!ready) return;
		const L = leaflet.current;
		if (!L || !map.current) return;
		if (!draft) {
			marker.current?.remove();
			marker.current = null;
			return;
		}
		if (!marker.current) {
			marker.current = L.marker([draft.lat, draft.lon], {
				draggable: true,
				title: "Selected location; drag to move",
				icon: L.divIcon({
					className: "",
					html: '<div style="width:20px;height:20px;border:3px solid white;border-radius:50%;background:#1d4ed8;box-shadow:0 1px 5px #000"></div>',
					iconSize: [20, 20],
					iconAnchor: [10, 10],
				}),
			}).addTo(map.current);
			marker.current.on("dragend", () => {
				const point = marker.current?.getLatLng().wrap();
				if (point) setDraft({ lat: point.lat, lon: point.lng });
			});
		} else marker.current.setLatLng([draft.lat, draft.lon]);
	}, [draft, ready]);

	function locate() {
		setError("");
		if (!navigator.geolocation) {
			setError("Location is unavailable. You can select a point manually.");
			return;
		}
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				const pin = { lat: coords.latitude, lon: coords.longitude };
				setDraft(pin);
				map.current?.setView([pin.lat, pin.lon], 16);
			},
			() =>
				setError(
					"Could not access your location. You can select a point manually.",
				),
			{ timeout: 10000 },
		);
	}

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => {
					setDraft(value);
					setPreview(null);
					setError("");
					setOpen(true);
				}}
			>
				Pick on map
			</Button>
			<Modal
				open={open}
				onClose={() => setOpen(false)}
				title="Pick an optional location"
				description="Place a pin to preview nearby address details. You can edit any suggestions after confirming."
				size="xl"
			>
				{open && (
					<div className="grid gap-4 sm:grid-cols-[3fr_2fr]">
						<div
							ref={container}
							className="h-64 w-full rounded-lg bg-slate-100 sm:h-80"
							role="application"
							aria-label="Map for selecting a location"
						/>
						<section className="space-y-2 text-sm" aria-label="Address preview">
							<h3 className="font-semibold">Selected address</h3>
							<div aria-live="polite">
								{!draft ? (
									"Place a pin to preview the address."
								) : !lookup ? (
									"Looking up address…"
								) : lookup.status === "found" ? (
									<p className="break-words">
										{lookup.displayName ||
											[
												...new Set(
													Object.values(lookup.address).filter(Boolean),
												),
											].join(", ")}
									</p>
								) : lookup.status === "not-configured" ? (
									<p>
										Address lookup is not configured. You can still save the pin
										and enter the address manually.
									</p>
								) : (
									<p>
										Address unavailable for this pin. You can enter it manually.
									</p>
								)}
							</div>
						</section>
					</div>
				)}
				{error && (
					<output className="mt-2 block text-sm text-rose-700">{error}</output>
				)}
				<div className="mt-4 flex flex-wrap gap-2">
					<Button variant="outline" onClick={locate}>
						Use my location
					</Button>
					<Button
						variant="outline"
						disabled={!ready}
						onClick={() => {
							const point = map.current?.getCenter().wrap();
							if (point) setDraft({ lat: point.lat, lon: point.lng });
						}}
					>
						Place pin at map center
					</Button>
					<Button variant="outline" onClick={() => setDraft(null)}>
						Clear pin
					</Button>
					<Button variant="outline" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						disabled={draft !== null && !lookup}
						onClick={() => {
							onChange(draft, lookup);
							setOpen(false);
						}}
					>
						Confirm
					</Button>
				</div>
			</Modal>
		</>
	);
}
