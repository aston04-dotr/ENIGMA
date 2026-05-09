/**
 * Сериализация ошибок PostgREST (Supabase) для production-логов.
 * @see https://postgrest.org/en/stable/references/errors.html
 */
export function serializePostgrestError(error: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
  rawStatus?: string;
} {
  if (error == null || typeof error !== "object") {
    return {
      code: "",
      message: String(error ?? ""),
      details: "",
      hint: "",
    };
  }
  const e = error as Record<string, unknown>;
  return {
    code: e.code != null ? String(e.code) : "",
    message: e.message != null ? String(e.message) : String(error),
    details: e.details != null ? String(e.details) : "",
    hint: e.hint != null ? String(e.hint) : "",
    rawStatus:
      e.statusCode != null ? String(e.statusCode) : e.status != null ? String(e.status) : undefined,
  };
}

export function logPostgrestError(prefix: string, error: unknown, extra?: Record<string, unknown>): void {
  const s = serializePostgrestError(error);
  // eslint-disable-next-line no-console
  console.error(`[POSTGREST_ERROR] ${prefix}`, {
    ...extra,
    pgCode: s.code,
    pgMessage: s.message,
    pgDetails: s.details,
    pgHint: s.hint,
    httpStatus: s.rawStatus,
    full: s,
  });
}

/** Схема на сервере отстаёт от select (PGRST204 / Postgres 42xxx вроде 42703 undefined_column). */
export function postgrestIndicatesSchemaColumnMismatch(error: unknown): boolean {
  const s = serializePostgrestError(error);
  if (s.code === "PGRST204") return true;
  const code = String(s.code ?? "").trim();
  if (/^42\d{3}$/.test(code)) {
    const blob = `${s.message} ${s.details} ${s.hint}`.toLowerCase();
    if (
      blob.includes("column") ||
      blob.includes("does not exist") ||
      blob.includes("не существует") ||
      code === "42703"
    ) {
      return true;
    }
  }
  const m = `${s.message} ${s.details}`.toLowerCase();
  return m.includes("column") && (m.includes("not find") || m.includes("does not exist"));
}
