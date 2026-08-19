"use client";

/**
 * Ported from the previous app's behindTheScene.tsx — the drag/touch
 * before-after comparison slider logic is preserved verbatim (mouse +
 * touch handlers, global listeners while dragging, clip-path reveal).
 * Only the visual treatment changed.
 */
import { useState, useRef, useEffect } from "react";

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

export function BehindTheScene() {
  const [sliderPositions, setSliderPositions] = useState<{ [key: number]: number }>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const updatePosition = (index: number, clientX: number) => {
    const container = containerRefs.current[index];
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.min(Math.max(x, 0), rect.width);
    const percentage = (x / rect.width) * 100;
    setSliderPositions((prev) => ({ ...prev, [index]: percentage }));
  };

  const handleMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex(index);
    updatePosition(index, e.clientX);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (activeIndex !== null) updatePosition(activeIndex, e.clientX);
  };

  const handleMouseUp = () => setActiveIndex(null);

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    e.preventDefault();
    setActiveIndex(index);
    const touch = e.touches[0];
    if (touch) updatePosition(index, touch.clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (activeIndex !== null) {
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) updatePosition(activeIndex, touch.clientX);
    }
  };

  const handleTouchEnd = () => setActiveIndex(null);

  useEffect(() => {
    if (activeIndex !== null) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [activeIndex]);

  useEffect(() => {
    const initialPositions: { [key: number]: number } = {};
    steps.forEach((_, index) => {
      initialPositions[index] = 50;
    });
    setSliderPositions(initialPositions);
  }, []);

  return (
    <section id="process" className="w-full bg-[#FAF6EF] py-24 md:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center md:px-10 lg:px-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[#4B6B4F]">See the Transformation</p>

        <h2 className="font-[family-name:var(--font-landing-display)] text-4xl font-medium leading-tight text-[#26231F] md:text-5xl">
          From <span className="italic">before</span> to after.
        </h2>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#6E6659] md:text-lg">
          Every project starts raw — exposed walls, unfinished floors, and open frames. Drag the line to see the transformation.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-[1400px] grid-cols-1 gap-8 px-6 md:mt-16 md:gap-10 md:px-10 lg:grid-cols-2 lg:px-16">
        {steps.map((step, i) => {
          const sliderPosition = sliderPositions[i] ?? 50;
          return (
            <div key={step.title} className="group overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
              <div
                ref={(el) => {
                  containerRefs.current[i] = el;
                }}
                className="relative h-[280px] w-full touch-none select-none sm:h-[320px] md:h-[380px]"
                onMouseDown={(e) => handleMouseDown(i, e)}
                onTouchStart={(e) => handleTouchStart(i, e)}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${step.beforeImage}')` }}
                />
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${step.afterImage}')`,
                    clipPath: `inset(0 0 0 ${sliderPosition}%)`,
                  }}
                />

                <div
                  className="absolute bottom-0 top-0 w-1 cursor-ew-resize touch-none bg-white shadow-[0_0_10px_rgba(0,0,0,0.35)]"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white shadow-lg transition-transform active:cursor-grabbing group-hover:scale-105">
                    <svg className="h-4 w-4 text-[#26231F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l-7 7 7 7M15 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="absolute left-4 top-4">
                  <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                    Before
                  </span>
                </div>
                <div className="absolute right-4 top-4">
                  <span className="rounded-full bg-[#4B6B4F] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    After
                  </span>
                </div>

                {sliderPositions[i] === 50 && (
                  <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm">
                    Drag to compare
                  </div>
                )}
              </div>

              <div className="p-6 md:p-7">
                <h3 className="font-[family-name:var(--font-landing-display)] text-xl font-medium text-[#26231F] md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6E6659]">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
