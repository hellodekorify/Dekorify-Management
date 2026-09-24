"use client";

import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL_BASE =
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground shadow-sm transition-colors " +
  "placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, className, htmlFor, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted-strong">
          {label}
          {required && <span className="ml-0.5 text-negative">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] font-medium text-negative">{error}</p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, prefix, className, wrapperClassName, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const control = (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        className={cn(
          CONTROL_BASE,
          "h-9.5",
          prefix && "pl-11",
          error && "border-negative focus:border-negative focus:ring-negative/20",
          className,
        )}
        {...props}
      />
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={wrapperClassName}>
      {control}
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id, rows = 3, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  const control = (
    <textarea
      ref={ref}
      id={textareaId}
      rows={rows}
      required={required}
      className={cn(
        CONTROL_BASE,
        "resize-y py-2 leading-relaxed",
        error && "border-negative focus:border-negative focus:ring-negative/20",
        className,
      )}
      {...props}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={textareaId}>
      {control}
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, id, options, placeholder, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  const control = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        className={cn(
          CONTROL_BASE,
          "h-9.5 cursor-pointer appearance-none pr-9",
          error && "border-negative focus:border-negative focus:ring-negative/20",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={selectId}>
      {control}
    </Field>
  );
});

export function Checkbox({
  label,
  hint,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong text-brand accent-[var(--brand)] focus:ring-2 focus:ring-brand/20"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={checkboxId} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</p>}
      </div>
    </div>
  );
}
