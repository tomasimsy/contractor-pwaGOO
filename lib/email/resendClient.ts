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
 * customer email). Used as the default until EMAIL_FROM_ADDRESS is
 * set to a verified sending domain. */
export const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

export function getFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
}
