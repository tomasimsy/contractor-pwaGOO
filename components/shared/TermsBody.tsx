/**
 * React rendering of parseTermsBody's output — the display-side twin
 * of lib/estimateTerms.ts's renderTermsBodyHtml (used by the PDF
 * route). Same parser, same three rules (blank line, `**heading**`,
 * `- `/`* ` bullets), so a company's typed text looks the same on
 * Estimate Detail, the customer portal, and in the generated PDF. No
 * "use client" — this is plain JSX, safe in the portal's server
 * component too.
 */
import { parseTermsBody } from "@/lib/estimateTerms";

export function TermsBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseTermsBody(body);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          // No color class here on purpose — inherits from `className`
          // above, so the same component reads right against both this
          // app's semantic tokens (EstimateDetail) and the portal's
          // plain gray palette, rather than fighting either one.
          return (
            <p key={i} className="mt-2.5 mb-1 font-semibold first:mt-0">
              {block.text}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="mt-1 list-disc space-y-0.5 pl-4">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="mt-1.5 first:mt-0">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
