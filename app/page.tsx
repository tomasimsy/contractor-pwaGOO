"use client";

import { useEffect, useRef } from "react";
import NailSalonRenovationSection from "@/components/NailSalon/page";
import Hero from "@/components/LandingPage/hero";
import Services from "@/components/LandingPage/services";
import Testimonials from "@/components/LandingPage/testimonials";
import Footer from "@/components/LandingPage/footer";
import BehindTheScene from "@/components/LandingPage/behindTheScene";

import {
Phone,
ArrowRight,
Hammer,
Home,
Building2,
PaintRoller,
Trees,
Ruler,
MessageCircle,
} from "lucide-react";

const NAVY = "#0b1630";
const GOLD = "#d4a048";

const services = [
{
icon: Home,
title: "Home Renovations",
desc: "Whole home remodels, layout changes, and updates that modernize how you live.",
},
{
icon: Hammer,
title: "Kitchen & Bath Remodeling",
desc: "High-end kitchens and spa-like bathrooms designed for everyday use and long-term value.",
},
{
icon: Building2,
title: "Commercial Remodeling",
desc: "Existing business spaces remodeled to feel modern, functional, and on brand.",
},
{
icon: PaintRoller,
title: "Flooring & Painting",
desc: "New flooring and fresh paint that transform the feel of your interiors.",
},
{
icon: Trees,
title: "Outdoor & Landscape",
desc: "Decks, fences, and outdoor spaces remodeled to extend your living area.",
},
{
icon: Ruler,
title: "General Remodeling",
desc: "From single rooms to full properties, if it can be remodeled, we can handle it.",
},
];

const projects = [
{
label: "Residential",
title: "Whole-Home Remodel & Outdoor Living",
desc: "Full interior refresh, new flooring, modern kitchen, and a reimagined outdoor space.",
},
{
label: "Commercial",
title: "Salon Remodel",
desc: "Existing space remodeled with new layout, finishes, lighting, and customer ready details.",
},
{
label: "Mixed Use",
title: "Kitchen, Bath & Exterior Refresh",
desc: "Updated kitchen, remodeled bathrooms, and refreshed exterior for a cohesive new look.",
},
];

const testimonials = [
{
name: "Sarah M.",
role: "Homeowner",
quote:
"They handled our entire remodel from design to final walkthrough. Clear communication, clean work, and on schedule.",
},
{
name: "David K.",
role: "Business Owner",
quote:
"They transformed our existing space into something that finally matches our brand. Professional from start to finish.",
},
{
name: "Lena & Mark",
role: "Homeowners",
quote:
"Our new kitchen and living area completely changed how we use our home. The quality and finish are outstanding.",
},
];

const SMS_LINK =
"sms:+17043034112?&body=Hi%2C%20I%E2%80%99d%20like%20to%20talk%20about%20a%20remodeling%20project%20for%20my%20home%20or%20business.";

export default function LandingPage() {
const heroBgRef = useRef<HTMLDivElement | null>(null);
  const heroCardRef = useRef<HTMLDivElement | null>(null);
    const servicesBgRef = useRef<HTMLDivElement | null>(null);

      useEffect(() => {
      const handleScroll = () => {
      const y = window.scrollY;

      if (heroBgRef.current) {
      heroBgRef.current.style.transform = `translateY(${y * 0.06}px)`; // slow parallax
      }
      if (heroCardRef.current) {
      heroCardRef.current.style.transform = `translateY(${y * 0.03}px) scale(${
      1 + y * 0.0001
      })`;
      heroCardRef.current.style.opacity = `${Math.max(0.85, 1 - y * 0.0004)}`;
      }
      if (servicesBgRef.current) {
      servicesBgRef.current.style.transform = `translateY(${y * 0.04}px)`;
      }
      };

      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
      }, []);

      const scrollToContact = () => {
      const el = document.getElementById("contact");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      return (
      <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "#f9fafb" }}>
        <Hero />
        <Services />
        <Testimonials />
        <BehindTheScene />

        <Footer />

      </main>
      );
      }