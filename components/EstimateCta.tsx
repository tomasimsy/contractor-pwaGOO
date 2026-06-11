"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

const PHONE = "7043034112";

type EstimateCtaContextValue = {
  openModal: () => void;
};

const EstimateCtaContext = createContext<EstimateCtaContextValue | null>(null);

function buildSmsUrl(name: string, project: string) {
  const message = `Hi OSR Pros, my name is ${name}. I'm ready to start a ${project} project and would like a free estimate.`;
  return `sms:${PHONE}?body=${encodeURIComponent(message)}`;
}

export function EstimateCtaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [project, setProject] = useState("");

  const openModal = useCallback(() => setOpen(true), []);

  const closeModal = () => {
    setOpen(false);
    setName("");
    setProject("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !project.trim()) return;

    window.location.href = buildSmsUrl(name.trim(), project.trim());
    closeModal();
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <EstimateCtaContext.Provider value={{ openModal }}>
      {children}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md border border-white/10 bg-[#111111] p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-cta-title"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-amber-400/70">
                  Free Estimate
                </p>
                <h2
                  id="estimate-cta-title"
                  className="mt-2 text-xl font-light tracking-wide text-white"
                >
                  Tell us about your project
                </h2>
                <p className="mt-2 text-sm text-white/40">
                  We&apos;ll open your messages app with everything filled in.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-white/40 transition-colors hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <span className="mt-6 block h-px w-12 bg-gradient-to-r from-amber-500/60 to-transparent" />

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="estimate-name"
                  className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40"
                >
                  Your Name
                </label>
                <input
                  id="estimate-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="mt-2 w-full border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none transition-colors focus:border-amber-500/50"
                />
              </div>

              <div>
                <label
                  htmlFor="estimate-project"
                  className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40"
                >
                  Project Name
                </label>
                <input
                  id="estimate-project"
                  type="text"
                  required
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="e.g. Kitchen renovation, bathroom remodel, deck build"
                  className="mt-2 w-full border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white placeholder:text-white/20 outline-none transition-colors focus:border-amber-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim() || !project.trim()}
                className="group relative w-full overflow-hidden bg-gradient-to-r from-amber-600 to-amber-700 px-8 py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-white transition-all hover:shadow-[0_8px_32px_rgba(180,83,9,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="relative z-10">Send Text Message</span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full group-disabled:hidden" />
              </button>
            </form>
          </div>
        </div>
      )}
    </EstimateCtaContext.Provider>
  );
}

export function EstimateCtaButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(EstimateCtaContext);
  if (!ctx) {
    throw new Error("EstimateCtaButton must be used inside EstimateCtaProvider");
  }

  return (
    <button type="button" onClick={ctx.openModal} className={className}>
      {children}
    </button>
  );
}