import { PublicLayout } from "#/components/layout";
import type { PublicServiceCategoriesResult } from "#/server/features/service-categories/public";
import { AboutSection } from "./sections/AboutSection";
import { CallToActionSection } from "./sections/CallToActionSection";
import { CustomerBenefitsSection } from "./sections/CustomerBenefitsSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { ServiceCategoriesSection } from "./sections/ServiceCategoriesSection";
import { TechnicianBenefitsSection } from "./sections/TechnicianBenefitsSection";
import { TestimonialsSection } from "./sections/TestimonialsSection";
import { WhyChooseUsSection } from "./sections/WhyChooseUsSection";

export function LandingPage({
	categories,
}: {
	categories: Promise<PublicServiceCategoriesResult>;
}) {
	return (
		<PublicLayout>
			<HeroSection />
			<ServiceCategoriesSection categories={categories} />
			<HowItWorksSection />
			<AboutSection />
			<WhyChooseUsSection />
			<div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-2 lg:px-8">
				<CustomerBenefitsSection />
				<TechnicianBenefitsSection />
			</div>
			<TestimonialsSection />
			<CallToActionSection />
		</PublicLayout>
	);
}
