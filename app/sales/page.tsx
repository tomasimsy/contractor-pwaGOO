"use client";

import { useState, useMemo, useRef } from "react";
 import { Search, Copy, Check, ChevronDown, ChevronUp, Star, Bookmark, BookOpen, Share2, Filter, X, Target, FileText, MessageSquare, CheckCircle, AlertTriangle, BarChart3, Lightbulb, Users, Clock, Phone, Mail } from "lucide-react";

// Types
// Types (same as before, plus new ones for training)
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
                <Bookmark size={16} /> <a href="/sales/examples/deck" className="text-white hover:text-emerald-200">Sell a Deck Example</a>
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
           {/* ===== NEW: New Sales Rep Section ===== */}
      <section className="mt-12 bg-white rounded-2xl shadow-sm shadow-slate-200/50 border border-slate-200/60 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-100 rounded-xl text-emerald-700">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">🚀 New Sales Rep Onboarding</h2>
            <p className="text-sm text-slate-400">Master the sales process, practice key scenarios, and track your progress</p>
          </div>
        </div>

        {/* 1. Sales Process Overview */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <Target size={16} /> The 5-Step Sales Process
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { step: "Discovery", icon: <MessageSquare size={16} />, desc: "Uncover needs, pain points, and budget" },
              { step: "Presentation", icon: <FileText size={16} />, desc: "Show your solution and value proposition" },
              { step: "Objection Handling", icon: <AlertTriangle size={16} />, desc: "Address concerns with confidence" },
              { step: "Closing", icon: <CheckCircle size={16} />, desc: "Ask for commitment and next steps" },
              { step: "Follow-up", icon: <Phone size={16} />, desc: "Nurture until decision" }
            ].map((s, i) => (
              <div key={i} className="bg-gradient-to-br from-slate-50 to-white p-4 rounded-xl border border-slate-200/60 hover:border-emerald-200 transition-all">
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                  <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">0{i+1}</span>
                  {s.icon}
                  {s.step}
                </div>
                <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
{/* 1. Sales Process Overview with real example */}
<div className="mb-8">
  <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
    <Target size={16} /> The 5-Step Sales Process – Real Example: Building a Deck
  </h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    {[
      { 
        step: "Discovery", 
        icon: <MessageSquare size={16} />, 
        desc: "Uncover needs, pain points, budget",
        example: "Ask: 'What do you want to use the deck for? Entertaining? Kids play area? What's your budget range? Have you gotten other quotes?'"
      },
      { 
        step: "Presentation", 
        icon: <FileText size={16} />, 
        desc: "Show your solution and value proposition",
        example: "Present 3 deck options (pressure-treated, composite, premium) with material samples, design sketches, and a clear timeline."
      },
      { 
        step: "Objection Handling", 
        icon: <AlertTriangle size={16} />, 
        desc: "Address concerns with confidence",
        example: "Client says: 'Composite is too expensive.' Respond: 'I understand. Let's compare the 20-year cost – composite needs no staining or sealing, saving you $2K over time.'"
      },
      { 
        step: "Closing", 
        icon: <CheckCircle size={16} />, 
        desc: "Ask for commitment and next steps",
        example: "If everything looks good, when would you like to schedule the build? We can reserve materials and lock in this price for 30 days."
      },
      { 
        step: "Follow-up", 
        icon: <Phone size={16} />, 
        desc: "Nurture until decision",
        example: "Send an email recap of the meeting, attach the proposal, and call in 3 days to see if any questions came up. Offer to walk them through the timeline again."
      }
    ].map((s, i) => (
      <div key={i} className="bg-gradient-to-br from-slate-50 to-white p-4 rounded-xl border border-slate-200/60 hover:border-emerald-200 transition-all group">
        <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
          <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">0{i+1}</span>
          {s.icon}
          {s.step}
        </div>
        <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
        <div className="mt-2 p-2 bg-emerald-50/60 rounded-lg border border-emerald-100/40 text-[10px] text-slate-600 italic">
          <span className="font-bold text-emerald-700">💡 Example:</span> {s.example}
        </div>
      </div>
    ))}
  </div>
</div>
        {/* 2. Role-Play Scenarios */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <Users size={16} /> Role-Play Scenarios
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-amber-50 to-white p-4 rounded-xl border border-amber-200/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-600 text-xl">🎭</span>
                <span className="font-bold text-sm text-amber-800">The Price Shopper</span>
              </div>
              <p className="text-sm text-slate-600">"Your quote is 20% higher than another contractor."</p>
              <p className="text-xs text-slate-400 mt-1">Practice: Compare scope, materials, and warranty – not just price.</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-white p-4 rounded-xl border border-blue-200/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-600 text-xl">🎭</span>
                <span className="font-bold text-sm text-blue-800">The Indecisive Couple</span>
              </div>
              <p className="text-sm text-slate-600">"We need to think about it and talk to our kids."</p>
              <p className="text-xs text-slate-400 mt-1">Practice: Ask clarifying questions and offer a joint meeting.</p>
            </div>
            <div className="bg-gradient-to-br from-rose-50 to-white p-4 rounded-xl border border-rose-200/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-rose-600 text-xl">🎭</span>
                <span className="font-bold text-sm text-rose-800">The Skeptic</span>
              </div>
              <p className="text-sm text-slate-600">"How do I know you'll do quality work?"</p>
              <p className="text-xs text-slate-400 mt-1">Practice: Share portfolio, references, and warranty details.</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-white p-4 rounded-xl border border-emerald-200/60">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-emerald-600 text-xl">🎭</span>
                <span className="font-bold text-sm text-emerald-800">The Time-Bound Client</span>
              </div>
              <p className="text-sm text-slate-600">"We have a wedding in 3 months – can you guarantee completion?"</p>
              <p className="text-xs text-slate-400 mt-1">Practice: Set realistic expectations and communicate proactively.</p>
            </div>
          </div>
        </div>

        {/* 3. Script Templates */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <FileText size={16} /> Script Templates
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-2 mb-2">
                <Phone size={14} className="text-emerald-600" />
                <span className="font-bold text-xs text-slate-600">📞 Phone Call – Follow-up</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1 italic">
                <p>"Hi [Name], this is [Your Name] from [Company]. I'm following up on our recent conversation about your [project]. Have you had a chance to think it over?"</p>
                <p>"I wanted to make sure you have everything you need to make a confident decision. Do you have any questions I can help with?"</p>
              </div>
            </div>
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60">
              <div className="flex items-center gap-2 mb-2">
                <Mail size={14} className="text-emerald-600" />
                <span className="font-bold text-xs text-slate-600">✉️ Email – Proposal Follow-up</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1 italic">
                <p>"Subject: Your Remodeling Proposal – Next Steps"</p>
                <p>"Hi [Name], I've attached our detailed proposal and scope of work. I'd be happy to walk you through it line by line. Let's schedule a quick call to address any questions."</p>
              </div>
            </div>
            <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/60 sm:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-emerald-600" />
                <span className="font-bold text-xs text-slate-600">💬 SMS – Quick Check-in</span>
              </div>
              <div className="text-xs text-slate-500 space-y-1 italic">
                <p>"Hi [Name]! Just checking in – any thoughts on the proposal? I'm here if you have questions. No pressure, just want to make sure you're comfortable."</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. New Rep Checklist */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <CheckCircle size={16} /> First-Week Checklist
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              "✓ Memorize the top 5 most common objections",
              "✓ Practice your discovery questions with a mentor",
              "✓ Review at least 3 past project portfolios",
              "✓ Shadow a senior rep on 2 sales calls",
              "✓ Complete the company product & process training",
              "✓ Prepare your own 'Why Choose Us' pitch"
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-200/60">
                <span className="text-emerald-500 text-base">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Key Metrics to Track */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <BarChart3 size={16} /> Key Performance Metrics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Conversion Rate", value: "40%", desc: "Estimates → Signed Contracts" },
              { label: "Avg. Deal Size", value: "$35K", desc: "Average project value" },
              { label: "Avg. Sales Cycle", value: "21 days", desc: "From first contact to close" },
              { label: "Follow-up Rate", value: "90%", desc: "% of leads contacted within 24hrs" }
            ].map((m, i) => (
              <div key={i} className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 text-center">
                <div className="text-lg font-black text-emerald-700">{m.value}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{m.label}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Common Mistakes & Fixes */}
        <div>
          <h3 className="text-sm font-bold text-emerald-700 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> Common Mistakes & How to Avoid Them
          </h3>
          <div className="space-y-2">
            {[
              { mistake: "Talking too much about features instead of benefits", fix: "Focus on how each feature solves a problem" },
              { mistake: "Not asking enough questions", fix: "Use the discovery questions above – listen more than you talk" },
              { mistake: "Giving a discount without trade-offs", fix: "Offer value-adds or phased work instead of straight price cuts" },
              { mistake: "Forgetting to follow up", fix: "Set a calendar reminder for every lead within 2 days" },
              { mistake: "Sounding like a salesperson", fix: "Be a consultant – educate, don't persuade" }
            ].map((item, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white rounded-lg px-4 py-3 border border-slate-200/60 hover:border-amber-200 transition-all">
                <div className="flex items-center gap-2 text-sm text-slate-700 sm:w-1/2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <span className="font-medium">{item.mistake}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 sm:w-1/2">
                  <Lightbulb size={14} className="text-emerald-500 shrink-0" />
                  <span>{item.fix}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Reference Card */}
        <div className="mt-6 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-200/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Star size={20} className="text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-800">Quick Reference</p>
              <p className="text-xs text-emerald-600/80">Keep this playbook open during calls. Use the search bar above to find any objection instantly.</p>
            </div>
          </div>
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