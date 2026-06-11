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
<section className="w-full overflow-hidden bg-[#f5f2ed] py-24 md:py-32">
  {/* Header */}
  <div className="mx-auto max-w-4xl px-6 text-center lg:px-16">
    {/* Eyebrow */}
    <div className="mb-6 flex items-center justify-center gap-4">
      <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-600/50" />
      <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-amber-700/70">
        Client Stories
      </p>
      <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-600/50" />
    </div>

    <h2 className="font-light tracking-tight text-[#1a1a1a]">
      <span className="block text-3xl md:text-5xl lg:text-6xl">
        Voices From
      </span>
      <span className="mt-2 block text-3xl text-[#1a1a1a]/35 md:text-5xl lg:text-6xl">
        Our Clients
      </span>
    </h2>

    <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-[#1a1a1a]/50 md:text-lg">
      Real feedback from homeowners who trusted OSR Pros to transform
      their spaces.
    </p>
  </div>

  {/* Slider */}
  <div className="relative mt-16 md:mt-20">
    {/* Fade edges */}
    <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-[#f5f2ed] to-transparent md:w-24" />
    <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[#f5f2ed] to-transparent md:w-24" />

    <div
      ref={containerRef}
      className="flex cursor-grab gap-6 overflow-x-auto px-6 select-none active:cursor-grabbing md:gap-8 md:px-16"
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
          className="w-[300px] shrink-0 border border-[#1a1a1a]/8 bg-white p-8 md:w-[360px] md:p-10"
        >
          {/* Stars */}
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5 text-amber-600/80">
              {[...Array(5)].map((_, star) => (
                <svg
                  key={star}
                  className="h-3 w-3 fill-current"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#1a1a1a]/30">
              5.0
            </span>
          </div>

          {/* Quote */}
          <div className="relative mt-6">
            <span className="absolute -top-2 -left-1 font-serif text-5xl leading-none text-amber-600/15 select-none">
              "
            </span>
            <p className="relative text-[15px] leading-relaxed text-[#1a1a1a]/70 md:text-base">
              {t.text}
            </p>
          </div>

          {/* Accent line */}
          <span className="mt-6 block h-px w-8 bg-amber-600/40" />

          {/* Author */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-[#1a1a1a]/10 bg-[#f5f2ed] text-sm font-medium text-[#1a1a1a]/70">
              {t.name.charAt(0)}
            </div>

            <div>
              <h4 className="text-sm font-medium tracking-wide text-[#1a1a1a]">
                {t.name}
              </h4>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-[#1a1a1a]/35">
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