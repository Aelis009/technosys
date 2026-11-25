import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "#/features/landing/LandingPage";
import { getPublicServiceCategories } from "#/server/features/service-categories/public";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Technosys | Home Service Categories" },
			{
				name: "description",
				content:
					"Explore home service categories and learn how Technosys is preparing to connect customers with skilled technicians.",
			},
		],
	}),
	loader: () => ({
		categories: getPublicServiceCategories().catch(() => ({
			ok: false as const,
		})),
	}),
	component: Home,
});

function Home() {
	return <LandingPage categories={Route.useLoaderData().categories} />;
}
