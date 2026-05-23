"use client";

import Link from "next/link";
import Image from "next/image";
import InstallPWA from "@/components/InstallPWA";

export default function HomePage({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <div className="min-h-screen bg-[#f7f5f2] text-gray-900">

      {/* TOP BAR */}
      <div className="sticky top-0 z-50 border-b border-[#e8e1d8] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">

          <Link href="/" className="flex items-center">
            <Image
              src="/OSR_logo.png"
              alt="One Square Roof"
              width={150}
              height={42}
              className="h-10 w-auto object-contain"
            />
          </Link>

          <div>
            <Link
              href="/dashboard"
              className="rounded-xl bg-[#1f1b16] px-2 py-2 text-xs font-medium text-white hover:bg-black"
            >
              Dashboard
            </Link>
            {/* <Link
  href="sms:7043034112?body=Hi%20OSR,%20I%27m%20ready%20to%20start%20a%20project.%20Can%20I%20get%20a%20quote?"
  className="rounded-2xl bg-[#1f1b16] px-6 py-3 text-sm font-medium text-white shadow-md transition hover:bg-black"
>
  Text for Quote
</Link> */}
          </div>

        </div>
      </div>

      {/* HERO */}
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">

        <div className="mb-6 inline-flex rounded-full border border-[#e8e1d8] bg-white px-4 py-1 text-xs text-[#7a6f60]">
          Subcontracting Services
        </div>

        <h1 className="text-4xl font-bold md:text-6xl">
          We Renovate & Manage
          <span className="block text-[#a67c52]">
            Full Renovation Projects
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-[#6b6258] md:text-lg">
          From roofing and decks to flooring, concrete, tree removal, and full interior renovations, 
          we handle the entire job from start to finish with trusted subcontractors.
        </p>

        <div className="mt-8">
          
              <Link
    href="sms:7043034112?body=Hi%20OSR,%20I%27m%20ready%20to%20start%20a%20project.%20Can%20I%20get%20a%20quote?"
    className="rounded-2xl bg-[#1f1b16] px-6 py-3 text-sm font-medium text-white shadow-md hover:bg-black"
  > 
            Request a Free Estimate
          </Link>
        </div>

      </div>

      {/* SERVICE GROUPS */}
      <div className="mx-auto max-w-6xl px-4 py-16">

        <h2 className="mb-10 text-center text-2xl font-bold">
          What We Do
        </h2>

        <div className="grid gap-6 md:grid-cols-3">

          {/* Exterior */}
          <div className="rounded-2xl border border-[#e8e1d8] bg-white p-6">
            <h3 className="mb-3 text-lg font-semibold">Exterior Construction</h3>
            <p className="text-sm text-[#6b6258]">
              Roofing, decks, concrete work, structural repairs, and tree removal.
            </p>
          </div>

          {/* Interior */}
          <div className="rounded-2xl border border-[#e8e1d8] bg-white p-6">
            <h3 className="mb-3 text-lg font-semibold">Interior Renovation</h3>
            <p className="text-sm text-[#6b6258]">
              Flooring, remodeling, kitchen upgrades, and salon buildouts.
            </p>
          </div>

          {/* Management */}
          <div className="rounded-2xl border border-[#e8e1d8] bg-white p-6">
            <h3 className="mb-3 text-lg font-semibold">Full Project Management</h3>
            <p className="text-sm text-[#6b6258]">
              We coordinate subcontractors, timelines, materials, and execution.
            </p>
          </div>

        </div>
      </div>

      {/* WHY US */}
      <div className="border-t border-[#e8e1d8] bg-white py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">

          <h2 className="text-3xl font-bold">
            One Team. One Contract. Zero Stress.
          </h2>

          <p className="mt-4 text-[#6b6258]">
            You don’t need to hire multiple contractors — we manage everything for you from start to finish.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 text-left">

            <div className="rounded-xl border border-[#e8e1d8] p-4">
              ✔ Licensed subcontractor network
            </div>

            <div className="rounded-xl border border-[#e8e1d8] p-4">
              ✔ Residential & commercial projects
            </div>

            <div className="rounded-xl border border-[#e8e1d8] p-4">
              ✔ Fast estimates & scheduling
            </div>

            <div className="rounded-xl border border-[#e8e1d8] p-4">
              ✔ Transparent pricing & updates
            </div>

          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-[#f7f5f2] py-20 text-center">

        <h2 className="text-3xl font-bold">
          Ready to start your project?
        </h2>

        <p className="mt-3 text-[#6b6258]">
          Get a free estimate within 24–48 hours.
        </p>

              <Link
    href="sms:7043034112?body=Hi%20OSR,%20I%27m%20ready%20to%20start%20a%20project.%20Can%20I%20get%20a%20quote?"
    className="rounded-2xl bg-[#1f1b16] px-6 py-3 text-sm font-medium text-white shadow-md hover:bg-black"
  > 
            Contact Us
          </Link>

      </div>

      {/* FOOTER */}
      <div className="border-t border-[#e8e1d8] bg-white py-8 text-center text-sm text-[#8b8177]">
        © 2026 One Square Roof — Construction & Subcontracting Services
        <InstallPWA />
      </div>

    </div>
  );
}