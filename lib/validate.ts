/** Цена объявления: неотрицательное число; запятая как десятичный разделитель. */
export function parseNonNegativePrice(raw: string): number | null {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Пустая строка = ок (email необязателен). */
export function isOptionalEmailValid(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  // Практичная проверка без излишней строгости
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
