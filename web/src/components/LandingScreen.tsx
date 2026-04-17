"use client";

import Link from "next/link";

export function LandingScreen({ minimal = false }: { minimal?: boolean }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0f14] px-6">
      <div className="landing-glow pointer-events-none absolute h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(139,95,255,0.28)_0%,rgba(34,211,238,0.12)_38%,rgba(11,15,20,0)_72%)] blur-2xl" />
      <div className="landing-content relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <h1 className="landing-logo bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] bg-clip-text text-[54px] font-extrabold uppercase leading-none tracking-[0.35em] text-transparent sm:text-[64px]">
          ENIGMA
        </h1>
        {!minimal && (
          <>
            <p className="landing-subtitle mt-5 text-sm font-medium tracking-[0.08em] text-[#95a1ad]">Объявления нового уровня</p>
            <Link
              href="/login"
              prefetch
              className="landing-button pressable mt-10 inline-flex min-h-[56px] min-w-[220px] items-center justify-center rounded-[18px] bg-gradient-to-r from-[#8B5FFF] via-[#7B4FE8] to-[#22d3ee] px-8 text-base font-extrabold text-white shadow-[0_14px_40px_rgba(139,92,246,0.42)] transition-transform duration-200 hover:scale-[1.04] active:scale-[0.98]"
            >
              Войти
            </Link>
          </>
        )}
      </div>
      <style jsx>{`
        .landing-logo {
          animation: landing-entry 300ms ease-out 0ms both;
        }

        .landing-subtitle {
          animation: landing-entry 300ms ease-out 150ms both;
        }

        .landing-button {
          animation: landing-button-entry 350ms cubic-bezier(0.2, 0.8, 0.2, 1) 300ms both;
        }

        .landing-glow {
          animation: landing-glow-pulse 2.5s ease-in-out infinite;
        }

        .landing-content {
          animation: landing-float 4s ease-in-out infinite;
        }

        @keyframes landing-entry {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes landing-button-entry {
          from {
            opacity: 0;
            transform: translateY(6px) scale(0.96);
          }
          70% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes landing-glow-pulse {
          0%,
          100% {
            opacity: 0.2;
          }
          50% {
            opacity: 0.35;
          }
        }

        @keyframes landing-float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }
      `}</style>
    </main>
  );
}
