import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { PhilosophySection } from "@/components/landing/philosophy-section";
import { CapabilitiesSection } from "@/components/landing/capabilities-section";
import { AthleteModelSection } from "@/components/landing/athlete-model-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";

export default function PublicLandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main>
        <HeroSection />
        <PhilosophySection />
        <CapabilitiesSection />
        <AthleteModelSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
      </main>
      <FooterSection />
    </div>
  );
}
