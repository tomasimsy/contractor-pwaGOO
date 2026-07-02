"use client";

import { useState } from "react";
import { 
  Search, Copy, Check, ChevronDown, ChevronUp, 
  Target, FileText, MessageSquare, CheckCircle, 
  AlertTriangle, BarChart3, Lightbulb, Users, 
  Clock, Phone, Mail, Home, Ruler, Pencil, 
  DollarSign, Handshake, Calendar, ArrowRight,
  Bookmark, Share2, Star
} from "lucide-react";

export default function DeckSalesGuide() {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const toggleStep = (step: number) => {
    setExpandedStep(expandedStep === step ? null : step);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-amber-800 via-amber-700 to-orange-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4 border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">🏗️ Sales Playbook</span>
              <span className="w-1 h-1 rounded-full bg-amber-300/50" />
              <span className="text-[10px] font-medium text-amber-200">Deck Building</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
              How to Sell a <br className="sm:hidden" />
              <span className="bg-gradient-to-r from-amber-200 to-orange-100 bg-clip-text text-transparent">New Deck Build</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-amber-100/80 max-w-2xl leading-relaxed">
              A complete step‑by‑step guide for sales reps – from lead qualification to signed contract. 
              Includes real examples, objection handlers, and a proven pricing model.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl border border-white/10 text-sm font-medium text-white transition-all duration-200">
                {/* <Bookmark size={16} /> Save Guide */}
                <Bookmark size={16} /> <a href="/sales" className="text-white hover:text-emerald-200">Back to Playbook</a>
              </button>
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl border border-white/10 text-sm font-medium text-white transition-all duration-200">
                <Share2 size={16} /> Share
              </button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 60V40C240 20 480 30 720 35C960 40 1200 25 1440 35V60H0Z" fill="#f8fafc" fillOpacity="0.95" />
          </svg>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-2 relative z-10">
        {/* Quick Summary / Progress */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 p-4 sm:p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">8</span>
              <span className="text-slate-400">Steps</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">~45 min</span>
              <span className="text-slate-400">Average sales cycle</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">$15K–$50K+</span>
              <span className="text-slate-400">Typical project range</span>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">60–70%</span>
              <span className="text-slate-400">Close rate with this process</span>
            </div>
          </div>
        </div>

        {/* Step 1 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(1)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">1</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Lead Qualification & Discovery</h3>
                <p className="text-xs text-slate-400">Uncover needs, budget, and timeline</p>
              </div>
            </div>
            {expandedStep === 1 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 1 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                    <Target size={14} /> Key Discovery Questions
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> "What's the primary purpose of this deck? (entertaining, relaxing, kids play area?)"</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> "What's your rough budget range – are we looking at $15K, $30K, or more?"</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> "Do you have a preferred timeline – before summer, for an upcoming event?"</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> "Have you received other quotes? What's most important to you in choosing a contractor?"</li>
                  </ul>
                </div>
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"We have a large backyard and want to host summer BBQs. We need a 20'x16' deck with a built-in bench and steps. Our budget is around $25K, and we'd like it done by June."</p>
                  <p className="text-xs text-slate-500 mt-2">→ This tells you: size, features, timeline, budget range.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(2)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">2</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Site Visit & Measurement</h3>
                <p className="text-xs text-slate-400">Assess conditions, take accurate measurements, identify challenges</p>
              </div>
            </div>
            {expandedStep === 2 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 2 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                    <Ruler size={14} /> What to Check
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Soil condition and slope – affects foundation depth.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Access to the backyard – can we get equipment through?</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Existing doors and windows – alignment with deck height.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Utility lines (gas, electric) – avoid digging.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Local building codes – setback, height restrictions.</li>
                  </ul>
                </div>
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"The yard slopes slightly away from the house, so we'll need steps and a raised foundation. The side gate is 4' wide – our wheelbarrow and small equipment can fit. We'll need a building permit for this size."</p>
                  <p className="text-xs text-slate-500 mt-2">→ Document everything with photos and notes for the proposal.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 3 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(3)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">3</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Design & Material Selection</h3>
                <p className="text-xs text-slate-400">Help client choose layout, materials, and features</p>
              </div>
            </div>
            {expandedStep === 3 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 3 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Material Options</h4>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> <strong>Pressure-treated wood</strong> – affordable, needs maintenance.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> <strong>Composite decking</strong> – low maintenance, higher cost.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> <strong>PVC</strong> – premium, zero maintenance, very durable.</li>
                  </ul>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Design Features</h4>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Built-in benches and planters.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Lighting (step lights, post caps).</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Railings – glass, metal, wood.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Stairs and landing.</li>
                  </ul>
                </div>
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"We'll go with composite decking in a gray tone, aluminum railing, and integrated LED lighting along the steps. Add a built-in bench on one side."</p>
                  <p className="text-xs text-slate-500 mt-2">→ This becomes the basis for your proposal.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 4 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(4)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">4</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Proposal & Pricing</h3>
                <p className="text-xs text-slate-400">Build a detailed, transparent estimate</p>
              </div>
            </div>
            {expandedStep === 4 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 4 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                    <DollarSign size={14} /> Typical Cost Breakdown
                  </h4>
                  <div className="mt-2 space-y-1 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <div className="flex justify-between"><span>Materials (decking, framing, hardware)</span><span className="font-mono">$8,000</span></div>
                    <div className="flex justify-between"><span>Labor (construction, finishing)</span><span className="font-mono">$10,000</span></div>
                    <div className="flex justify-between"><span>Permits & inspections</span><span className="font-mono">$500</span></div>
                    <div className="flex justify-between"><span>Site prep & cleanup</span><span className="font-mono">$1,500</span></div>
                    <div className="flex justify-between"><span>Design & engineering (if needed)</span><span className="font-mono">$1,000</span></div>
                    <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between font-bold"><span>Total Estimate</span><span className="font-mono text-emerald-700">$21,000</span></div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">* Varies by region, size, and material choice.</p>
                </div>
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Proposal Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"20'x16' composite deck with aluminum railing, built‑in bench, and steps. Includes all materials, labor, permit, cleanup. Total: $21,000. Payment schedule: 50% deposit, 25% at halfway, 25% upon completion."</p>
                  <p className="text-xs text-slate-500 mt-2">→ Break out every cost item for transparency.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 5 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(5)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">5</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Presenting the Proposal</h3>
                <p className="text-xs text-slate-400">Walk through the estimate, highlight value, address concerns</p>
              </div>
            </div>
            {expandedStep === 5 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 5 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
                    <FileText size={14} /> Presentation Tips
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Start with what you heard: "Based on our discussion, you wanted a deck for hosting, low-maintenance, and a built‑in bench."</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Show visuals – 3D rendering or photos of similar decks.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Explain each cost item and the value it brings.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Highlight warranty and maintenance schedule.</li>
                    <li className="flex items-start gap-2"><span className="text-amber-400">•</span> Offer a phased option or material upgrade/downgrade.</li>
                  </ul>
                </div>
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"I've put together a complete proposal. Here's the 3D rendering of how your deck will look. The composite decking is more expensive upfront but saves you $2,000 in staining over 10 years. We've included a 5‑year workmanship warranty."</p>
                  <p className="text-xs text-slate-500 mt-2">→ Show the value, not just the price.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 6 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(6)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-sm shrink-0">6</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Handling Objections</h3>
                <p className="text-xs text-slate-400">Common concerns & how to respond</p>
              </div>
            </div>
            {expandedStep === 6 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 6 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-rose-500" /><span className="font-bold text-sm">"That's too expensive."</span></div>
                  <p className="text-xs text-slate-600 mt-1">"I understand. Let's look at what's included – quality materials, skilled labor, and a 5‑year warranty. We can also adjust the scope or materials to fit your budget. What's your target number?"</p>
                </div>
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-rose-500" /><span className="font-bold text-sm">"How long will it take?"</span></div>
                  <p className="text-xs text-slate-600 mt-1">"We schedule 2‑3 weeks for a deck of this size, weather permitting. We'll give you a detailed timeline and update you daily. If we hit delays, you'll know right away."</p>
                </div>
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-rose-500" /><span className="font-bold text-sm">"What about the mess?"</span></div>
                  <p className="text-xs text-slate-600 mt-1">"We protect your yard with tarps, clean up daily, and do a final site sweep. We take pride in leaving your property better than we found it."</p>
                </div>
                <div className="bg-white border border-slate-200/60 rounded-xl p-3">
                  <div className="flex items-center gap-2"><AlertTriangle size={14} className="text-rose-500" /><span className="font-bold text-sm">"I need to talk to my spouse."</span></div>
                  <p className="text-xs text-slate-600 mt-1">"Of course – this is a big decision. I'd be happy to schedule a follow‑up meeting with both of you to answer any questions. In the meantime, here's a summary you can review together."</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 7 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-4">
          <button
            onClick={() => toggleStep(7)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">7</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Closing the Deal</h3>
                <p className="text-xs text-slate-400">Ask for commitment and next steps</p>
              </div>
            </div>
            {expandedStep === 7 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 7 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                    <Handshake size={14} /> Closing Techniques
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> "If everything looks good, when would you like to schedule the build?"</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> "We can reserve the materials and lock in the price for 30 days."</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> "We need a 50% deposit to start – would you like to do that today or send a check?"</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Offer a small incentive for signing within the week (e.g., upgraded railing).</li>
                  </ul>
                </div>
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <Lightbulb size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"Great, so we're agreed on the composite deck with built‑in bench, stairs, and lighting. I'll prepare the contract now. If you sign today, I can lock in the current material pricing and schedule you for early May. Sound good?"</p>
                  <p className="text-xs text-slate-500 mt-2">→ Be direct, assume the close.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 8 */}
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 overflow-hidden mb-8">
          <button
            onClick={() => toggleStep(8)}
            className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm shrink-0">8</div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Post-Sale & Project Management</h3>
                <p className="text-xs text-slate-400">Deliver a seamless experience and earn referrals</p>
              </div>
            </div>
            {expandedStep === 8 ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
          </button>
          {expandedStep === 8 && (
            <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                    <Calendar size={14} /> Execution Plan
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Schedule and share a detailed timeline.</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Send weekly progress updates with photos.</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Conduct a final walkthrough with the client.</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Provide maintenance guide and warranty certificate.</li>
                    <li className="flex items-start gap-2"><span className="text-emerald-400">•</span> Ask for a review and referral.</li>
                  </ul>
                </div>
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100/60">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                    <Star size={14} /> Real Example
                  </h4>
                  <p className="text-sm text-slate-700 mt-1 italic">"We'll start on May 3rd. I'll send you a weekly email with photos and progress updates. After we finish, we'll do a walkthrough together. I'll also leave you a deck maintenance guide and warranty info."</p>
                  <p className="text-xs text-slate-500 mt-2">→ Turn your client into a raving fan who refers others.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recap Checklist */}
        <section className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <CheckCircle size={20} className="text-emerald-600" />
            Sales Call Checklist
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "✓ Discovery questions prepared",
              "✓ Site visit scheduled",
              "✓ Measurements taken",
              "✓ Material samples ready",
              "✓ Proposal drafted with clear breakdown",
              "✓ 3D rendering or photos shown",
              "✓ Objections anticipated and practiced",
              "✓ Contract ready to sign",
              "✓ Post-sale follow-up plan in place"
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50/70 rounded-lg px-3 py-2 border border-slate-100/60">
                <span className="text-emerald-500">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Reference */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-6 rounded-2xl border border-amber-200/60 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Star size={24} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Pro Tip: Always Educate, Never Push</p>
              <p className="text-sm text-amber-700/80">Clients buy when they trust you and see the value. Use this guide to build confidence, not pressure. Every objection is a request for more information.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-8 text-center text-xs text-slate-400 py-8 border-t border-slate-200/60">
        <p>© 2024 OSR Pros • Sales Playbook • Deck Building</p>
        <p className="mt-1 text-[10px] text-slate-300">Follow each step to consistently close deck projects with confidence.</p>
      </footer>
    </div>
  );
}