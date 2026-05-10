"use client";

import type { ReactNode } from "react";

const wrapCls =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center text-fg [&>svg]:h-[22px] [&>svg]:w-[22px] opacity-92";

/** Упрощённые premium-глифы (геометрия без претензии на товарный знак). Ключ совпадает с `logo_key`/slug марки. */
export function VehicleBrandGlyph({
  logoKey,
  slugFallback,
}: {
  logoKey?: string | null;
  slugFallback?: string | null;
}): ReactNode {
  const raw = String(logoKey ?? slugFallback ?? "").trim().toLowerCase();
  if (!raw) return <Fallback slug="?" />;
  const g = glyphs[raw];
  if (g) return <span className={wrapCls}>{g}</span>;
  return <Fallback slug={raw} />;
}

function Fallback({ slug }: { slug: string }) {
  const ch = slug.replace(/[^a-zA-ZА-Яа-я]/g, "").slice(0, 1).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`${wrapCls} rounded-lg border border-line/85 bg-gradient-to-br from-elev-2/90 to-transparent text-[10px] font-bold tracking-wide`}
    >
      {ch}
    </span>
  );
}

const glyphs: Record<string, ReactNode> = {
  audi: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="8" cy="16" r="5" stroke="currentColor" strokeWidth="2" opacity="0.95" />
      <circle cx="14" cy="16" r="5" stroke="currentColor" strokeWidth="2" opacity="0.95" />
      <circle cx="20" cy="16" r="5" stroke="currentColor" strokeWidth="2" opacity="0.95" />
      <circle cx="26" cy="16" r="5" stroke="currentColor" strokeWidth="2" opacity="0.95" />
    </svg>
  ),
  bmw: (
    <svg viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
      <path stroke="currentColor" strokeWidth="1.55" opacity="0.35" d="M16 3v26M5 16h22" />
      <path fill="currentColor" opacity="0.14" d="M16 16 29 3v13H16Zm0 0L3 29V16h13Zm0 0L29 29H16V16Zm0 0L3 3h13v13Z" />
    </svg>
  ),
  "mercedes-benz": (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.75" opacity="0.95" />
      <path stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" d="m16 5 7.2 21.8M16 5 8.8 26.8M16 26.8 25.4 26.8" opacity="0.95" />
    </svg>
  ),
  volkswagen: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2.1" opacity="0.95" />
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="m12 21 8-14M17 26l1.5-7M17 6 4.8 21" opacity="0.88" />
    </svg>
  ),
  porsche: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="2"
        d="m7 21 4-17h10l6 21H7Zm7-12 9 14"
        strokeLinejoin="round"
        opacity="0.93"
      />
    </svg>
  ),
  toyota: (
    <svg viewBox="0 0 32 32" aria-hidden fill="none">
      <ellipse cx="16" cy="12" rx="10" ry="6.5" stroke="currentColor" strokeWidth="1.95" opacity="0.95" />
      <ellipse cx="16" cy="19" rx="6.8" ry="11" stroke="currentColor" strokeWidth="2" opacity="0.92" />
    </svg>
  ),
  lexus: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" opacity="0.95" d="M8 21V9l8 13V9M18 21h7" />
    </svg>
  ),
  honda: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="2.05"
        d="m9 7 14 17M9 23V9m14 0v14"
        strokeLinecap="square"
        opacity="0.95"
      />
    </svg>
  ),
  nissan: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="12.25" stroke="currentColor" strokeWidth="2" opacity="0.93" />
      <path stroke="currentColor" strokeWidth="2" d="m11 9 14 17M21 23V9m-13 13h15" opacity="0.88" strokeLinecap="square" />
    </svg>
  ),
  mazda: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.95"
        d="m7 21 8-17 11 21M10 21h17"
        strokeLinejoin="round"
        opacity="0.93"
      />
    </svg>
  ),
  mitsubishi: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path stroke="currentColor" strokeWidth="2" d="m16 5 11 21H5Z" opacity="0.93" strokeLinejoin="round" />
    </svg>
  ),
  subaru: (
    <svg viewBox="0 0 32 32" aria-hidden fill="currentColor">
      <ellipse cx="16" cy="16" rx="12" ry="12" opacity="0.07" stroke="none" />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <circle
          key={deg}
          cx={16 + 6.5 * Math.cos((deg * Math.PI) / 180)}
          cy={16 + 6.5 * Math.sin((deg * Math.PI) / 180)}
          r="1.95"
          opacity="0.9"
        />
      ))}
      <circle cx="16" cy="16" r="3.1" opacity="0.22" stroke="none" />
    </svg>
  ),
  hyundai: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <ellipse cx="16" cy="16" rx="12.5" ry="9" stroke="currentColor" strokeWidth="2" opacity="0.93" />
      <path stroke="currentColor" strokeWidth="2" d="M11 21V9m10 12V9m-10 9h10M11 22h11" opacity="0.88" strokeLinecap="square" />
    </svg>
  ),
  kia: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <ellipse cx="16" cy="16" rx="12.5" ry="8.5" stroke="currentColor" strokeWidth="1.95" opacity="0.94" />
      <path stroke="currentColor" strokeWidth="2" d="M10 21V9m6 0v17m6-17v17" opacity="0.88" strokeLinecap="square" />
    </svg>
  ),
  genesis: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.85"
        d="m6 12 11-8 11 9M6 21h22M7 26l13-21 13 21"
        strokeLinecap="square"
        opacity="0.9"
      />
    </svg>
  ),
  ford: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <ellipse cx="16" cy="16" rx="13" ry="7.5" stroke="currentColor" strokeWidth="2" opacity="0.94" />
      <path fill="currentColor" opacity="0.18" d="M16 21c-7 0-10-6-10-5s4 10 10 10 12-11 11-13-11 8-11 8Z" />
    </svg>
  ),
  chevrolet: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.95">
      <path opacity="0.94" d="M8 14h14l-7-9v22l7-11H8z" strokeLinejoin="round" />
    </svg>
  ),
  jeep: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.75" strokeLinecap="square">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={7.2 + i * 3.1} x2={7.2 + i * 3.1} y1={9.4} y2={22.6} opacity="0.9" />
      ))}
    </svg>
  ),
  tesla: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor" strokeWidth="2">
      <path opacity="0.92" strokeLinecap="square" d="M16 5v18M7 9h18M8 24h16" />
    </svg>
  ),
  cadillac: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="1.85"
        d="m16 4 11 21H5Zm0 21V12m-11 13h22"
        strokeLinejoin="round"
        opacity="0.93"
      />
    </svg>
  ),
  "land-rover": (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden>
      <ellipse cx="16" cy="16" rx="13.2" ry="7.5" stroke="currentColor" strokeWidth="2" opacity="0.94" />
      <path stroke="currentColor" strokeWidth="2" opacity="0.55" d="M7 21h18M10 21v6m12-6v6" strokeLinecap="square" />
    </svg>
  ),
  jaguar: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor" strokeWidth="2">
      <circle cx="13" cy="14" r="5" opacity="0.93" />
      <path opacity="0.88" strokeLinecap="round" d="M18 9c5 8 13 21 13 21" />
    </svg>
  ),
  mini: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="1.95" opacity="0.92" strokeLinecap="square" d="M5 20h21M16 23V9M12 21l-5-15M21 21l5-14" />
    </svg>
  ),
  opel: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <circle cx="16" cy="16" r="13" strokeWidth="2" opacity="0.93" />
      <path strokeWidth="2" opacity="0.88" strokeLinecap="square" d="M16 4v21M23 21 9 7" />
    </svg>
  ),
  skoda: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="1.85" opacity="0.92" strokeLinecap="square" strokeLinejoin="round" d="M6 20h21M17 21 9 7l6 17 11-21" />
    </svg>
  ),
  volvo: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <circle cx="16" cy="16" r="13" strokeWidth="2" opacity="0.93" />
      <path strokeWidth="2" opacity="0.88" strokeLinecap="square" d="m11 21 5-17 6 22" />
    </svg>
  ),
  ferrari: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path opacity="0.92" d="M9 8h15l-2 8h6L11 28l3-10H8l1-10Z" />
    </svg>
  ),
  maserati: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.93" strokeLinecap="square" d="m7 26 14-21 13 21M10 26h21" strokeLinejoin="round" />
    </svg>
  ),
  fiat: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2.2" opacity="0.92" strokeLinecap="square" d="m10 26 13-21 13 21H10Z" />
    </svg>
  ),
  "alfa-romeo": (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <circle cx="16" cy="16" r="12.5" strokeWidth="1.95" opacity="0.93" />
      <path strokeWidth="2" opacity="0.78" strokeLinecap="square" d="m16 4v21M23 26l11-26" strokeLinejoin="round" />
    </svg>
  ),
  renault: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path
        strokeWidth="2"
        opacity="0.93"
        d="m16 4 12 21H4Z"
        strokeLinejoin="round"
      />
      <path strokeWidth="2" opacity="0.52" strokeLinecap="square" d="M16 14v10" />
    </svg>
  ),
  peugeot: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="1.95" opacity="0.92" d="M10 25V7l7 9 7-9v18" strokeLinecap="square" strokeLinejoin="round" />
    </svg>
  ),
  citroen: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.92" d="M16 4v24M7 9h18M7 23h18" strokeLinecap="square" />
    </svg>
  ),
  geely: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2.2" opacity="0.93" strokeLinecap="square" d="M10 25V7l12 9-12 9V7" />
    </svg>
  ),
  chery: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.92" strokeLinecap="square" d="M10 7h12v18H10zM16 7v18" />
    </svg>
  ),
  "great-wall": (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.9" strokeLinecap="square" d="M8 25V7h8l4 7 4-7h8v18" />
    </svg>
  ),
  byd: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.92" strokeLinecap="square" d="M8 12h16M8 20h16M12 8v16M20 8v16" />
    </svg>
  ),
  polestar: (
    <svg viewBox="0 0 32 32" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <path opacity="0.93" strokeLinejoin="round" d="m16 5 10 22H6Z" />
      <path opacity="0.35" d="M16 9v15" strokeLinecap="square" />
    </svg>
  ),
  lada: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.9" strokeLinecap="square" d="M7 25V7h11l7 7v11H7" strokeLinejoin="round" />
    </svg>
  ),
  uaz: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <rect x="6" y="10" width="20" height="11" rx="2" strokeWidth="2" opacity="0.9" />
      <path strokeWidth="2" opacity="0.88" d="M10 21v4m12-4v4" strokeLinecap="square" />
    </svg>
  ),
  gaz: (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden stroke="currentColor">
      <path strokeWidth="2" opacity="0.9" d="M6 22V10h8l4 5h8v7H6Z" strokeLinejoin="round" />
    </svg>
  ),
};
