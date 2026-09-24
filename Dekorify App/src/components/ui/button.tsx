"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-hover active:bg-brand-hover disabled:bg-brand/50",
  secondary:
    "bg-surface text-foreground border border-border-strong shadow-sm hover:bg-surface-muted active:bg-surface-muted",
  outline:
    "bg-transparent text-foreground border border-border-strong hover:bg-surface-muted active:bg-surface-muted",
  ghost: "bg-transparent text-muted-strong hover:bg-surface-muted hover:text-foreground",
  subtle: "bg-brand-soft text-brand border border-brand-border hover:bg-brand-soft/70",
  danger: "bg-negative text-white shadow-sm hover:bg-negative/90 disabled:bg-negative/50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9.5 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-60";

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/** A link styled as a button — never nest an anchor inside a real <button>. */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
