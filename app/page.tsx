"use client";

import { useEffect, useRef } from "react";
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
    desc: "Whole-home remodels, layout changes, and structural updates that modernize how you live.",
  },
  {
    icon: Hammer,
    title: "Kitchen & Bath Remodeling",
    desc: "High-end kitchens and spa-like bathrooms designed for everyday use and long-term value.",
  },
  {
    icon: Building2,
    title: "Commercial Remodeling",
    desc: "Existing business spaces remodeled to feel modern, functional, and on-brand.",
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
    desc: "From single rooms to full properties—if it can be remodeled, we can handle it.",
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
    desc: "Existing space remodeled with new layout, finishes, lighting, and customer-ready details.",
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
<div className="flex items-center gap-2 select-none" style={{ backgroundColor: "#080e1f"  }}>
  <div className="font-extrabold text-lg flex items-center justify-center h-9 w-12 rounded-md"
       style={{ backgroundColor: "#d4a048", color: "#0b1630", fontFamily: "Montserrat, sans-serif" }}>
    OSR
  </div>
  <span className="font-semibold text-sm tracking-wide" style={{ color: "#f9fafb" }}>
    Pros
  </span>
</div>


      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Parallax gradient background */}
        <div
          ref={heroBgRef}
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at top, rgba(212,160,72,0.22), transparent 55%), radial-gradient(circle at bottom, rgba(5,10,25,0.95), rgba(5,10,25,1))",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-20 pt-24 md:flex-row md:items-center md:pb-28 md:pt-28">
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-100 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GOLD }} />
              Full-Service Residential & Commercial Remodeling
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl md:text-5xl">
              From concept to completion—remodeling spaces that are built to last.
            </h1>
            <p className="max-w-xl text-sm text-slate-200/90 sm:text-base">
              We specialize in remodeling homes and business spaces—kitchens, bathrooms, interiors, exteriors, and
              full-property renovations. One team, start to finish, with craftsmanship you can see and reliability
              you can feel.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={scrollToContact}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:-translate-y-0.5"
                style={{
                  backgroundColor: GOLD,
                  boxShadow: "0 18px 40px rgba(212,160,72,0.35)",
                }}
              >
                Request a Remodel Consult
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="tel:+17043034112"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-50 transition hover:bg-white/10"
              >
                <Phone className="h-4 w-4" />
                Call (704) 303-4112
              </a>
              <a
                href={SMS_LINK}
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(212,160,72,0.6)] bg-[rgba(212,160,72,0.08)] px-4 py-2 text-sm font-medium text-[rgba(249,250,251,0.95)] transition hover:bg-[rgba(212,160,72,0.16)]"
              >
                <MessageCircle className="h-4 w-4" />
                Text About Your Project
              </a>
              <p className="text-xs text-slate-300">
                Licensed • Insured • Residential & Commercial Remodeling
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-1 justify-center md:mt-0">
            <div
              ref={heroCardRef}
              className="relative w-full max-w-md transition-transform duration-300"
            >
              <div
                className="absolute -inset-1 rounded-3xl blur-xl"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, rgba(212,160,72,0.35), rgba(15,23,42,0.1), transparent)",
                }}
              />
              <div className="relative rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl backdrop-blur">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Featured Remodel
                    </p>
                    <p className="text-sm font-semibold text-slate-50">
                      Kitchen & Living Space Transformation
                    </p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-[11px] font-medium text-slate-900"
                    style={{ backgroundColor: GOLD }}
                  >
                    Full Remodel
                  </span>
                </div>
                <p className="text-xs text-slate-200/90">
                  Dated kitchen and closed-off living area remodeled into an open, bright space with new
                  cabinetry, flooring, lighting, and finishes—designed for everyday life and entertaining.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-[11px] text-slate-200/90">
                  <div className="rounded-xl border border-white/5 bg-slate-900/70 p-3">
                    <p className="text-[10px] text-slate-400">Timeline</p>
                    <p className="font-semibold text-slate-50">8 weeks</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-900/70 p-3">
                    <p className="text-[10px] text-slate-400">Scope</p>
                    <p className="font-semibold text-slate-50">Kitchen + Living</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-slate-900/70 p-3">
                    <p className="text-[10px] text-slate-400">Type</p>
                    <p className="font-semibold text-slate-50">Residential</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                  <p className="text-[11px] text-slate-300">
                    “They turned our old layout into a space we actually love being in every day.”
                  </p>
                  <span className="text-[11px] font-medium text-slate-100">– Homeowner</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="relative border-t border-white/5 py-14">
        <div
          ref={servicesBgRef}
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
          style={{
            backgroundImage:
              "radial-gradient(circle at top, rgba(212,160,72,0.22), transparent 60%)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-900/70 to-transparent" />
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: GOLD }}
              >
                Services
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50 sm:text-2xl">
                Everything you need—from first walkthrough to final reveal.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-200/90">
                One partner for residential and commercial remodeling. We coordinate trades, manage
                timelines, and keep you informed at every step so your remodel feels controlled, not chaotic.
              </p>
            </div>
            <p className="text-xs text-slate-300">
              Homeowners • Business Owners • Property Managers
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <div
                  key={service.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/80 p-4 shadow-sm transition hover:-translate-y-1 hover:border-[rgba(212,160,72,0.7)] hover:shadow-xl"
                >
                  <div
                    className="absolute inset-0 -z-10 opacity-0 transition group-hover:opacity-100"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, rgba(212,160,72,0.18), transparent, rgba(15,23,42,0.9))",
                    }}
                  />
                  <div
                    className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl"
                    style={{ backgroundColor: "rgba(212,160,72,0.12)", color: GOLD }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-50">{service.title}</h3>
                  <p className="mt-2 text-xs text-slate-200/90">{service.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PROJECT SHOWCASE */}
      <section className="relative border-t border-white/5 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: GOLD }}
              >
                Projects
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50 sm:text-2xl">
                Recent remodels and transformations.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-200/90">
                Every remodel is planned with clear communication, detailed scheduling, and a focus on
                long-term durability—so your space looks great and works even better.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.title}
                className="relative overflow-hidden rounded-2xl border border-white/8 bg-slate-900/80 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="mb-2 inline-flex rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-100">
                  {project.label}
                </div>
                <h3 className="text-sm font-semibold text-slate-50">{project.title}</h3>
                <p className="mt-2 text-xs text-slate-200/90">{project.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="relative border-t border-white/5 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: GOLD }}
              >
                Process
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50 sm:text-2xl">
                A clear, structured remodeling process.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-200/90">
                We guide you through every phase—from ideas and budgets to finishes and final walkthrough—so
                you always know what’s happening and what comes next.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              {
                step: "01",
                title: "Consult & Walkthrough",
                desc: "We walk the space, understand how you use it today, and what you want it to become.",
              },
              {
                step: "02",
                title: "Scope, Design & Proposal",
                desc: "Clear scope, realistic budget, and timeline tailored to your remodel.",
              },
              {
                step: "03",
                title: "Remodel & Manage",
                desc: "We coordinate trades, protect your property, and keep the project moving.",
              },
              {
                step: "04",
                title: "Final Reveal & Support",
                desc: "Walkthrough, punch list, and ongoing support after the remodel is complete.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/8 bg-slate-900/80 p-4 text-xs text-slate-200/90 transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className="mb-2 text-[11px] font-semibold"
                  style={{ color: GOLD }}
                >
                  Step {item.step}
                </div>
                <h3 className="text-sm font-semibold text-slate-50">{item.title}</h3>
                <p className="mt-2">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="relative border-t border-white/5 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: GOLD }}
              >
                Testimonials
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-50 sm:text-2xl">
                Trusted for remodeling homes and business spaces.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-200/90">
                Clients choose us for reliable timelines, clean work, and remodels that feel as good as
                they look.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/8 bg-slate-900/80 p-4 text-xs text-slate-200/90 transition hover:-translate-y-1 hover:shadow-xl"
              >
                <p className="text-[11px] text-slate-100">“{t.quote}”</p>
                <div className="mt-3 text-[11px] font-semibold text-slate-50">
                  {t.name}
                </div>
                <div className="text-[10px] text-slate-400">{t.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT / CTA */}
      <section
        id="contact"
        className="relative border-t border-white/5 py-16"
      >
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: GOLD }}
          >
            Get Started
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-50 sm:text-3xl">
            Ready to talk about your remodel?
          </h2>
          <p className="mt-3 text-sm text-slate-200/90">
            Call or text now to discuss your remodeling plans. We’ll walk you through what’s possible,
            timelines, and next steps for your home or business.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="tel:+17043034112"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:-translate-y-0.5"
              style={{
                backgroundColor: GOLD,
                boxShadow: "0 18px 40px rgba(212,160,72,0.35)",
              }}
            >
              <Phone className="h-4 w-4" />
              Call (704) 303-4112
            </a>
            <a
              href={SMS_LINK}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-50 transition hover:bg-white/10"
            >
              <MessageCircle className="h-4 w-4" />
              Text About Your Project
            </a>
          </div>

          <p className="mt-6 text-[11px] text-slate-400">
            We typically respond within one business day. For urgent remodels, calling is best.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-[11px] text-slate-300 sm:flex-row">
          <div>
            © {new Date().getFullYear()} One Square Renovation — Licensed & Insured • Residential & Commercial
            Remodeling. We remodel anything.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>Serving homeowners & businesses with premium remodeling.</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-500 sm:inline-block" />
            <a href="tel:+17043034112" className="text-slate-100 hover:text-[rgba(212,160,72,0.9)]">
              (704) 303-4112
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
