/** Очень короткая вибрация (Android WebView / Chrome): только мобильное касание + не reduce-motion + вкладка активна. */

function pickLightVibrateMs(): number {
  return 6 + Math.floor(Math.random() * 4);
}

function isDesktopLikePointer(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.matchMedia("(pointer: coarse)").matches) return false;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
    return false;
  } catch {
    return false;
  }
}

export function tryLightVibrate(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return;
  }
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    return;
  }
  if (isDesktopLikePointer()) return;
  const v = navigator.vibrate as ((p: number | number[]) => boolean) | undefined;
  if (!v) return;
  try {
    v.call(navigator, pickLightVibrateMs());
  } catch {
    /* noop */
  }
}
