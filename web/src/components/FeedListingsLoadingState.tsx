"use client";

/**
 * Дружелюбное состояние загрузки ленты (смена категории / аренда–продажа / серверные фильтры).
 * Без «ошибочного» пустого экрана; стиль — спокойный premium, не cartoon.
 */
export function FeedListingsLoadingState() {
  return (
    <div
      className="flex flex-col items-center justify-center px-8 py-16 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative mb-7 h-[76px] w-[128px]" aria-hidden>
        <div
          className="pointer-events-none absolute -inset-5 rounded-[40px] bg-[radial-gradient(ellipse_at_50%_55%,var(--enigma-glow-accent,rgba(84,169,255,0.12))_0%,transparent_68%)] opacity-90 dark:opacity-100"
        />
        <div className="pointer-events-none absolute inset-0 rounded-[22px] bg-gradient-to-br from-accent/[0.08] via-violet-500/[0.06] to-cyan-400/[0.07] blur-md" />
        <svg
          viewBox="0 0 128 76"
          className="relative z-[1] h-full w-full text-accent drop-shadow-[0_6px_18px_rgba(29,118,232,0.12)] dark:drop-shadow-[0_6px_22px_rgba(84,169,255,0.14)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10 58h108"
            className="stroke-current opacity-[0.22]"
            strokeWidth={1.25}
            strokeLinecap="round"
          />
          <g className="animate-enigma-feed-loader-vehicle">
            <rect
              x={18}
              y={28}
              width={44}
              height={30}
              rx={6}
              className="stroke-current opacity-[0.88]"
              strokeWidth={1.35}
            />
            <path
              d="M62 36h30l10 12v10H62V36z"
              className="stroke-current opacity-[0.88]"
              strokeWidth={1.35}
              strokeLinejoin="round"
            />
            <rect
              x={72}
              y={24}
              width={18}
              height={14}
              rx={3}
              className="fill-accent/[0.12] stroke-current opacity-[0.75]"
              strokeWidth={1.15}
            />
            <circle cx={36} cy={58} r={5.5} className="stroke-current opacity-[0.55]" strokeWidth={1.2} />
            <circle cx={88} cy={58} r={5.5} className="stroke-current opacity-[0.55]" strokeWidth={1.2} />
            <path
              d="M24 52h52"
              className="stroke-cyan-500/55 dark:stroke-cyan-300/40"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.65}
            />
          </g>
          <circle
            cx={104}
            cy={44}
            r={4}
            className="fill-violet-500/25 stroke-violet-500/55 dark:stroke-violet-400/45"
            strokeWidth={1}
          />
          <path
            d="M100 52c4 2 8 2 11 0"
            className="stroke-violet-500/35 dark:stroke-violet-400/30"
            strokeWidth={1}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="max-w-[300px] text-[17px] font-semibold tracking-[-0.02em] leading-snug text-fg">
        Подгружаем объявления…
      </p>
      <p className="mt-2.5 max-w-[300px] text-[13px] leading-relaxed text-muted/85">
        Сверяем карточки с актуальными фильтрами на сервере.
      </p>
    </div>
  );
}
