import { useEffect } from "react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import LogoMarquee from "@/components/landing/LogoMarquee";
import FeaturesSection from "@/components/landing/FeaturesSection";
import ScreenshotSection from "@/components/landing/ScreenshotSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import MetricsSection from "@/components/landing/MetricsSection";
import TechStackSection from "@/components/landing/TechStackSection";
import CTASection from "@/components/landing/CTASection";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <HeroSection />
      <LogoMarquee />
      <FeaturesSection />
      <ScreenshotSection />
      <HowItWorksSection />
      <IntegrationsSection />
      <MetricsSection />
      <TechStackSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
