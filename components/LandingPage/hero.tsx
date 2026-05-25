"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

export default function HeroSection() {
const [menuOpen, setMenuOpen] = useState(false);
const [scrollY, setScrollY] = useState(0);

useEffect(() => {
const handleScroll = () => setScrollY(window.scrollY);
window.addEventListener("scroll", handleScroll);
return () => window.removeEventListener("scroll", handleScroll);
}, []);

// Parallax math
const bgOffset = scrollY * 0.003;
const textOffset = scrollY * 0.0015;
const opacity = Math.max(1 - scrollY / 900, 0);

return (
<section className="relative h-screen w-full overflow-hidden bg-black text-white">
    {/* BACKGROUND (PARALLAX) */}
    <div className="absolute inset-0 bg-cover bg-center scale-110" style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=2070&auto=format&fit=crop')",
          transform: `translateY(${bgOffset}px) scale(1.1)`,
        }} />

    {/* DARK OVERLAY (FADES ON SCROLL) */}
    <div className="absolute inset-0 bg-black/50" style={{ opacity }} />

    {/* NAVBAR */}
    <nav className="absolute top-0 left-0 z-50 w-full">
        <div className="mx-auto flex h-20 items-center justify-between px-6 md:px-10">
            {/* Desktop Logo */}
            <div className="hidden md:flex">
                <div className="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2 shadow-md">
                    <h1 className="text-2xl font-semibold tracking-[0.2em] text-white">
                        OSR Pros
                    </h1>
                </div>
            </div>

            {/* Mobile Logo */}
            <div className="absolute left-1/2 -translate-x-1/2 md:hidden">
                <div className="rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2 shadow-lg">
                    <h1 className="text-xl font-semibold tracking-[0.2em] text-white">
                        OSR Pros
                    </h1>
                </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden items-center gap-10 md:flex">
                {["Dashboard"].map((item) => (
                <a key={item} href="/dashboard"
                    className="text-sm uppercase tracking-widest text-white/80 transition hover:text-white">
                    {item}
                </a>
                ))}
            </div>

            {/* Mobile Hamburger */}
            <button onClick={()=> setMenuOpen(!menuOpen)}
                className="z-50 flex md:hidden"
                >
                {menuOpen ?
                <X /> :
                <Menu />}
            </button>
        </div>

        {/* Mobile Menu */}
        <div className={`overflow-hidden bg-black/95 backdrop-blur-md md:hidden ${ menuOpen ? "max-h-96 py-6"
            : "max-h-0" }`}>
            <div className="flex flex-col items-center gap-6">
                {["Dashboard"].map((item) => (
                <a key={item} href="/dashboard" className="text-sm uppercase tracking-[0.25em] text-white/80">
                    {item}
                </a>
                ))}
            </div>
        </div>
    </nav>

    {/* HERO CONTENT */}
    <div className="relative z-10 flex h-full items-end">
        <div className="w-full px-6 pb-10 md:px-10 md:pb-14">

            {/* MOBILE */}
            <div className="flex flex-col gap-5 md:hidden">
                <h1 className="font-semibold leading-none tracking-tight  " style={{
    transform: `translateY(${textOffset}px)`,
    opacity,
  }}>
                    <span
                        className="inline-block  rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-1 text-white shadow-lg md:px-5 md:py-2 md:text-7xl text-5xl">
                        OSR
                    </span>{" "}
                    <span className="text-white md:text-7xl text-5xl">
                        Pros
                    </span>
                </h1>

                <div className="space-y-3 max-w-xl  " style={{ transform: `translateY(${textOffset}px)`, opacity }}>
                    <p className="text-base text-white/85 leading-relaxed">
                        We transform homes and businesses with high-end remodeling,
                        precision craftsmanship, and modern design.
                    </p>

                    <p className="text-base text-white/70 leading-relaxed">
                        From residential renovations to commercial spaces like salons,
                        offices, decks, roofing, and interiors — we build spaces that
                        elevate value and experience.
                    </p>
                </div>
            </div>

            {/* DESKTOP */}
            <div className="hidden items-end justify-between gap-12 md:flex">
                <h1 className="text-7xl lg:text-8xl font-semibold leading-none tracking-tight transition" style={{
    transform: `translateY(${textOffset}px)`,
    opacity,
  }}>
                    <span
                        className="inline-block rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-2 text-white shadow-[0_0_25px_rgba(249,115,22,0.35)]">
                        OSR
                    </span>{" "}
                    <span className="text-white">
                        Pros
                    </span>
                </h1>

                <div className="max-w-xl space-y-4 pb-2  "
                    style={{ transform: `translateY(${textOffset}px)`, opacity }}>
                    <p className="text-lg text-white/85 leading-relaxed">
                        We transform homes and businesses with high-end remodeling,
                        precision craftsmanship, and modern design.
                    </p>

                    <p className="text-lg text-white/70 leading-relaxed">
                        From residential renovations to commercial spaces like salons,
                        offices, decks, roofing, and interiors — we build spaces that
                        elevate value and experience.
                    </p>
                </div>
            </div>

        </div>
    </div>
</section>
);
}