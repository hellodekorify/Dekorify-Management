import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  filters,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border-subtle bg-surface", className)}>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-6 pb-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {filters && <div className="mt-5">{filters}</div>}
      </div>
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
