"use client";

import { useState, useRef } from "react";

export default function WorkProcessSection() {
  const [sliderPositions, setSliderPositions] = useState<{ [key: number]: number }>({});
  const [isDragging, setIsDragging] = useState<{ [key: number]: boolean }>({});

  const handleMouseMove = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging[index]) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(Math.max(0, (x / rect.width) * 100), 100);
    
    setSliderPositions(prev => ({ ...prev, [index]: percentage }));
  };

  const steps = [
    {
      title: "Surface Preparation",
      desc: "Wall repair, sanding, priming, and prep before transformation begins.",
      beforeImage: "/landingPageImages/drywall.jpg",
      afterImage: "/landingPageImages/drywall-after.png",
    },
    {
      title: "Floor Restoration",
      desc: "Hardwood sanding, polishing, tile replacement, and leveling.",
      beforeImage: "/landingPageImages/floor.png",
      afterImage: "/landingPageImages/floor-after.png",
    },
    {
      title: "Cabinet Construction",
      desc: "Custom cabinetry build out, framing, installation, and finishing paint.",
      beforeImage: "/landingPageImages/cabinet.png",
      afterImage: "/landingPageImages/cabinet-after.png",
    },
    {
      title: "Commercial / Salon Renovation",
      desc: "Nail salons, spa floors, tile rework, lighting, and interior layout rebuild.",
      beforeImage: "/landingPageImages/salon.png",
      afterImage: "/landingPageImages/salon-after.png",
    },
  ];

  return (
    <section className="w-full bg-white py-24">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-gray-900">
          From Skeleton to Masterpiece
        </h2>
        <p className="mt-5 text-gray-600 text-lg">
          Every project starts raw — exposed walls, unfinished floors, and open frames.
          We transform structure into precision-built spaces.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-10 px-6 md:grid-cols-2">
        {steps.map((step, i) => {
          const sliderPosition = sliderPositions[i] ?? 50;
          
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-2xl shadow-lg"
            >
              <div 
                className="relative h-[380px] w-full cursor-ew-resize select-none"
                onMouseMove={(e) => handleMouseMove(i, e)}
                onMouseDown={() => setIsDragging(prev => ({ ...prev, [i]: true }))}
                onMouseUp={() => setIsDragging(prev => ({ ...prev, [i]: false }))}
                onMouseLeave={() => setIsDragging(prev => ({ ...prev, [i]: false }))}
              >
                {/* Before Image (full image) */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${step.beforeImage}')` }}
                />
                
                {/* After Image (clipped) */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${step.afterImage}')`,
                    clipPath: `inset(0 0 0 ${sliderPosition}%)`,
                  }}
                />
                
                {/* Slider Handle */}
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/30 to-transparent">
                <div className="flex gap-2 mb-2">
                  <span className="text-xs font-semibold text-white/70 bg-black/50 px-2 py-0.5 rounded-full">
                    BEFORE
                  </span>
                  <span className="text-xs font-semibold text-white/70 bg-black/50 px-2 py-0.5 rounded-full">
                    AFTER
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-white/80 text-sm">
                  {step.desc}
                </p>
                <p className="mt-2 text-xs text-white/60">
                  💡 Drag the slider to see before/after
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}