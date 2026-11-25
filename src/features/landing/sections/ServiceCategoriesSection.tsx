import { Await, useRouter } from "@tanstack/react-router";
import { Suspense, useTransition } from "react";
import {
	Button,
	Card,
	CardDescription,
	CardTitle,
	EmptyState,
	LoadingSpinner,
	SectionHeading,
} from "#/components/ui";
import type { PublicServiceCategoriesResult } from "#/server/features/service-categories/public";

export function ServiceCategoriesSection({
	categories,
}: {
	categories: Promise<PublicServiceCategoriesResult>;
}) {
	const router = useRouter();
	const [retrying, startRetry] = useTransition();
	return (
		<section
			id="services"
			aria-label="Service categories"
			className="scroll-mt-20 bg-white"
		>
			<div className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Explore"
					title="Service categories"
					description="Browse the current Technosys service catalog."
				/>
				<Suspense
					fallback={
						<LoadingSpinner centered label="Loading service categories…" />
					}
				>
					<Await promise={categories}>
						{(result) => {
							if (!result.ok)
								return (
									<EmptyState
										tone="error"
										title="Couldn’t load service categories"
										description="The catalog is temporarily unavailable. Please try again."
										action={
											<Button
												variant="outline"
												isLoading={retrying}
												onClick={() => startRetry(() => router.invalidate())}
											>
												{retrying ? "Retrying…" : "Try again"}
											</Button>
										}
									/>
								);
							if (!result.categories.length)
								return (
									<EmptyState
										title="No service categories yet"
										description="There are no active categories to browse right now. Check back later."
									/>
								);
							return (
								<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
									{result.categories.map(
										({ id, name, description, imageUrl }) => (
											<li key={id} className="min-w-0">
												<Card className="h-full space-y-3 wrap-break-word">
													{imageUrl && /^https?:\/\//i.test(imageUrl) ? (
														<img
															src={imageUrl}
															alt=""
															loading="lazy"
															className="aspect-video w-full rounded-xl bg-brand-50 object-cover"
														/>
													) : (
														<span
															aria-hidden="true"
															className="grid size-10 place-items-center rounded-xl bg-brand-50 font-semibold text-brand-700"
														>
															{name.slice(0, 1).toUpperCase()}
														</span>
													)}
													<CardTitle>{name}</CardTitle>
													{description ? (
														<CardDescription>{description}</CardDescription>
													) : null}
												</Card>
											</li>
										),
									)}
								</ul>
							);
						}}
					</Await>
				</Suspense>
			</div>
		</section>
	);
}
