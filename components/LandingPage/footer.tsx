"use client";

export default function Footer() {
  return (
    <footer className="w-full bg-[#0b0b0b] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        
        {/* TOP GRID */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">

          {/* BRAND */}
          <div>
            <h2 className="text-2xl font-semibold tracking-[0.2em]">
              OSR Pros
            </h2>

            <p className="mt-4 text-white/70 leading-relaxed">
              Full-service remodeling contractor specializing in residential and commercial renovations.
              From kitchens, bathrooms, and flooring to salons, offices, decks, roofing, and full rebuilds.
            </p>

            <p className="mt-4 text-white/60 text-sm">
              Licensed remodeling & construction services focused on quality, durability, and modern design.
            </p>
          </div>

          {/* SERVICES */}
          <div>
            <h3 className="text-sm uppercase tracking-widest text-white/80">
              Services
            </h3>

            <ul className="mt-4 space-y-3 text-white/70">
              <li>Home Renovation</li>
              <li>Business / Salon Remodeling</li>
              <li>Kitchen & Bathroom Remodeling</li>
              <li>Flooring Installation</li>
              <li>Decks & Outdoor Construction</li>
              <li>Roofing & Repairs</li>
              <li>Full Interior Buildouts</li>
            </ul>
          </div>

          {/* CONTACT / SEO CTA */}
          <div>
            <h3 className="text-sm uppercase tracking-widest text-white/80">
              Get a Free Estimate
            </h3>

            <p className="mt-4 text-white/70">
              Text us anytime for a fast quote or project consultation.
              We respond quickly for residential and business remodeling jobs.
            </p>

            <a
              href="sms:7043034112?&body=Hi%20OSR%20Pros,%20I%20am%20ready%20to%20start%20a%20project%20and%20would%20like%20a%20quote."
              className="mt-6 inline-block rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Text for Estimate
            </a>

            <p className="mt-4 text-xs text-white/50">
              Fast response for Charlotte & surrounding areas
            </p>
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="mt-14 border-t border-white/10 pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} OSR Pros. All rights reserved.
          </p>

          <p className="text-xs text-white/50">
            Home Remodeling • Business Renovation • Construction Services
          </p>
        </div>
      </div>
    </footer>
  );
}