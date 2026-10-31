/**
 * Shared pieces for the redesigned estimate pages (the new layout from the
 * design file: white cards on a cool background, Fraunces headings, Inter
 * body, one teal action colour). Presentation only: no data or handlers.
 */
import type { ReactNode } from "react";

/** A white bordered card with an optional heading row. */
export function DocCard({
  title,
  aside,
  children,
  className = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[#E2E5E0] bg-white p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-center gap-2">
          {title && <h2 className="font-[family-name:var(--font-doc-display)] text-base font-semibold text-[#1B2430]">{title}</h2>}
          {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small rounded status label. `tone` picks the colour pair. */
export function DocPill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "done" | "signed" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-[#EEF0EC] text-[#5B6675]",
    signed: "bg-[#E7F3F2] text-[#0B5F5E]",
    done: "bg-[#0B5F5E] text-white",
    warning: "bg-[#FDF0D5] text-[#8A4B0F]",
    danger: "bg-[#FDECEA] text-[#B42318]",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

/** The completed banner shown under the document title once a job is done. */
export function CompletedBanner({ text }: { text: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[#E7F3F2] px-3.5 py-2.5 text-sm font-semibold text-[#0B5F5E]">
      <span aria-hidden="true">&#10003;</span>
      <span>{text}</span>
    </div>
  );
}

/** Button styles used in the new action bars. */
export const DOC_BUTTON = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D0D5CD] bg-white px-3 text-sm font-medium text-[#1B2430] hover:bg-[#F4F5F2] disabled:opacity-50";
export const DOC_BUTTON_PRIMARY = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#1B2430] px-3.5 text-sm font-semibold text-white hover:bg-[#2B3644] disabled:opacity-50";
export const DOC_BUTTON_TEAL = "inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0E7C7B] px-3.5 text-sm font-semibold text-white hover:bg-[#0B6666] disabled:opacity-50";
export const DOC_BUTTON_DANGER = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#F1B5AE] bg-white px-3 text-sm font-medium text-[#B42318] hover:bg-[#FDECEA] disabled:opacity-50";
