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
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimate-cta-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#4B6B4F]">
                  Free Estimate
                </p>
                <h2
                  id="estimate-cta-title"
                  className="mt-2 font-[family-name:var(--font-landing-display)] text-2xl font-medium tracking-tight text-[#26231F]"
                >
                  Tell us about your project
                </h2>
                <p className="mt-2 text-sm text-[#6E6659]">
                  We&apos;ll open your messages app with everything filled in.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-[#6E6659]/60 transition-colors hover:text-[#26231F]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="estimate-name"
                  className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6E6659]"
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
                  className="mt-2 w-full rounded-lg border border-black/10 bg-[#FAF6EF] px-4 py-3 text-sm text-[#26231F] placeholder:text-[#6E6659]/50 outline-none transition-colors focus:border-[#4B6B4F]"
                />
              </div>

              <div>
                <label
                  htmlFor="estimate-project"
                  className="text-xs font-semibold uppercase tracking-[0.1em] text-[#6E6659]"
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
                  className="mt-2 w-full rounded-lg border border-black/10 bg-[#FAF6EF] px-4 py-3 text-sm text-[#26231F] placeholder:text-[#6E6659]/50 outline-none transition-colors focus:border-[#4B6B4F]"
                />
              </div>

              <button
                type="submit"
                disabled={!name.trim() || !project.trim()}
                className="w-full rounded-full bg-[#4B6B4F] px-8 py-4 text-sm font-semibold text-white transition-colors hover:bg-[#3A5540] disabled:cursor-not-allowed disabled:opacity-40"
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
