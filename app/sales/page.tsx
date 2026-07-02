"use client";

import { useState, useMemo, useRef } from "react";
import { Search, Copy, Check, ChevronDown, ChevronUp, Star, Bookmark, Share2, Filter, X, BookOpen } from "lucide-react";

// Types
type Objection = {
  id: string;
  title: string;
  icon: string;
  category: "price" | "trust" | "timing" | "quality" | "competition";
  impact: "high" | "medium" | "low";
  concern: string;
  questions: string[];
  response: string;
  evidence: string[];
  nextStep: string;
  relatedStory?: string;
  tags: string[];
};

const objections: Objection[] = [
  {
    id: "1",
    title: "Your price is too high",
    icon: "💰",
    category: "price",
    impact: "high",
    concern: "They're unsure the value justifies the investment.",
    questions: [
      "Can you share what's driving that concern?",
      "Are you comparing another proposal?",
      "What budget range were you expecting?"
    ],
    response: "I completely understand. Rather than being the cheapest option, we focus on quality workmanship, clear communication, durable materials, and minimizing surprises. Let's compare the proposals line by line so you can see exactly where the value lies.",
    evidence: [
      "Detailed scope of work documentation",
      "Material warranties and certifications",
      "Before/after photos of similar projects",
      "Verified customer reviews"
    ],
    nextStep: "Schedule a proposal review session where we walk through each line item together.",
    tags: ["pricing", "value", "negotiation"]
  },
  {
    id: "2",
    title: "We're getting more quotes",
    icon: "📊",
    category: "competition",
    impact: "medium",
    concern: "They want confidence they're making the right choice.",
    questions: [
      "How will you compare different companies?",
      "What's most important to you in a contractor?",
      "Have you seen similar work from other companies?"
    ],
    response: "I always encourage getting multiple quotes – it's smart. When you compare, look beyond just the price. Compare the scope of work, the materials being used, the warranty coverage, and our communication process. We're happy to help you evaluate.",
    evidence: [
      "Scope comparison checklist",
      "Material quality comparison guide",
      "Communication process overview"
    ],
    nextStep: "Offer to review competitors' proposals with them to highlight differences.",
    tags: ["comparison", "confidence", "differentiation"]
  },
  {
    id: "3",
    title: "We need to think about it",
    icon: "🤔",
    category: "timing",
    impact: "medium",
    concern: "They still have unanswered questions or doubts.",
    questions: [
      "What would you like to think through?",
      "Is there anything unclear about the proposal?",
      "What would make this decision easier?"
    ],
    response: "Take all the time you need. I'd rather you have every question answered than feel any pressure. What specific aspects would you like to explore further?",
    evidence: [
      "References from similar projects",
      "Detailed project timeline",
      "Payment flexibility options"
    ],
    nextStep: "Schedule a follow-up call in 2-3 days to address any new questions.",
    tags: ["decision", "follow-up", "consideration"]
  },
  {
    id: "4",
    title: "Maybe next year",
    icon: "📅",
    category: "timing",
    impact: "medium",
    concern: "Timing or budget concerns are holding them back.",
    questions: [
      "What makes next year a better fit?",
      "Is there a specific budget or timeline concern?",
      "What would need to change for you to move forward sooner?"
    ],
    response: "Waiting can make sense, but delaying can sometimes lead to larger issues. We've seen cases where minor problems escalate into costly repairs. Let's explore a phased approach that fits your timeline.",
    evidence: [
      "Examples of how delaying increased costs",
      "Phased project options",
      "Financing solutions"
    ],
    nextStep: "Offer a planning session to map out a timeline that works for them.",
    tags: ["timing", "budget", "delay"]
  },
  {
    id: "5",
    title: "We're not ready",
    icon: "🔄",
    category: "timing",
    impact: "low",
    concern: "They need more confidence and information.",
    questions: [
      "What would help you feel ready?",
      "Is there more information we can provide?",
      "What's the main thing holding you back?"
    ],
    response: "No pressure at all – I'm here to educate and inform. We can take this at whatever pace feels comfortable. What would be most helpful for you right now?",
    evidence: [
      "Educational resources",
      "Design inspiration gallery",
      "Step-by-step process guide"
    ],
    nextStep: "Stay in touch with periodic value-add content and check-ins.",
    tags: ["education", "comfort", "pace"]
  },
  {
    id: "6",
    title: "I need to talk to my spouse",
    icon: "💑",
    category: "trust",
    impact: "low",
    concern: "They need to make a shared decision.",
    questions: [
      "Would it help if we all met together?",
      "What questions might your spouse have?",
      "Can I provide any additional materials for you to review together?"
    ],
    response: "That's completely understandable – this is a big decision that affects both of you. I'd be happy to schedule a joint meeting where we can answer both of your questions together.",
    evidence: [
      "Joint consultation process",
      "Decision-making checklist",
      "Family-friendly project planning"
    ],
    nextStep: "Schedule a meeting with both decision-makers present.",
    tags: ["decision", "family", "joint"]
  },
  {
    id: "7",
    title: "Can you lower the price?",
    icon: "💲",
    category: "price",
    impact: "high",
    concern: "They're seeking better value within their budget.",
    questions: [
      "Do you have a specific budget target?",
      "What's most important to you in this project?",
      "Are there areas where you'd consider alternative materials?"
    ],
    response: "Instead of lowering quality, let's discuss scope options. We can phase the work, use alternative materials, or adjust certain elements to meet your budget while maintaining quality where it matters most.",
    evidence: [
      "Phased project options",
      "Material upgrade/downgrade comparison",
      "Budget-friendly alternatives"
    ],
    nextStep: "Revise the scope with budget-conscious alternatives.",
    tags: ["budget", "negotiation", "flexibility"]
  },
  {
    id: "8",
    title: "Why should we choose your company?",
    icon: "🏆",
    category: "competition",
    impact: "high",
    concern: "They need to reduce risk and feel confident.",
    questions: [
      "What's most important to you in a contractor?",
      "What would make you feel confident in your choice?",
      "Have you had any concerns about other contractors?"
    ],
    response: "We prioritize communication, craftsmanship, and transparency. We're not just building a project – we're building a relationship. Our process is designed to eliminate surprises and keep you informed every step of the way.",
    evidence: [
      "Verified reviews and testimonials",
      "Portfolio of similar projects",
      "Warranty and support guarantees",
      "Accreditations and certifications"
    ],
    nextStep: "Share portfolio and references from similar projects.",
    tags: ["differentiation", "trust", "quality"]
  },
  {
    id: "9",
    title: "How long will the project take?",
    icon: "⏱️",
    category: "quality",
    impact: "medium",
    concern: "They need to plan their lives around the project.",
    questions: [
      "Do you have a specific deadline or event in mind?",
      "What's your availability during the project?",
      "Are there any key dates we should work around?"
    ],
    response: "We'll provide a realistic schedule and keep you informed throughout. We build in buffer time for unexpected discoveries and communicate proactively about any changes.",
    evidence: [
      "Sample project timeline",
      "Daily update process",
      "Milestone communication plan"
    ],
    nextStep: "Review milestones and daily workflow together.",
    tags: ["timeline", "schedule", "planning"]
  },
  {
    id: "10",
    title: "I'm worried about disruption",
    icon: "🏠",
    category: "quality",
    impact: "medium",
    concern: "They're concerned about their daily life being impacted.",
    questions: [
      "What concerns you most about the disruption?",
      "Do you work from home or have special needs?",
      "What would make you most comfortable during the project?"
    ],
    response: "We understand this is your home. We protect your spaces, maintain clean work areas, and clean up daily. We'll work with you to minimize disruption to your routine.",
    evidence: [
      "Dust protection systems",
      "Daily cleanup process",
      "Flexible working hours",
      "Client comfort checklist"
    ],
    nextStep: "Explain the detailed workflow and protection measures.",
    tags: ["disruption", "comfort", "cleanliness"]
  },
  {
    id: "11",
    title: "What if something goes wrong?",
    icon: "⚠️",
    category: "trust",
    impact: "high",
    concern: "They're afraid of the unknown and potential risks.",
    questions: [
      "What worries you most about potential issues?",
      "Have you had bad experiences before?",
      "What would make you feel protected?"
    ],
    response: "We communicate quickly and resolve issues professionally. Our warranty and support process is designed to give you peace of mind. We stand behind our work.",
    evidence: [
      "Warranty details",
      "Issue resolution process",
      "Customer support contacts",
      "Post-project follow-up process"
    ],
    nextStep: "Review the warranty and issue resolution process in detail.",
    tags: ["risk", "warranty", "support"]
  },
  {
    id: "12",
    title: "How do I know the work will be high quality?",
    icon: "✨",
    category: "quality",
    impact: "high",
    concern: "They need proof of quality and craftsmanship.",
    questions: [
      "What does quality mean to you?",
      "What would you consider a successful outcome?",
      "What's most important to you in the final result?"
    ],
    response: "We'll show you similar projects and connect you with references who can speak to our quality. We take pride in our work and it shows in the details.",
    evidence: [
      "Project portfolio",
      "Client references and reviews",
      "Quality inspection process",
      "Attention to detail examples"
    ],
    nextStep: "Share a curated portfolio and arrange reference calls.",
    tags: ["quality", "proof", "craftsmanship"]
  },
  {
    id: "13",
    title: "We've had a bad contractor before",
    icon: "😔",
    category: "trust",
    impact: "high",
    concern: "They have trust issues from past experiences.",
    questions: [
      "What happened with your previous contractor?",
      "What would have made that experience better?",
      "What assurances would help you feel comfortable?"
    ],
    response: "I'm sorry you had that experience. We'll explain our communication process so there are no surprises. We value transparency and accountability – we'll earn your trust through our actions.",
    evidence: [
      "Communication process overview",
      "Project management system",
      "Regular progress updates",
      "Issue prevention strategies"
    ],
    nextStep: "Walk through the entire process step by step to build confidence.",
    tags: ["trust", "communication", "accountability"]
  }
];

