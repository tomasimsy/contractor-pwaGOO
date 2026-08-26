import { Resend } from "resend";

/**
 * Lazy singleton — constructed on first use, not at module load, so
 * importing this file never throws in a context where RESEND_API_KEY
 * isn't set yet (build time, tests). The actual send call is where a
 * missing key should fail, with a message that says exactly what's
 * missing.
 */
let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set. Add it to your environment to send email.");
    }
    client = new Resend(apiKey);
  }
  return client;
}

/** Resend's own shared testing address — works with any API key, no
 * domain verification required, but has real deliverability limits
 * (rate-limited, may land in spam, cannot be used for production
 * customer email). DEV/TEST ONLY: getFromAddress below refuses to fall
 * back to this in production — onesquareroof.com is now a verified
 * Resend custom domain (DKIM at resend._domainkey, MX/SPF at the
 * rsend subdomain backed by Amazon SES), so a real address should
 * always be configured before anything ships. */
const DEV_SANDBOX_FROM_ADDRESS = "onboarding@resend.dev";

/** `preferred` is a specific document's own resolved company_email
 * (e.g. a Business Profile's address, already merged in by
 * lib/company.ts's mergeProfileOverrides) — used verbatim when set, so
 * a profile-A estimate sends from A's address and a profile-B one from
 * B's, with no other code change. Falls back to the single company-
 * wide EMAIL_FROM_ADDRESS when the caller has no per-document address
 * (no profile selected, or the profile didn't set an email) — exactly
 * today's behavior.
 *
 * IMPORTANT: Resend will only actually send from an address whose
 * DOMAIN is verified (SPF/DKIM) in the Resend dashboard — this
 * function cannot make an unverified domain work. onesquareroof.com is
 * verified today; EMAIL_FROM_ADDRESS is the intended way to point
 * production at a real address on it, e.g.
 * "One Square Roofing <office@onesquareroof.com>" — two different
 * sending domains still mean two separate domain verifications in
 * Resend, done outside this codebase.
 *
 * In production, an unset `preferred` AND an unset EMAIL_FROM_ADDRESS
 * is a misconfiguration, not something to silently patch over with
 * Resend's shared sandbox address — sending real customer email from
 * onboarding@resend.dev is rate-limited and routinely lands in spam,
 * so that would be a bug shipped quietly, not a safe fallback. Only
 * outside production (local dev, tests, no NODE_ENV=production) does
 * this fall back to the sandbox address, so the app still runs without
 * every env var configured. */
export function getFromAddress(preferred?: string | null): string {
  if (preferred) return preferred;
  if (process.env.EMAIL_FROM_ADDRESS) return process.env.EMAIL_FROM_ADDRESS;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No From address configured: set EMAIL_FROM_ADDRESS (or a company/profile email) to a verified Resend sending address. Refusing to send production email from the Resend sandbox address."
    );
  }
  return DEV_SANDBOX_FROM_ADDRESS;
}

/**
 * The verified, intended production From/Reply-To for roofing
 * estimates sent under the One Square Roofing LLC brand specifically
 * (see sendEstimateEmail.ts's scoped override — every other estimate
 * type/profile is unaffected and keeps resolving through
 * getFromAddress above, unchanged). onesquareroof.com's Resend custom
 * domain was confirmed verified in the Resend dashboard before this
 * was wired in (DKIM + rsend MX/SPF, checked against live DNS).
 *
 * These are the DEFAULTS for that one scoped case — EMAIL_FROM_ADDRESS
 * / EMAIL_REPLY_TO still win when explicitly set, so rotating the
 * address later needs an env change, not a code change. */
export const ONE_SQUARE_ROOFING_FROM_ADDRESS = "One Square Roofing <office@onesquareroof.com>";
export const ONE_SQUARE_ROOFING_REPLY_TO = "office@onesquareroof.com";

/** Resend sends via SES, not through the office@ mailbox's own SMTP —
 * so nothing lands in that mailbox's "Sent" folder on its own. Bcc'ing
 * the mailbox on every send is the only way to get a copy INTO the
 * mailbox itself (Inbox, not Sent — IMAP has no way to fake that from
 * outside); EMAIL_BCC overrides this default the same way
 * EMAIL_FROM_ADDRESS/EMAIL_REPLY_TO do above. */
export const ONE_SQUARE_ROOFING_BCC = "office@onesquareroof.com";
