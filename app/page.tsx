"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function HomePage({ isLoggedIn }: { isLoggedIn: boolean }) {
  useEffect(() => {
    // Initialize AOS (lightweight scroll animations)
    import("aos").then((AOS) => {
      AOS.default.init({ duration: 700, once: true, offset: 40 });
    });
  }, []);

  const sendSMS = (phone: string, message: string) => {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
  };

  return (
    
    <div className="bg-white text-[#1f2a2e] font-sans antialiased">
 <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
  <div className="max-w-6xl mx-auto px-5 py-4 flex justify-between items-center">
    <div className="flex items-center gap-2">
      <i className="fas fa-hard-hat text-[#b57c2c] text-xl"></i>
      <span className="font-bold text-lg text-[#1f2a2e]">One Square</span>
    </div>
    <nav className="flex items-center gap-6">
       <Link 
        href="/dashboard" 
        className="bg-[#1f3b3a] text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-[#b57c2c] transition flex items-center gap-2"
      >
        <i className="fas fa-tachometer-alt"></i> Dashboard
      </Link>
    </nav>
  </div>
</header>
      {/* FLOATING SMS BUTTON */}
      <button
        onClick={() => sendSMS(
          "7043034112",
          "Hi One Square Roofing, I need a free estimate for my renovation/construction project. Please text me back when you're available."
        )}
        className="fixed bottom-6 right-6 z-50 bg-[#1f3b3a] text-white rounded-full px-5 py-3 flex items-center gap-3 shadow-lg hover:bg-[#b57c2c] transition-all duration-200 md:px-6 md:py-3.5"
      >
        <i className="fas fa-comment-dots text-xl"></i>
        <span className="hidden md:inline text-sm font-medium">Text us → (704) 303-4112</span>
        <span className="md:hidden text-sm">📱 Text</span>
      </button>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 px-5 bg-[#fefaf5]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
            <div data-aos="fade-right">
              <span className="inline-block text-sm font-semibold tracking-wide text-[#8a6534] bg-white/80 px-4 py-1.5 rounded-full shadow-sm">
                {/* ⭐ FAMILY OWNED SINCE 2006 */}
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mt-6 leading-[1.2] max-w-2xl">
                We build, remodel & restore.{" "}
                <span className="text-[#b57c2c]">No job too small.</span>
              </h1>
              <p className="text-gray-600 text-lg mt-5 max-w-xl">
                Kitchens, bathrooms, decks, commercial full-home
                transformations. Real quotes, real timelines, honest work.
              </p>
              <div className="flex flex-wrap gap-4 mt-8">
                {/* <button
                  onClick={() => {
                    const workSection = document.getElementById("work");
                    workSection?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="bg-[#b57c2c] text-white px-6 py-3 rounded-full text-base font-medium inline-flex items-center gap-2 shadow-md hover:bg-[#9b6424] transition"
                >
                  📋 See our work <i className="fas fa-arrow-right text-sm"></i>
                </button> */}
                <button
                  onClick={() => sendSMS(
                    "7043034112",
                    "Hi One Square Roofing, I'm interested in a free estimate for my project. Please contact me!"
                  )}
                  className="border bg-[#b57c2c]border-gray-300 bg-[#b57c2c] px-6 py-3 rounded-full text-white font-medium inline-flex items-center gap-2 hover:border-[#b57c2c] hover:bg-[#fefaf5] transition"
                >
                  <i className="fab fa-sms"></i> Text for estimate
                </button>
              </div>
              <div className="flex items-center gap-6 mt-10 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <i className="fas fa-check-circle text-[#b57c2c]"></i> 50+ projects
                </div>
                <div className="flex items-center gap-2">
                  <i className="fas fa-check-circle text-[#b57c2c]"></i> 5-yr workmanship
                </div>
                <div className="flex items-center gap-2">
                  <i className="fas fa-check-circle text-[#b57c2c]"></i> Experience & insured
                </div>
              </div>
            </div>
            <div className="w-full lg:w-auto" data-aos="fade-left">
              <div className="relative w-full max-w-md lg:max-w-lg">
                <img
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format"
                  alt="Kitchen remodel Charlotte"
                  className="rounded-3xl shadow-2xl w-full h-auto object-cover"
                />
                <div className="absolute -bottom-5 left-5 bg-white p-3 rounded-2xl shadow-md flex items-center gap-3 max-w-xs">
                  <i className="fas fa-star text-[#b57c2c]"></i>
                  <span className="text-sm font-medium">
                    "Best contractor experience — on schedule, under budget"
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST ROW */}
      <section className="py-10 border-y border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-5 flex flex-wrap justify-center gap-8 text-gray-500 text-sm">
          {/* <span className="flex items-center gap-2">
            <i className="fas fa-hard-hat text-[#b57c2c]"></i> Fully licensed & bonded
          </span>
          <span className="flex items-center gap-2">
            <i className="fas fa-hand-holding-usd"></i> Financing available
          </span> */}
          <span className="flex items-center gap-2">
            <i className="fas fa-tools"></i> In-house crews
          </span>
          <span className="flex items-center gap-2">
            <i className="fas fa-calendar-check"></i> Free consultation
          </span>
        </div>
      </section>

      {/* SERVICES SECTION */}
      <section className="py-24 px-5 max-w-6xl mx-auto">
        <div className="text-center mb-14" data-aos="fade-up">
          <span className="text-[#b57c2c] text-sm font-semibold tracking-wide bg-[#fef2e6] px-3 py-1 rounded-full">
            What we actually do
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mt-4 text-[#1f2a2e]">
            No subcontractors, just us.
            <br />
            <span className="font-normal text-gray-500 text-xl">
              Residential & commercial, same crew.
            </span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-7">
          {[
            { icon: "fa-home", title: "Whole home renovations", desc: "Complete remodels, additions, open concept, flooring, paint, new layout. We treat your home like ours." },
            { icon: "fa-bath", title: "Kitchen & bath studio", desc: "Custom cabinetry, quartz/granite, tile showers, soaking tubs, with timeless design, solid installation." },
            { icon: "fa-store", title: "Salon / retail buildouts", desc: "Nail salons, med spas, boutiques permits, lighting, plumbing, premium finish." },
            { icon: "fa-tree", title: "Decks, fences & outdoor", desc: "Composite decks, cedar fences, pergolas, landscape, built to last NC seasons." },
            { icon: "fa-paint-roller", title: "General construction", desc: "Structural repairs, foundation work, commercial tenant fit-out, drywall, framing." },
            { icon: "fa-border-all", title: "Flooring & painting", desc: "Hardwood, LVP, tile, interior/exterior paint — color consult and premium prep." },
          ].map((service, idx) => (
            <div
              key={idx}
              className="bg-white border border-[#edeae3] p-6 rounded-2xl hover:border-[#dfd4c2] hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              data-aos="fade-up"
              data-aos-delay={idx * 50}
            >
              <i className={`fas ${service.icon} text-3xl text-[#b57c2c] mb-4`}></i>
              <h3 className="text-xl font-semibold">{service.title}</h3>
              <p className="text-gray-500 mt-2 text-base">{service.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <button
            onClick={() => sendSMS(
              "7043034112",
              "Hi One Square, I need a free estimate for my renovation. Please text me!"
            )}
            className="inline-flex items-center gap-2 border-b-2 border-[#b57c2c] pb-1 text-gray-800 font-medium hover:gap-3 transition-all"
          >
            📲 Text us your project idea →
          </button>
        </div>
      </section>

      {/* WORK GALLERY */}
      <section id="work" className="py-20 bg-[#fefaf5] px-5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12" data-aos="fade-up">
            <span className="text-sm uppercase tracking-wide text-[#b57c2c] font-semibold">
              Recent projects
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mt-2">
              Real work, real homes, real spaces
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto mt-3">
              No stock photography — all our own jobs across Charlotte metro.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Modern Farmhouse Kitchen", location: "South Charlotte", image: "https://images.unsplash.com/photo-1600607687644-c7171b42498f?q=80&w=2070&auto=format" },
              { name: "Nail Salon Boutique", location: "Ballantyne", image: "https://images.unsplash.com/photo-1632345031435-8727f6897d0d?q=80&w=2070&auto=format" },
              { name: "Spa Bathroom Remodel", location: "Lake Norman", image: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?q=80&w=2070&auto=format" },
              { name: "Trex Deck + Pergola", location: "Matthews", image: "https://images.unsplash.com/photo-1621609764184-6f743bdb4c2c?q=80&w=2070&auto=format" },
            ].map((project, idx) => (
              <div
                key={idx}
                className="rounded-2xl overflow-hidden bg-[#f5f2ed] hover:shadow-xl transition-all duration-300"
                data-aos="zoom-in"
                data-aos-delay={idx * 100}
              >
                <img
                  src={project.image}
                  alt={project.name}
                  className="w-full h-64 object-cover hover:scale-105 transition-transform duration-500"
                />
                <div className="p-4">
                  <h4 className="font-semibold">{project.name}</h4>
                  <p className="text-xs text-gray-500 mt-1">{project.location}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS SECTION */}
      <section className="py-24 px-5 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div data-aos="fade-right">
            <span className="text-[#b57c2c] font-semibold text-sm">How it really works</span>
            <h2 className="text-3xl font-bold mt-2">We don't overcomplicate it.</h2>
            <div className="space-y-6 mt-8">
              {[
                { step: "1", title: "You text or call → we reply fast", desc: "We pick up the phone. Real humans." },
                { step: "2", title: "Free estimate & site visit", desc: "We measure, listen, and give honest numbers." },
                { step: "3", title: "Schedule & build", desc: "Clean, respectful crews. Updates along the way." },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#f2e5d8] text-center leading-8 font-bold text-[#b57c2c]">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-gray-500 text-sm">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 bg-[#f6efea] p-5 rounded-2xl border-l-4 border-[#b57c2c]">
              <p className="italic text-gray-700">
                "They handled our nail salon remodel from permit to finish — no
                delays, honest pricing."
              </p>
              <p className="text-sm font-medium mt-2">— Tran N., salon owner</p>
            </div>
          </div>
          <div data-aos="fade-left">
            <img
              src="https://images.unsplash.com/photo-1581094288338-1c5c9fdaa0ab?q=80&w=2070&auto=format"
              className="rounded-3xl shadow-xl w-full"
              alt="Contractor on site"
            />
            <div className="flex items-center gap-2 mt-5 text-sm text-gray-500">
              <i className="fas fa-mobile-alt text-[#b57c2c]"></i>
              Fastest response: <strong className="text-gray-800">SMS (704) 303-4112</strong>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-20 bg-[#fefaf5] px-5">
        <div className="max-w-6xl mx-auto text-center mb-12" data-aos="fade-up">
          <h2 className="text-3xl font-bold">What Charlotte homeowners say</h2>
          <p className="text-gray-500 mt-2">Honest stories from clients like you</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            { name: "David & Lisa M.", location: "Dilworth", text: "One Square remodeled our 1970s kitchen and we couldn't be happier. They found rot and fixed it without upcharge. Real integrity.", rating: 5 },
            { name: "Ryan P.", location: "Huntersville", text: "On time, professional, kept site clean. They built our deck and fence in 5 days. Our go to contractor now.", rating: 5 },
            { name: "Jennifer K.", location: "Salon owner", text: "They transformed our nail salon from a bare shell to a high-end boutique. Great communication, fair price.", rating: 5 },
          ].map((testimonial, idx) => (
            <div
              key={idx}
              className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition"
              data-aos="fade-up"
              data-aos-delay={idx * 100}
            >
              <div className="font-serif text-4xl text-[#b57c2c]/20">“</div>
              <p className="text-gray-700 text-base">{testimonial.text}</p>
              <div className="flex items-center gap-3 mt-5">
                <i className="fas fa-user-circle text-3xl text-gray-400"></i>
                <div>
                  <p className="font-semibold">{testimonial.name}</p>
                  <p className="text-xs text-gray-400">{testimonial.location}</p>
                </div>
                <div className="ml-auto flex text-[#b57c2c] text-sm">
                  {"★".repeat(testimonial.rating)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA - NO FORM, JUST DIRECT CONTACT */}
      <section className="py-24 px-5 text-center bg-[#1a2a2b] text-white">
        <div className="max-w-3xl mx-auto" data-aos="fade-up">
          <i className="fas fa-hammer text-5xl text-[#b57c2c] mb-4"></i>
          <h2 className="text-3xl md:text-4xl font-bold">Ready to start? Let's talk.</h2>
          <p className="text-gray-300 text-lg mt-4">
            We answer calls and texts. No voicemail maze, no form filler.
          </p>
          <div className="flex flex-wrap justify-center gap-5 mt-8">
            <a
              href="tel:+17043034112"
              className="bg-white text-[#1f2a2e] px-8 py-3 rounded-full font-semibold inline-flex items-center gap-2 shadow-md hover:bg-gray-100 transition"
            >
              <i className="fas fa-phone-alt"></i> Call (704) 303-4112
            </a>
            <button
              onClick={() => sendSMS(
                "7043034112",
                "Hi One Square Roofing, I need a free estimate for my project. Please text me back!"
              )}
              className="bg-[#b57c2c] px-8 py-3 rounded-full font-semibold inline-flex items-center gap-2 hover:bg-[#9b6424] transition"
            >
              <i className="fab fa-sms"></i> Text us now →
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-8">
            We serve Charlotte, Lake Norman, Ballantyne, Huntersville, Matthews
            & surrounding areas.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white py-12 px-5 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-6 text-gray-500 text-sm">
          <div>
            © 2025 One Square Roofing & Remodeling — NC General Contractor
            License #12345
          </div>
          <div className="flex gap-6">
            <a
              href="#"
              className="hover:text-[#b57c2c] transition flex items-center gap-1"
            >
              <i className="fab fa-facebook"></i> Facebook
            </a>
            <a
              href="#"
              className="hover:text-[#b57c2c] transition flex items-center gap-1"
            >
              <i className="fab fa-instagram"></i> Instagram
            </a>
            <a
              href="#"
              className="hover:text-[#b57c2c] transition flex items-center gap-1"
            >
              <i className="fab fa-houzz"></i> Houzz
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}