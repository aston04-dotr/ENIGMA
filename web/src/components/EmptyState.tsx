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
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div
        className="mb-6 flex h-[70px] w-[70px] items-center justify-center rounded-2xl border border-line/80 bg-elevated/95 shadow-[0_10px_26px_rgba(0,0,0,0.14)]"
        aria-hidden
      >
        <span className="text-[28px]">🗂️</span>
      </div>
      <p className="text-xl font-semibold tracking-tight text-fg">{title}</p>
      {subtitle ? <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="pressable mt-6 inline-flex min-h-[42px] items-center justify-center rounded-xl border border-line/80 bg-elevated px-4 py-2 text-sm font-semibold text-fg transition-all duration-200 ease-out hover:bg-elev-2"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
