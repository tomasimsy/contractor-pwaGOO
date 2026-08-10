"use client";

/**
 * Ported from the previous app's testimonials.tsx — the auto-scroll +
 * click-drag carousel logic (requestAnimationFrame loop, seamless
 * loop-around, mouse drag-to-scroll) is preserved verbatim. Only the
 * visual treatment changed.
 */
import { useEffect, useRef, useState } from "react";

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
  { name: "Angela D.", text: "Best contractors we've worked with." },
];

export function Testimonials() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragData = useRef({ startX: 0, scrollLeft: 0 });

  const looped = [...testimonials, ...testimonials];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let animationFrame: number;
    const speed = 0.5;

    const animate = () => {
      if (!isPaused && !isDragging) {
        el.scrollLeft += speed;
        if (el.scrollLeft >= el.scrollWidth / 2) el.scrollLeft = 0;
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPaused, isDragging]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    setIsDragging(true);
    setIsPaused(true);
    dragData.current = { startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
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
    <section className="w-full overflow-hidden bg-[#F4F3EF] py-24 md:py-32">
      <div className="mx-auto max-w-4xl px-6 text-center lg:px-16">
        <p className="mb-6 font-[family-name:var(--font-landing-mono)] text-[11px] uppercase tracking-[0.3em] text-[#B23A1C]">
          Client Stories
        </p>

        <h2 className="font-[family-name:var(--font-landing-display)] text-4xl font-semibold tracking-tight text-[#1C1410] md:text-5xl lg:text-6xl">
          Voices from our <span className="italic">clients</span>.
        </h2>
      </div>

      <div className="relative mt-16 md:mt-20">
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-[#F4F3EF] to-transparent md:w-24" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[#F4F3EF] to-transparent md:w-24" />

        <div
          ref={containerRef}
          className="flex cursor-grab gap-5 overflow-x-auto px-6 select-none active:cursor-grabbing md:gap-6 md:px-16"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
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
              className="w-[280px] shrink-0 border-2 border-[#1C1410] bg-white p-7 md:w-[320px] md:p-8"
            >
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5 text-[#B23A1C]">
                  {[...Array(5)].map((_, star) => (
                    <svg key={star} className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.15em] text-[#1C1410]/35">
                  5.0
                </span>
              </div>

              <p className="mt-5 font-[family-name:var(--font-landing-display)] text-lg leading-snug text-[#1C1410]">
                &ldquo;{t.text}&rdquo;
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center bg-[#1C1410] font-[family-name:var(--font-landing-mono)] text-sm font-bold text-[#CB9A3E]">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[#1C1410]">{t.name}</h4>
                  <p className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.1em] text-[#1C1410]/40">
                    Verified Client
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
