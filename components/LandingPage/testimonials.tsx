"use client";

import { useEffect, useRef, useState } from "react";

export default function TestimonialSection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);

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

  const looped = [...testimonials, ...testimonials];

  // Auto scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let animationFrame: number;
    let position = 0;

    const speed = 0.6; // adjust speed here

    const animate = () => {
      if (!isPaused && el) {
        position += speed;

        // reset loop seamlessly
        if (position >= el.scrollWidth / 2) {
          position = 0;
        }

        el.scrollLeft = position;
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isPaused]);

  return (
    <section className="w-full bg-[#ffeee7] py-24 overflow-hidden">
      {/* Header */}
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight text-gray-900">
          Voices From Our Clients
        </h2>
        <p className="mt-5 text-gray-700 text-lg">
          Real feedback from homeowners who trusted OSR Pros to transform their spaces.
        </p>
      </div>

      {/* Slider */}
      <div
        className="mt-16 overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div
          ref={containerRef}
          className="flex gap-6 px-6 overflow-x-auto scroll-smooth cursor-grab active:cursor-grabbing"
          style={{ scrollbarWidth: "none" }}
        >
          {looped.map((t, i) => (
            <div
              key={i}
              className="w-[300px] md:w-[320px] shrink-0 rounded-2xl bg-white/80 backdrop-blur-md p-6 shadow-md"
            >
              <p className="text-gray-700">“{t.text}”</p>
              <h4 className="mt-4 font-semibold text-gray-900">{t.name}</h4>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}