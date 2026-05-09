"use client";

import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionHref?: string;
};

export function EmptyState({ title, subtitle, actionLabel, actionHref }: Props) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-14 text-center">
      <div className="mb-5 h-px w-9 rounded-full bg-line/90" aria-hidden />
      <p className="max-w-[280px] text-[17px] font-semibold tracking-[-0.02em] leading-snug text-fg">{title}</p>
      {subtitle ? (
        <p className="mt-2 max-w-[300px] text-[13px] leading-relaxed text-muted/88">{subtitle}</p>
      ) : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="pressable mt-7 inline-flex min-h-[42px] items-center justify-center rounded-xl border border-line/75 bg-elevated px-4 py-2 text-[13px] font-semibold tracking-tight text-fg transition-colors duration-150 ease-out hover:bg-elev-2 active:scale-[0.985]"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
