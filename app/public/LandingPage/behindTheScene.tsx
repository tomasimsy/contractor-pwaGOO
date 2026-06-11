"use client";

import { useState, useRef, useEffect } from "react";

export default function WorkProcessSection() {
  const [sliderPositions, setSliderPositions] = useState<{ [key: number]: number }>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

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
      afterImage: "/landingPageImages/salon-after.jpg",
    },
  ];

  const updatePosition = (index: number, clientX: number) => {
    const container = containerRefs.current[index];
    if (!container) return;

    const rect = container.getBoundingClientRect();
    let x = clientX - rect.left;
    
    // Constrain to container bounds
    x = Math.min(Math.max(x, 0), rect.width);
    
    // Calculate percentage (0-100)
    const percentage = (x / rect.width) * 100;
    
    setSliderPositions(prev => ({ ...prev, [index]: percentage }));
  };

  // Mouse handlers for desktop
  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex(index);
    updatePosition(index, e.clientX);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (activeIndex !== null) {
      updatePosition(activeIndex, e.clientX);
    }
  };

  const handleMouseUp = () => {
    setActiveIndex(null);
  };

  // Touch handlers for mobile
  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    e.preventDefault();
    setActiveIndex(index);
    const touch = e.touches[0];
    if (touch) {
      updatePosition(index, touch.clientX);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (activeIndex !== null) {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) {
        updatePosition(activeIndex, touch.clientX);
      }
    }
  };

  const handleTouchEnd = () => {
    setActiveIndex(null);
  };

  // Global event listeners
  useEffect(() => {
    if (activeIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [activeIndex]);

  // Reset position to 50% when component mounts (optional)
  useEffect(() => {
    const initialPositions: { [key: number]: number } = {};
    steps.forEach((_, index) => {
      initialPositions[index] = 50;
    });
    setSliderPositions(initialPositions);
  }, []);

  return (
<section className="w-full bg-[#080808] py-24 md:py-32">
  {/* HEADER */}
  <div className="mx-auto max-w-5xl px-6 text-center md:px-10 lg:px-16">
    {/* Eyebrow */}
    <div className="mb-6 flex items-center justify-center gap-4">
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-500/50" />
      <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-amber-400/70">
        The Process
      </p>
      <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-500/50" />
    </div>

    <h2 className="font-light tracking-tight text-white">
      <span className="block text-3xl md:text-5xl lg:text-6xl">
        From Skeleton
      </span>
      <span className="mt-2 block text-3xl text-white/35 md:text-5xl lg:text-6xl">
        to Masterpiece
      </span>
    </h2>

    <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/45 md:text-lg">
      Every project starts raw — exposed walls, unfinished floors, and open frames.
      We transform structure into precision-built spaces.
    </p>
  </div>

  {/* GRID */}
  <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-8 px-6 md:mt-20 md:gap-10 lg:grid-cols-2 lg:px-16">
    {steps.map((step, i) => {
      const sliderPosition = sliderPositions[i] ?? 50;

      return (
        <div
          key={i}
          className="group relative overflow-hidden border border-white/5 bg-[#111111]"
        >
          <div
            ref={(el) => { containerRefs.current[i] = el; }}
            className="relative h-[280px] w-full touch-none select-none sm:h-[320px] md:h-[400px]"
            onMouseDown={(e) => handleMouseDown(i, e)}
            onTouchStart={(e) => handleTouchStart(i, e)}
          >
            {/* Before Image */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${step.beforeImage}')` }}
            />

            {/* After Image */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url('${step.afterImage}')`,
                clipPath: `inset(0 0 0 ${sliderPosition}%)`,
              }}
            />

            {/* Slider Handle */}
            <div
              className="absolute bottom-0 top-0 w-px cursor-ew-resize touch-none bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.3)]"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center border border-white/20 bg-[#1a1a1a]/90 backdrop-blur-sm transition-transform active:cursor-grabbing group-hover:scale-105 md:h-11 md:w-11">
                <svg
                  className="h-4 w-4 text-white/70 md:h-5 md:w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5l-7 7 7 7M15 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute left-5 top-5">
              <span className="border border-white/10 bg-black/40 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm">
                Before
              </span>
            </div>
            <div className="absolute right-5 top-5">
              <span className="border border-amber-500/30 bg-amber-950/40 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.2em] text-amber-400/90 backdrop-blur-sm">
                After
              </span>
            </div>

            {/* Instruction overlay */}
            {sliderPositions[i] === 50 && (
              <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 whitespace-nowrap border border-white/10 bg-black/60 px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-white/50 backdrop-blur-sm md:text-[11px]">
                Drag to compare
              </div>
            )}
          </div>

          {/* Text block — below image, not overlaid */}
          <div className="border-t border-white/5 p-6 md:p-8">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400/50">
              {String(i + 1).padStart(2, "0")}
            </span>

            <h3 className="mt-2 text-xl font-light tracking-wide text-white md:text-2xl">
              {step.title}
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-white/45 md:text-base">
              {step.desc}
            </p>

            <p className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-white/25">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
              Drag slider · Touch enabled
            </p>
          </div>
        </div>
      );
    })}
  </div>
</section>
  );
}