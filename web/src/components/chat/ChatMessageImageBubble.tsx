"use client";

import type { MessageRow } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

const SMOOTH_MS = 120;
const FADE_OUT_DELAY_MS = 150;
const BAR_FADE_MS = 200;

function useSmoothedTarget(target: number | undefined): number {
  const [display, setDisplay] = useState(0);
  const rafId = useRef(0);
  const displayRef = useRef(0);
  const fromRef = useRef(0);
  const startT = useRef(0);
  const goal = useRef(0);

  useEffect(() => {
    if (target === undefined) {
      if (displayRef.current !== 0) {
        setDisplay(0);
        displayRef.current = 0;
      }
      return;
    }
    if (Number.isNaN(target)) {
      return;
    }
    fromRef.current = displayRef.current;
    goal.current = target;
    startT.current = performance.now();
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
    }
    const tick = (now: number) => {
      const t = Math.min(1, (now - startT.current) / SMOOTH_MS);
      const ease = 1 - (1 - t) * (1 - t);
      const v = fromRef.current + (goal.current - fromRef.current) * ease;
      setDisplay(v);
      displayRef.current = v;
      if (t < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, [target]);

  return target === undefined ? 0 : display;
}

const TRANSITION = "duration-300";

type BarPhase = "off" | "on" | "fading";

function ChatMessageImageSkeleton() {
  return (
    <div
      className="absolute inset-0 bg-gradient-to-br from-fg/10 via-fg/5 to-fg/15 dark:from-fg/15 dark:via-fg/8 dark:to-fg/20"
      aria-hidden
    />
  );
}

type Props = {
  message: MessageRow;
  onOpen: () => void;
  onRetry: () => void;
  isRetrying?: boolean;
  canRetryFile?: boolean;
};

/**
 * Скелетон, плавный прогресс, blur-up, failed + retry, haptic.
 */
export function ChatMessageImageBubble({
  message,
  onOpen,
  onRetry,
  isRetrying = false,
  canRetryFile = false,
}: Props) {
  const {
    image_url,
    pendingUpload,
    imageUploadFailed,
    imageUploadProgress,
    imageAspectRatio,
  } = message;
  const url = image_url ?? "";
  const [imageReady, setImageReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [barPhase, setBarPhase] = useState<BarPhase>("off");
  const fadeScheduled = useRef(false);
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raw =
    typeof imageUploadProgress === "number" && pendingUpload
      ? imageUploadProgress
      : undefined;
  const smoothW = useSmoothedTarget(raw);
  const smoothRef = useRef(0);
  useEffect(() => {
    smoothRef.current = smoothW;
  }, [smoothW]);

  useEffect(() => {
    setImageReady(false);
    setLoadError(false);
  }, [url]);

  useEffect(() => {
    setBarPhase("off");
    fadeScheduled.current = false;
    if (fadeOutTimer.current) {
      clearTimeout(fadeOutTimer.current);
      fadeOutTimer.current = null;
    }
  }, [message.id]);

  useEffect(() => {
    if (raw !== undefined && pendingUpload) {
      setBarPhase((b) => (b === "off" ? "on" : b));
    }
  }, [raw, pendingUpload, message.id]);

  useEffect(() => {
    if (!pendingUpload) {
      setBarPhase("off");
    }
  }, [pendingUpload]);

  useEffect(() => {
    if (raw !== 100 || !pendingUpload || barPhase !== "on") {
      if (raw !== 100 || !pendingUpload) {
        fadeScheduled.current = false;
      }
      return;
    }
    if (smoothW < 99) {
      return;
    }
    if (fadeScheduled.current) {
      return;
    }
    fadeScheduled.current = true;
    fadeOutTimer.current = setTimeout(() => {
      setBarPhase("fading");
      fadeOutTimer.current = null;
    }, FADE_OUT_DELAY_MS);
    return () => {
      if (fadeOutTimer.current) {
        clearTimeout(fadeOutTimer.current);
        fadeOutTimer.current = null;
      }
    };
  }, [raw, smoothW, pendingUpload, barPhase]);

  const onBarFadeEnd = useCallback(() => {
    if (barPhase === "fading") {
      setBarPhase("off");
    }
  }, [barPhase]);

  const onImgLoad = useCallback(() => {
    setImageReady(true);
  }, []);
  const onImgError = useCallback(() => {
    setLoadError(true);
  }, []);

  const hapticAndOpen = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(6);
      } catch {
        /* noop */
      }
    }
    onOpen();
  }, [onOpen]);

  if (!url) {
    return null;
  }

  const aspect = imageAspectRatio ?? 4 / 3;
  const showBar =
    (barPhase === "on" || barPhase === "fading") &&
    pendingUpload &&
    typeof imageUploadProgress === "number" &&
    imageUploadProgress <= 100;

  if (imageUploadFailed) {
    return (
      <div
        className="relative w-full max-w-[280px] overflow-hidden rounded-inherit"
        style={{ aspectRatio: String(aspect), maxHeight: "min(50vh, 360px)" }}
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-3">
          <p className="text-center text-xs font-medium text-white/95">
            Не отправлено
          </p>
          {isRetrying ? (
            <p className="text-center text-[11px] text-white/80">
              Повторная отправка…
            </p>
          ) : null}
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className="pressable min-w-[6rem] rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-fg shadow-soft disabled:opacity-60"
          >
            {isRetrying ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-fg/30 border-t-fg"
                  aria-hidden
                />
                …
              </span>
            ) : (
              "Повторить"
            )}
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="flex w-full min-h-[120px] max-w-[280px] flex-col items-center justify-center gap-2 overflow-hidden rounded-inherit border border-dashed border-line/80 bg-elev-2/50 px-3 py-4"
        style={{ aspectRatio: String(aspect), maxHeight: "min(50vh, 360px)" }}
      >
        <p className="text-center text-xs text-muted">
          Не удалось загрузить изображение
        </p>
        {isRetrying ? (
          <p className="text-center text-[11px] text-muted">
            Повторная отправка…
          </p>
        ) : null}
        {canRetryFile ? (
          <button
            type="button"
            disabled={isRetrying}
            onClick={onRetry}
            className="pressable text-xs font-semibold text-accent disabled:opacity-50"
          >
            {isRetrying ? "Загрузка…" : "Повторить"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label="Открыть фото"
      onClick={hapticAndOpen}
      className="pressable relative block w-full max-w-[280px] origin-center border-0 bg-black/5 p-0 active:scale-[0.98] active:opacity-90 transition-[transform,opacity] duration-100"
    >
      <div
        className="relative w-full max-w-[280px] overflow-hidden rounded-inherit"
        style={{ aspectRatio: String(aspect), maxHeight: "min(50vh, 360px)" }}
      >
        {!imageReady ? <ChatMessageImageSkeleton /> : null}
        {pendingUpload ? (
          <div
            className="absolute inset-0 z-[1] flex items-center justify-center bg-black/20"
            aria-hidden
          >
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          </div>
        ) : null}
        {showBar ? (
          <div
            className={`absolute bottom-0 left-0 right-0 z-[2] h-1 bg-black/25 ease-out ${
              barPhase === "fading" ? "opacity-0" : "opacity-100"
            }`}
            style={{ transition: `opacity ${BAR_FADE_MS}ms ease-out` }}
            onTransitionEnd={onBarFadeEnd}
            aria-hidden
          >
            <div
              className="h-full origin-left bg-white/80"
              style={{
                width: `${Math.min(100, Math.max(0, smoothW))}%`,
                transition: "width 120ms ease-out",
              }}
            />
          </div>
        ) : null}
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={onImgLoad}
          onError={onImgError}
          className={
            "relative z-0 h-full w-full object-cover transition-[filter,opacity] " +
            TRANSITION +
            " ease-out " +
            (imageReady
              ? "opacity-100 [filter:blur(0px)]"
              : "opacity-70 [filter:blur(10px)]")
          }
        />
      </div>
    </button>
  );
}