const categories = [
  { id: "all", label: "All Objections", icon: "📋" },
  { id: "price", label: "Price", icon: "💰" },
  { id: "trust", label: "Trust", icon: "🤝" },
  { id: "timing", label: "Timing", icon: "⏰" },
  { id: "quality", label: "Quality", icon: "✨" },
  { id: "competition", label: "Competition", icon: "🏆" }
];

const impactColors = {
  high: "bg-rose-100 text-rose-700 border-rose-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-emerald-100 text-emerald-700 border-emerald-200"
};

export default function SalesPlaybook() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredObjections = useMemo(() => {
    return objections.filter(obj => {
      const matchesSearch = obj.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.response.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === "all" || obj.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    if (searchRef.current) searchRef.current.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-800 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 mb-4 border border-white/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">🎯 Sales Enablement</span>
              <span className="w-1 h-1 rounded-full bg-emerald-300/50" />
              <span className="text-[10px] font-medium text-emerald-200">{objections.length} Objections</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight">
              Remodeling Sales <br className="sm:hidden" />
              <span className="bg-gradient-to-r from-emerald-200 to-teal-100 bg-clip-text text-transparent">Objection Playbook</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-emerald-100/80 max-w-2xl leading-relaxed">
              Professional, empathetic responses to help homeowners make informed decisions with confidence.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl border border-white/10 text-sm font-medium text-white transition-all duration-200">
                <Bookmark size={16} /> Save Playbook
              </button>
              <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 rounded-xl border border-white/10 text-sm font-medium text-white transition-all duration-200">
                <BookOpen size={16} /> <a href="/sales/simple" className="text-white hover:text-emerald-200">View Simple Version</a>
              </button>
            </div>
          </div>
        </div>
        {/* Decorative wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 60V40C240 20 480 30 720 35C960 40 1200 25 1440 35V60H0Z" fill="#f8fafc" fillOpacity="0.95" />
          </svg>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-2 relative z-10">
        {/* Search & Filters */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-200/60 p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search objections, responses, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50/80 border border-slate-200/60 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 focus:bg-white transition-all duration-200"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl border border-slate-200/60 text-sm font-medium text-slate-600 transition-all duration-200"
              >
                <Filter size={16} />
                <span className="hidden sm:inline">Filters</span>
                {selectedCategory !== "all" && (
                  <span className="ml-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">1</span>
                )}
              </button>
            </div>
          </div>

          {/* Filter pills */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200/60 animate-in slide-in-from-top-2 duration-200">
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      selectedCategory === cat.id
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                        : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
                {selectedCategory !== "all" && (
                  <button
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200"
                  >
                    <X size={12} /> Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="mt-3 text-xs text-slate-400">
            {filteredObjections.length === 0 ? (
              <span>No objections found matching your search.</span>
            ) : (
              <span>Showing <strong className="text-slate-600">{filteredObjections.length}</strong> of <strong className="text-slate-600">{objections.length}</strong> objections</span>
            )}
          </div>
        </div>

        {/* Objections Grid */}
        <div className="space-y-4">
          {filteredObjections.map((obj, index) => (
            <div
              key={obj.id}
              className="group bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 hover:shadow-md hover:border-slate-300/80 transition-all duration-300 overflow-hidden"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Header - always visible */}
              <button
                onClick={() => toggleExpand(obj.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors duration-200"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-2xl shrink-0">{obj.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{obj.title}</h3>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${impactColors[obj.impact]}`}>
                        {obj.impact}
                      </span>
                      <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                        {categories.find(c => c.id === obj.category)?.label || obj.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-md">{obj.concern}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {expandedId === obj.id ? (
                    <ChevronUp size={18} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={18} className="text-slate-400" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {expandedId === obj.id && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-100/80 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1.5">
                          <span>🎯</span> What they're really concerned about
                        </h4>
                        <p className="text-sm text-slate-600 leading-relaxed">{obj.concern}</p>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1.5">
                          <span>💬</span> Questions to Ask
                        </h4>
                        <ul className="space-y-1">
                          {obj.questions.map((q, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                              <span className="text-emerald-400 text-xs mt-0.5">▸</span>
                              <span>"{q}"</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1.5">
                          <span>✨</span> Suggested Response
                        </h4>
                        <div className="relative bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-100/60">
                          <blockquote className="text-sm text-slate-700 leading-relaxed italic">
                            "{obj.response}"
                          </blockquote>
                          <button
                            onClick={() => copyToClipboard(obj.response, obj.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-100/50 transition-all duration-200"
                            title="Copy response"
                          >
                            {copiedId === obj.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1.5">
                            <span>📎</span> Supporting Evidence
                          </h4>
                          <ul className="space-y-0.5">
                            {obj.evidence.map((e, i) => (
                              <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                                <span className="text-emerald-300">•</span>
                                <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1.5">
                            <span>📌</span> Next Step
                          </h4>
                          <p className="text-sm text-slate-600 leading-relaxed">{obj.nextStep}</p>
                          {obj.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {obj.tags.map((tag, i) => (
                                <span key={i} className="text-[8px] font-medium text-slate-400 bg-slate-100/80 px-1.5 py-0.5 rounded-full">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {filteredObjections.length === 0 && (
            <div className="text-center py-16 bg-white/60 rounded-2xl border border-slate-200/60">
              <span className="text-4xl block mb-3">🔍</span>
              <h3 className="text-lg font-semibold text-slate-700">No objections found</h3>
              <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
              <button onClick={clearFilters} className="mt-4 text-sm text-emerald-600 hover:text-emerald-700 font-medium underline-offset-2 hover:underline">
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Trust Stories Section */}
        <section className="mt-12 bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="text-2xl">🌟</span> Trust-Building Stories
            </h2>
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100/60">
              Real Examples
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              "A homeowner chose us because our proposal clearly explained every step and eliminated surprises.",
              "We found hidden water damage, documented it with photos, explained options, and fixed it correctly before continuing.",
              "Despite material delays, proactive communication kept the project on schedule.",
              "A client who had a poor contractor experience appreciated our detailed timeline and regular updates.",
              "We honored a warranty request promptly, reinforcing our commitment after project completion.",
              "Our transparent pricing and scope breakdown helped a client confidently choose us over lower-priced competitors."
            ].map((story, i) => (
              <div key={i} className="bg-gradient-to-br from-slate-50 to-white p-4 rounded-xl border border-slate-200/60 hover:border-emerald-200/60 hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 text-lg mt-0.5">▸</span>
                  <p className="text-sm text-slate-600 leading-relaxed">{story}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Discovery Questions */}
        <section className="mt-6 bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <span className="text-2xl">🔍</span> Discovery Questions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "What inspired this project?",
              "What problem would you most like this remodel to solve?",
              "What's most important when choosing a contractor?",
              "Have you remodeled before? What would you change?",
              "What does success look like for this project?",
              "What's your timeline and budget comfort level?",
              "Are there any specific materials or styles you prefer?",
              "What's the main goal of this renovation?"
            ].map((q, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50/70 rounded-lg px-3.5 py-2.5 border border-slate-100/60">
                <span className="text-emerald-400 text-xs">✦</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Value Reinforcement */}
        <section className="mt-6 bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
            <span className="text-2xl">💎</span> Reinforcing Value
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              "Explain long-term savings from quality workmanship",
              "Highlight everything included in the proposal",
              "Show similar completed projects",
              "Walk through your communication process",
              "Offer phased options instead of reducing quality",
              "Share warranty and post-project support details"
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-gradient-to-r from-emerald-50/50 to-slate-50/50 rounded-lg px-3.5 py-2.5 border border-emerald-100/40">
                <span className="text-emerald-500 text-base">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Closing Questions */}
        <section className="mt-6 bg-gradient-to-br from-emerald-900 to-teal-900 rounded-2xl p-6 text-white">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <span className="text-2xl">🤝</span> Pressure-Free Closing Questions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "How do you feel about the plan so far?",
              "What would help you feel more confident?",
              "Have we answered your biggest concerns?",
              "If everything meets your goals, when would you ideally like to begin?",
              "Would reviewing the proposal together be helpful?",
              "What's the most important factor in your decision?"
            ].map((q, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-emerald-100/90 bg-white/5 backdrop-blur-sm rounded-lg px-3.5 py-2.5 border border-white/10">
                <span className="text-emerald-300 text-xs">✦</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-slate-400 py-8 border-t border-slate-200/60">
        <p>© 2024 Remodeling Sales Playbook • Built for OSR Pros</p>
        <p className="mt-1 text-[10px] text-slate-300">{objections.length} objections • {categories.length - 1} categories • Updated daily</p>
      </footer>
    </div>
  );
}