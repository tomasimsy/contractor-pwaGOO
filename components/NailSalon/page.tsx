export default function NailSalonRenovationSection() {
  return (
    <section className="relative overflow-hidden bg-[#0b1630] text-white py-24 px-6">
      {/* Ambient Background */}
      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_top_right,#d4a048,transparent_30%),radial-gradient(circle_at_bottom_left,#ffffff,transparent_25%)]" />

      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left Content */}
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#d4a048]/30 bg-white/5 backdrop-blur-sm text-[#d4a048] text-xs tracking-[0.2em] uppercase mb-6">
            Nail Salon Renovation
          </div>

          <h2 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight max-w-2xl">
            Modern salon spaces built to attract higher-end clients.
          </h2>

          <p className="mt-6 text-white/70 text-lg leading-relaxed max-w-xl">
            We renovate nail salons with a focus on clean layouts, luxury finishes,
            brighter interiors, better customer flow, and durable materials designed
            for high daily traffic.
          </p>

          {/* Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
            {[
              "Luxury modern finishes",
              "Custom pedicure layouts",
              "LED + ambient lighting",
              "Fast turnaround timelines",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur-sm"
              >
                <div className="h-2 w-2 rounded-full bg-[#d4a048]" />
                <span className="text-sm text-white/80">{item}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 mt-10">
            <a
              href="sms:17043034112?body=Hi%20OSR%20Pros,%20I%E2%80%99m%20ready%20to%20renovate%20my%20nail%20salon."
              className="inline-flex items-center justify-center rounded-2xl bg-[#d4a048] px-7 py-4 text-sm font-medium text-[#0b1630] transition hover:scale-[1.02] hover:shadow-2xl hover:shadow-[#d4a048]/20"
            >
              Request Renovation Quote
            </a>

            <a
              href="#projects"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-7 py-4 text-sm text-white/80 transition hover:bg-white/10"
            >
              View Recent Projects
            </a>
          </div>
        </div>

        {/* Right Visual Layout */}
        <div className="relative">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-5">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-sm">
                <img
                  src="https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop"
                  alt="Luxury nail salon renovation"
                  className="h-[320px] w-full object-cover"
                />
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm">
                <div className="text-[#d4a048] text-sm uppercase tracking-[0.2em] mb-3">
                  Designed For Growth
                </div>
                <p className="text-white/70 leading-relaxed text-sm">
                  Better lighting, upgraded finishes, and modern customer flow can
                  dramatically improve first impressions and repeat visits.
                </p>
              </div>
            </div>

            <div className="space-y-5 pt-10">
              <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#d4a048]/20 to-transparent p-8 backdrop-blur-sm">
                <div className="text-5xl font-semibold text-white">10+</div>
                <div className="mt-2 text-sm text-white/60 leading-relaxed">
                  Years building and remodeling customer-facing commercial spaces.
                </div>
              </div>

              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 backdrop-blur-sm">
                <img
                  src="https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop"
                  alt="Modern salon interior"
                  className="h-[380px] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
