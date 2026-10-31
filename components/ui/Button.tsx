/**
 * Shared button for the app. Four variants, one size, taken from the
 * estimate design: small outlined buttons, a dark primary for the main
 * edit action, a tinted teal for "complete", and a red outline for delete.
 *
 * Use `buttonClass()` on a <Link> or <span> that needs the same look.
 */
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger";

const BASE =
  "inline-flex h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border border-[#1B2430] bg-[#1B2430] font-semibold text-white hover:bg-[#2B3644]",
  secondary: "border border-[#D0D5CD] bg-white text-[#1B2430] hover:bg-[#F4F5F2]",
  success: "border border-[#0E7C7B] bg-[#E7F3F2] font-semibold text-[#0B5F5E] hover:bg-[#D6ECEB]",
  danger: "border border-[#F1B5AE] bg-white text-[#B42318] hover:bg-[#FDECEA]",
};

/** Class string for a button look on a non-button element (e.g. a Link). */
export function buttonClass(variant: ButtonVariant = "secondary", className?: string) {
  return cn(BASE, VARIANTS[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  function Button({ variant = "secondary", className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={buttonClass(variant, className)} {...props} />;
  },
);
