"use client";

/**
 * Replaces the previous app's testimonials.tsx. That file had fabricated
 * client names and quotes — this is a genuinely new business with no
 * customer history to draw real ones from, and inventing them isn't an
 * option. The auto-scroll + click-drag carousel MECHANISM (the
 * requestAnimationFrame loop, seamless loop-around, mouse drag-to-scroll)
 * is preserved verbatim from that file — it's a UI pattern, not a claim
 * about anyone. What's on the cards changed: honest statements about how
 * the company works, not invented social proof.
 */
import { useEffect, useRef, useState } from "react";

const commitments = [
  {
    title: "You talk to the person doing the work",
    text: "No account managers, no call center. The person planning your project is the one on site.",
  },
  {
    title: "Scope and price, in writing, before we start",
    text: "You'll know what's included, what isn't, and what it costs — before any work begins.",
  },
  {
    title: "New company. Everything to prove.",
    text: "We don't have a decade of jobs behind us yet — which means your project gets our full attention, not a fraction of it.",
  },
  {
    title: "We show up when we say we will",
    text: "Clear timelines, and a heads-up the moment anything changes — not silence.",
  },
  {
    title: "Licensed and insured, from day one",
    text: "New doesn't mean unqualified. The paperwork is real, checked, and current.",
  },
  {
    title: "Small enough to sweat the details",
    text: "You're not job #400 on a list. Every project is one we're building our name on.",
  },
];

export function Commitments() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragData = useRef({ startX: 0, scrollLeft: 0 });

  const looped = [...commitments, ...commitments];

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
          Why a New Company
        </p>

        <h2 className="font-[family-name:var(--font-landing-display)] text-4xl font-semibold tracking-tight text-[#1C1410] md:text-5xl lg:text-6xl">
          We&apos;re new. <span className="italic">Here&apos;s what that gets you.</span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#1C1410]/55 md:text-lg">
          We&apos;re not going to pretend we&apos;ve got decades of jobs behind
          us — we don&apos;t. What you get instead: a company with everything
          riding on getting your project right.
        </p>
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
          {looped.map((c, i) => (
            <div
              key={i}
              className="w-[280px] shrink-0 border-2 border-[#1C1410] bg-white p-7 md:w-[320px] md:p-8"
            >
              <span className="font-[family-name:var(--font-landing-mono)] text-[10px] uppercase tracking-[0.15em] text-[#B23A1C]">
                {String((i % commitments.length) + 1).padStart(2, "0")}
              </span>

              <p className="mt-4 font-[family-name:var(--font-landing-display)] text-lg font-medium leading-snug text-[#1C1410]">
                {c.title}
              </p>

              <p className="mt-3 text-sm leading-relaxed text-[#1C1410]/55">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
