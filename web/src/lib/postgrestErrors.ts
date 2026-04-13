import type { PostgrestError } from "@supabase/supabase-js";

/** Insufficient privilege (RLS / policy). PostgREST often returns 42501. */
export function logRlsIfBlocked(error: PostgrestError | null | undefined): void {
  if (error?.code === "42501") {
    console.log("RLS BLOCKED");
  }
}

export function logSupabaseResult(label: string, result: { data: unknown; error: PostgrestError | null }): void {
  console.log(`${label} DATA`, result.data);
  console.log(`${label} ERROR`, result.error);
  logRlsIfBlocked(result.error ?? undefined);
}

export function isRlsViolation(error: PostgrestError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42501") return true;
  const m = String(error.message ?? "").toLowerCase();
  return m.includes("permission denied") || m.includes("row-level security");
}

/** Таблицы ещё не созданы / кэш PostgREST не видит схему. */
export function isSchemaNotInCache(err: PostgrestError | null | undefined): boolean {
  return err?.code === "PGRST205";
}

/** Сообщение для Alert / логов из ответа PostgREST. */
export function formatPostgrestError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const e = err as PostgrestError;
    const raw = String(e.message ?? "");
    if (raw.includes("ACCOUNT_RESTRICTED") && !raw.includes("EDIT")) {
      return "Аккаунт ограничен: нельзя публиковать объявления. Улучшите репутацию или дождитесь восстановления доверия.";
    }
    if (raw.includes("ACCOUNT_RESTRICTED_EDIT")) {
      return "Аккаунт ограничен: редактирование и фото к объявлениям недоступны.";
    }
    if (raw.includes("LISTING_RATE_LIMIT_LOW_TRUST")) {
      return "Ограничение: при низком доверии не более одного объявления в час.";
    }
    if (raw.includes("CHAT_START_RESTRICTED")) {
      return "Недостаточно доверия, чтобы начать новый чат.";
    }
    const bits = [e.message, e.code ? `код: ${e.code}` : "", e.details, e.hint].filter(Boolean);
    return bits.join("\n").trim() || "Ошибка Supabase";
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
