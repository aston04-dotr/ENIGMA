/**
 * Авто-переход на новый деплой после /api/app-version, SW update или битого chunk.
 * При hidden tab reload откладывается до первого visible (меньше раздражает при возврате из фона).
 * Пока идёт soft auth recovery — reload ждёт (меньше «logout»/белого экрана на mobile wake).
 */

import { isAuthRecoveryActive } from "@/lib/authHardRecovery";

const RELOAD_DEBOUNCE_MS = 8_000;
const AUTH_RECOVERY_RELOAD_WAIT_MS = 20_000;
const AUTH_RECOVERY_POLL_MS = 200;

const RELOAD_REASON_KEY = "enigma:pending-deploy-reload-reason";

let lastReloadScheduledAt = 0;

function clearPendingReloadReason(): void {
  try {
    sessionStorage.removeItem(RELOAD_REASON_KEY);
  } catch {
    /* ignore */
  }
}

function tryReloadWhenAuthStable(reason: string, startedAt: number): void {
  if (typeof window === "undefined") return;

  if (isAuthRecoveryActive()) {
    if (Date.now() - startedAt > AUTH_RECOVERY_RELOAD_WAIT_MS) {
      // eslint-disable-next-line no-console
      console.warn("[ENIGMA_DEPLOY_RELOAD]", {
        reason,
        phase: "auth_recovery_wait_timeout_forcing_reload",
      });
    } else {
      window.setTimeout(
        () => tryReloadWhenAuthStable(reason, startedAt),
        AUTH_RECOVERY_POLL_MS,
      );
      return;
    }
  }

  clearPendingReloadReason();
  window.location.reload();
}

export function scheduleDeployReload(reason: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastReloadScheduledAt < RELOAD_DEBOUNCE_MS) {
    return;
  }
  lastReloadScheduledAt = now;
  // eslint-disable-next-line no-console
  console.warn("[ENIGMA_DEPLOY_RELOAD]", { reason, t: now });

  try {
    sessionStorage.setItem(RELOAD_REASON_KEY, reason);
  } catch {
    /* ignore */
  }

  const startedAt = Date.now();

  const runSoon = (): void => {
    window.requestAnimationFrame(() =>
      tryReloadWhenAuthStable(reason, startedAt),
    );
  };

  try {
    if (document.visibilityState === "hidden") {
      const onVisible = (): void => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", onVisible);
        runSoon();
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
  } catch {
    /* fall through */
  }

  runSoon();
}

export function pokeServiceWorkerUpdate(): void {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistration?.().then((reg) => {
    void reg?.update().catch(() => undefined);
  });
}
