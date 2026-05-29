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
    <section className="w-full bg-white py-12 md:py-24">
      {/* HEADER */}
      <div className="mx-auto max-w-5xl px-4 md:px-6 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-6xl font-semibold tracking-tight text-gray-900">
          From Skeleton to Masterpiece
        </h2>

        <p className="mt-4 md:mt-5 text-gray-600 text-base md:text-lg">
          Every project starts raw — exposed walls, unfinished floors, and open frames.
          We transform structure into precision-built spaces.
        </p>
      </div>

      {/* GRID */}
      <div className="mx-auto mt-12 md:mt-16 grid max-w-7xl grid-cols-1 gap-6 md:gap-10 px-4 md:px-6 lg:grid-cols-2">
        {steps.map((step, i) => {
          const sliderPosition = sliderPositions[i] ?? 50;
          
          return (
            <div
              key={i}
              className="relative overflow-hidden rounded-xl md:rounded-2xl shadow-lg bg-gray-900"
            >
              <div 
                ref={(el) => { containerRefs.current[i] = el; }}
                className="relative h-[280px] sm:h-[320px] md:h-[380px] w-full select-none touch-none"
                onMouseDown={(e) => handleMouseDown(i, e)}
                onTouchStart={(e) => handleTouchStart(i, e)}
              >
                {/* Before Image (full image) */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${step.beforeImage}')` }}
                />
                
                {/* After Image (clipped based on slider position) */}
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${step.afterImage}')`,
                    clipPath: `inset(0 0 0 ${sliderPosition}%)`,
                  }}
                />
                
                {/* Slider Handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 md:w-1 bg-white shadow-lg cursor-ew-resize touch-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  {/* Drag handle - larger for mobile */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 bg-white rounded-full shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                    </svg>
                  </div>
                </div>

                {/* Labels on image */}
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="text-[10px] md:text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600   px-2 py-1 rounded-full backdrop-blur-sm">
                    BEFORE
                  </span>
                </div>
                <div className="absolute top-4 right-4 flex gap-2">
                  <span className="text-[10px] md:text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600  px-2 py-1 rounded-full backdrop-blur-sm">
                    AFTER
                  </span>
                </div>

                {/* Instruction overlay - shows briefly on first load */}
                {sliderPositions[i] === 50 && (
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5 rounded-full whitespace-nowrap pointer-events-none animate-pulse">
                    👆 Drag the slider to see transformation
                  </div>
                )}
              </div>

              {/* Text Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                <h3 className="text-lg md:text-2xl font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-1 md:mt-2 text-white/80 text-xs md:text-sm">
                  {step.desc}
                </p>
                <div className="mt-2 md:mt-3 flex items-center gap-1 text-[10px] md:text-xs text-white/50">
                  <span>💡</span>
                  <span>Drag the slider — works on touch screens</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}