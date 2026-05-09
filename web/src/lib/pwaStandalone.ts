/** Окно запущено как установленное PWA (iOS standalone / display-mode standalone | fullscreen). */
export function windowAppearsStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    const mm = window.matchMedia.bind(window);
    if (mm("(display-mode: standalone)").matches) return true;
    if (mm("(display-mode: fullscreen)").matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}
