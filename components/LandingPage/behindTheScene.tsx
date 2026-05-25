"use client";

export default function WorkProcessSection() {
   
const steps = [
  {
  title: "Surface Preparation",
  desc: "Wall/floor repair, sanding, priming, and prep before transformation begins.",
  image:
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1600&auto=format&fit=crop",
},
  {
    title: "Floor Restoration",
    desc: "Hardwood sanding, polishing, tile replacement, and leveling.",
    image:
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=1600&auto=format&fit=crop",
  },
  {
    title: "Cabinet Construction",
    desc: "Custom cabinetry build out, framing, installation, and finishing paint.",
    image:
      "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?q=80&w=1600&auto=format&fit=crop",
  },
  {
    title: "Commercial / Salon Renovation",
    desc: "Nail salons, spa floors, tile rework, lighting, and interior layout rebuild.",
    image:
      "https://images.unsplash.com/photo-1615873968403-89e068629265?q=80&w=1600&auto=format&fit=crop",
  },
];
 

  return (
    <section className="w-full bg-white py-24">
      {/* HEADER */}
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-gray-900">
          From Skeleton to Masterpiece
        </h2>

        <p className="mt-5 text-gray-600 text-lg">
          Every project starts raw — exposed walls, unfinished floors, and open frames.
          We transform structure into precision-built spaces.
        </p>
      </div>

      {/* GRID */}
      <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-10 px-6 md:grid-cols-2">
        {steps.map((step, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-2xl shadow-lg"
          >
            {/* IMAGE */}
            <div
              className="h-[380px] w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{ backgroundImage: `url('${step.image}')` }}
            />

            {/* DARK OVERLAY */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

            {/* TEXT */}
            <div className="absolute bottom-0 p-6">
              <h3 className="text-2xl font-semibold text-white">
                {step.title}
              </h3>

              <p className="mt-2 text-white/80 text-sm">
                {step.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}