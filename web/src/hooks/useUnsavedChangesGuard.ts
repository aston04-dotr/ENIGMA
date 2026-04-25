"use client";

import { useCallback, useEffect } from "react";

type PushRouter = { push: (url: string) => void };
type BackRouter = { back: () => void };
const MESSAGE = "У вас есть несохранённые изменения. Выйти?";
type UnsavedGuardOptions = { enabled?: boolean };

export function useUnsavedChangesGuard(
  isDirty: boolean,
  options?: UnsavedGuardOptions,
) {
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled, isDirty]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest("a");

      if (!link) return;
      if (!isDirty) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const ok = window.confirm(MESSAGE);
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [enabled, isDirty]);

  const confirmLeave = useCallback(() => {
    if (typeof window === "undefined") return true;
    if (!enabled) return true;
    if (!isDirty) return true;
    return window.confirm(MESSAGE);
  }, [enabled, isDirty]);

  const safePush = useCallback(
    (router: PushRouter, url: string) => {
      if (!confirmLeave()) return;
      router.push(url);
    },
    [confirmLeave],
  );

  const safeBack = useCallback(
    (router: BackRouter) => {
      if (!confirmLeave()) return;
      router.back();
    },
    [confirmLeave],
  );

  return {
    confirmLeave,
    safePush,
    safeBack,
  };
}
