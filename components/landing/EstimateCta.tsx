"use client";

/**
 * Ported from the previous app's components/LandingPage/EstimateCta.tsx
 * — same functionality verbatim: a modal collects name + project, then
 * hands off to the visitor's own SMS app via an `sms:` URI (no backend
 * call, no new table, nothing that touches this app's auth/database).
 * Only the visual treatment changed, for the new landing design.
 */
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
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#1C1410]/80 p-4 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md border-2 border-[#CB9A3E]/30 bg-[#1C1410] p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-cta-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-[family-name:var(--font-landing-mono)] text-[10px] font-bold uppercase tracking-[0.35em] text-[#CB9A3E]">
                  Free Estimate
                </p>
                <h2
                  id="estimate-cta-title"
                  className="mt-2 font-[family-name:var(--font-landing-display)] text-2xl font-semibold tracking-tight text-white"
                >
                  Tell us about your project
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  We&apos;ll open your messages app with everything filled in.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-white/40 transition-colors hover:text-[#CB9A3E]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-9 space-y-5">
              <div>
                <label
                  htmlFor="estimate-name"
                  className="font-[family-name:var(--font-landing-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
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
                  className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#CB9A3E]"
                />
              </div>

              <div>
                <label
                  htmlFor="estimate-project"
                  className="font-[family-name:var(--font-landing-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-white/50"
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
                  className="mt-2 w-full border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#CB9A3E]"
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim() || !project.trim()}
                className="w-full bg-[#CB9A3E] px-8 py-4 font-[family-name:var(--font-landing-mono)] text-[11px] font-bold uppercase tracking-[0.2em] text-[#1C1410] transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Send Text Message
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
