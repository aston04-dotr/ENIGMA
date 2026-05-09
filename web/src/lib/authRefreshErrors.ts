/**
 * Распознавание «битых» локальных refresh (ротация Supabase / другая вкладка / PWA stale).
 * Без браузера — можно импортировать из middleware и API.
 */

export function peekAuthApiErrorParts(error: unknown): {
  code?: string;
  message: string;
  status?: number;
} {
  if (typeof error !== "object" || error === null) {
    return { message: String(error ?? "") };
  }
  const o = error as Record<string, unknown>;
  const code = o.code != null ? String(o.code) : undefined;
  const message = String(o.message ?? error ?? "");
  const statusRaw = o.status;
  const status =
    typeof statusRaw === "number"
      ? statusRaw
      : typeof statusRaw === "string" && /^[0-9]+$/.test(statusRaw.trim())
        ? Number(statusRaw)
        : undefined;
  return { code, message, status };
}

/** Некорректный refresh только на этом клиенте — не циклить recover; чистим local только. */
export function isInvalidLocalRefreshTokenError(error: unknown): boolean {
  const { code, message, status } = peekAuthApiErrorParts(error);
  const lcMsg = message.toLowerCase();
  const lcCode = `${code ?? ""}`.toLowerCase();

  if (lcCode === "refresh_token_not_found") return true;
  if (lcMsg.includes("refresh_token_not_found")) return true;

  /* GoTrue текст: Invalid Refresh Token / Refresh Token Not Found */
  if (lcMsg.includes("refresh token not found")) return true;
  if (
    lcMsg.includes("invalid refresh token") ||
    lcMsg.includes("invalid_refresh_token") ||
    lcCode === "invalid_refresh_token"
  ) {
    return true;
  }

  if (lcCode === "invalid_grant" || lcMsg.includes("invalid_grant")) {
    /* Password grant ошибки могут давать то же сообщение без refresh wording — уточняем */
    if (lcMsg.includes("refresh")) return true;
  }

  if (typeof status === "number" && (status === 400 || status === 401)) {
    if (lcMsg.includes("refresh_token") || lcMsg.includes("refresh token")) return true;
  }

  return false;
}
