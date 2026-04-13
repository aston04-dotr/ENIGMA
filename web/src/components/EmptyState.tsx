"use client";

type Props = {
  title: string;
  subtitle?: string;
};

export function EmptyState({ title, subtitle }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div
        className="mb-8 flex h-[72px] w-[72px] items-center justify-center rounded-card border border-line bg-elevated shadow-soft"
        aria-hidden
      >
        <svg
          className="h-9 w-9 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.25}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364l-1.414 1.414M7.05 7.05 5.636 5.636m12.728 12.728-1.414-1.414M7.05 16.95l-1.414 1.414M16.95 7.05l1.414-1.414M7.05 7.05 5.636 5.636"
          />
        </svg>
      </div>
      <p className="text-lg font-semibold tracking-tight text-fg">{title}</p>
      {subtitle ? <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted">{subtitle}</p> : null}
    </div>
  );
}
