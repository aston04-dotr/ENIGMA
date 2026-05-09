/** Пользователь хотя бы раз прошёл полноценную авторизацию и синкнул профиль — можно показывать install onboarding. Очищается при выходе. */
export const PWA_USER_READY_FOR_INSTALL_KEY = "enigma:pwa:user-ready-for-install-v1";

/** Пользователь явно навсегда отклонил install prompt (sheet / Android). */
export const PWA_INSTALL_DECLINED_FOREVER_KEY = "enigma:pwa:install-declined-forever-v1";

/** iOS: «Позже» — напомнить позже без permanently skip. */
export const PWA_IOS_INSTALL_SNOOZE_UNTIL_KEY = "enigma:pwa:ios-install-snooze-until-v1";

export function markUserReadyForPwaInstall(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PWA_USER_READY_FOR_INSTALL_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearUserReadyForPwaInstall(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PWA_USER_READY_FOR_INSTALL_KEY);
    window.localStorage.removeItem(PWA_IOS_INSTALL_SNOOZE_UNTIL_KEY);
  } catch {
    /* ignore */
  }
}

export function peekUserReadyForPwaInstall(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PWA_USER_READY_FOR_INSTALL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPwaInstallDeclinedForever(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PWA_INSTALL_DECLINED_FOREVER_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekPwaInstallDeclinedForever(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PWA_INSTALL_DECLINED_FOREVER_KEY) === "1";
  } catch {
    return false;
  }
}

export function snoozeIosPwaInstallPrompt(untilMs: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PWA_IOS_INSTALL_SNOOZE_UNTIL_KEY, String(untilMs));
  } catch {
    /* ignore */
  }
}

export function peekIosPwaInstallSnoozed(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = Number(localStorage.getItem(PWA_IOS_INSTALL_SNOOZE_UNTIL_KEY) ?? "0");
    if (!Number.isFinite(raw) || raw <= 0) return false;
    return now < raw;
  } catch {
    return false;
  }
}
