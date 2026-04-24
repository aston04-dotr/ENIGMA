"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const SWIPE_CLOSE = 100;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 32;
const BACKDROP_IN_MS = 200;
const ZOOM_TAP_MS = 200;

type Props = { url: string; onClose: () => void };

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Backdrop fade + blur, zoom, pinch, double-tap, свайп вниз.
 */
export function ChatImageLightbox({ url, onClose }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ty, setTy] = useState(0);
  const [isGesturing, setIsGesturing] = useState(false);
  const [backIn, setBackIn] = useState(false);
  const scaleRef = useRef(1);
  const dragYRef = useRef(0);
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(0);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    dist: number;
    startScale: number;
  } | null>(null);
  const oneStartRef = useRef<{ y: number } | null>(null);
  const tapZoomRaf = useRef(0);
  const [tapZooming, setTapZooming] = useState(false);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const clampScale = useCallback(() => {
    setScale((s) => {
      const c = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));
      return c;
    });
  }, []);

  const runDoubleTapZoom = useCallback(
    (from: number, to: number) => {
      if (tapZoomRaf.current) {
        cancelAnimationFrame(tapZoomRaf.current);
      }
      setTapZooming(true);
      setIsGesturing(false);
      const start = performance.now();
      const t0 = from;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ZOOM_TAP_MS);
        const ease = 1 - (1 - t) * (1 - t);
        const s = t0 + (to - t0) * ease;
        setScale(s);
        scaleRef.current = s;
        if (t < 1) {
          tapZoomRaf.current = requestAnimationFrame(step);
        } else {
          tapZoomRaf.current = 0;
          setTapZooming(false);
        }
      };
      tapZoomRaf.current = requestAnimationFrame(step);
    },
    [],
  );

  const reset = useCallback(() => {
    setScale(1);
    scaleRef.current = 1;
    setTy(0);
    dragYRef.current = 0;
    pinchRef.current = null;
    oneStartRef.current = null;
    lastTapRef.current = null;
    moveStartRef.current = null;
    movedRef.current = 0;
  }, []);

  useEffect(() => {
    reset();
  }, [url, reset]);

  useEffect(() => {
    setBackIn(false);
    const id = requestAnimationFrame(() => {
      setBackIn(true);
    });
    return () => cancelAnimationFrame(id);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const ob = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = ob;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tapZoomRaf.current) {
        cancelAnimationFrame(tapZoomRaf.current);
      }
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setIsGesturing(true);
      setScale((s) => {
        const delta = -e.deltaY * 0.0009;
        const next = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, s * (1 + delta * 3.5)),
        );
        if (next <= 1) {
          setTy(0);
        }
        return next;
      });
      setTimeout(() => {
        setIsGesturing(false);
        clampScale();
      }, 40);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [url, clampScale]);

  const onTouchStart = (e: React.TouchEvent) => {
    setIsGesturing(true);
    if (e.touches.length === 2) {
      oneStartRef.current = null;
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(
        a.clientX - b.clientX,
        a.clientY - b.clientY,
      );
      pinchRef.current = { dist: d, startScale: scaleRef.current };
      return;
    }
    if (e.touches.length === 1) {
      pinchRef.current = null;
      const t0 = e.touches[0];
      oneStartRef.current = { y: t0.clientY };
      moveStartRef.current = { x: t0.clientX, y: t0.clientY };
      movedRef.current = 0;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const p = pinchRef.current;
      if (p) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const d2 = Math.hypot(
          a.clientX - b.clientX,
          a.clientY - b.clientY,
        );
        if (d2 > 0 && p.dist > 0) {
          const r = d2 / p.dist;
          setScale(
            Math.min(
              MAX_ZOOM,
              Math.max(MIN_ZOOM, p.startScale * r),
            ),
          );
        }
      }
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1 && oneStartRef.current) {
      const t0 = e.touches[0];
      if (moveStartRef.current) {
        movedRef.current = dist(moveStartRef.current, {
          x: t0.clientX,
          y: t0.clientY,
        });
      }
      const dy = t0.clientY - oneStartRef.current.y;
      if (dy > 0) {
        dragYRef.current = dy;
        setTy(dy);
      } else {
        dragYRef.current = 0;
        setTy(0);
      }
      e.preventDefault();
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
      return;
    }

    const te = e.changedTouches[0];
    const now = Date.now();
    if (
      oneStartRef.current &&
      movedRef.current < 18 &&
      scaleRef.current <= 1.1
    ) {
      const p = { x: te.clientX, y: te.clientY };
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t < DOUBLE_TAP_MS &&
        dist(last, p) < DOUBLE_TAP_PX
      ) {
        const cur = scaleRef.current;
        const to = cur < 1.2 ? 1.5 : 1;
        setTy(0);
        lastTapRef.current = null;
        runDoubleTapZoom(cur, to);
        oneStartRef.current = null;
        pinchRef.current = null;
        moveStartRef.current = null;
        dragYRef.current = 0;
        setTy(0);
        return;
      }
      lastTapRef.current = { t: now, x: p.x, y: p.y };
    } else {
      if (oneStartRef.current) {
        if (
          dragYRef.current >= SWIPE_CLOSE &&
          scaleRef.current <= 1.05
        ) {
          onClose();
        }
      }
    }

    oneStartRef.current = null;
    pinchRef.current = null;
    moveStartRef.current = null;
    dragYRef.current = 0;
    setTy(0);
    setIsGesturing(false);
    setTimeout(() => clampScale(), 0);
  };

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-modal
      aria-label="Просмотр изображения"
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-[background-color,opacity] ease-out ${
        backIn ? "bg-black/55 opacity-100" : "bg-black/0 opacity-0"
      }`}
      style={{ transitionDuration: `${BACKDROP_IN_MS}ms` }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full max-w-full touch-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{ touchAction: "none" }}
      >
        <img
          src={url}
          alt=""
          loading="eager"
          decoding="async"
          className={
            "max-h-[min(92dvh,920px)] max-w-[min(96vw,1200px)] object-contain shadow-2xl will-change-transform ease-out " +
            (isGesturing || tapZooming
              ? ""
              : "transition-transform duration-200")
          }
          style={{
            transform: `translateY(${ty}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
