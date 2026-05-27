"use client";

import { useEffect, useRef, useState } from "react";

export default function TestimonialSection() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragData = useRef({
    startX: 0,
    scrollLeft: 0,
  });

  const testimonials = [
    { name: "James R.", text: "OSR Pros completely transformed our kitchen." },
    { name: "Maria L.", text: "Bathroom remodel exceeded expectations." },
    { name: "Daniel K.", text: "Full home renovation was flawless." },
    { name: "Sophia M.", text: "Living room makeover changed everything." },
    { name: "Anthony B.", text: "Basement finishing was fast and clean." },
    { name: "Emily W.", text: "Flooring work looks perfect." },
    { name: "Chris T.", text: "Outdoor deck turned out amazing." },
    { name: "Laura P.", text: "Very professional and reliable team." },
    { name: "Kevin S.", text: "Smooth process from start to finish." },
    { name: "Angela D.", text: "Best contractors we’ve worked with." },
  ];

  // Duplicate for infinite effect
  const looped = [...testimonials, ...testimonials];

  // AUTO SCROLL
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let animationFrame: number;

    const speed = 0.5;

    const animate = () => {
      if (!isPaused && !isDragging) {
        el.scrollLeft += speed;

        // seamless loop
        if (el.scrollLeft >= el.scrollWidth / 2) {
          el.scrollLeft = 0;
        }
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isPaused, isDragging]);

  // DRAG SCROLL
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;

    setIsDragging(true);
    setIsPaused(true);

    dragData.current = {
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el || !isDragging) return;

    e.preventDefault();

    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragData.current.startX) * 1.4;

    el.scrollLeft = dragData.current.scrollLeft - walk;
  };

  const stopDragging = () => {
    setIsDragging(false);
    setIsPaused(false);
  };

  return (
    <section className="w-full bg-[#ffeee7] py-24 overflow-hidden">
      {/* Header */}
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-gray-900">
          Voices From Our Clients
        </h2>

        <p className="mt-5 text-gray-700 text-lg">
          Real feedback from homeowners who trusted OSR Pros to transform
          their spaces.
        </p>
      </div>

      {/* Slider */}
      <div className="mt-16 overflow-hidden">
        <div
          ref={containerRef}
          className="flex gap-6 overflow-x-auto px-6 md:px-10 cursor-grab active:cursor-grabbing select-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => {
            setIsPaused(false);
            stopDragging();
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
        >
          {looped.map((t, i) => (
            <div
              key={i}
              className="w-[300px] md:w-[340px] shrink-0 rounded-3xl border border-white/40 bg-white/70 backdrop-blur-xl p-7 shadow-[0_10px_40px_rgba(0,0,0,0.08)]"
            >
              <div className="flex items-center gap-1 text-orange-500 text-xl">
                ★★★★★
              </div>

              <p className="mt-5 text-gray-700 leading-relaxed text-[15px]">
                “{t.text}”
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-orange-200 flex items-center justify-center font-semibold text-orange-900">
                  {t.name.charAt(0)}
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900">{t.name}</h4>
                  <p className="text-sm text-gray-500">Verified Client</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}