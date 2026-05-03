/**
 * Участок: каноническая площадь хранится в сотках (1 га = 100 соток).
 */

export function normalizeDecimalInput(raw: string): string {
  return raw.trim().replace(/\s/g, "").replace(",", ".");
}

/** Положительное число из инпута фильтра/формы (запятая допускается). */
export function parseFlexiblePositiveNumber(raw: string): number | null {
  const n = normalizeDecimalInput(raw);
  if (!n) return null;
  const num = Number.parseFloat(n);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

/**
 * Человеческая строка площади участка → сотки.
 * Учитывает «га», «сот», голое число (по умолчанию как сотки).
 */
export function parsePlotAreaToSotki(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  const hasHa =
    /\bга\b/.test(s) ||
    s.includes("га.") ||
    s.includes("гект") ||
    (s.includes("га") && !/сот/.test(s));

  const match = s.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const n = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;

  if (hasHa) return n * 100;
  return n;
}

/** Гектары из инпута → сотки для сравнения/хранения */
export function hectaresInputToSotki(raw: string): number | null {
  const ha = parseFlexiblePositiveNumber(raw);
  return ha != null ? ha * 100 : null;
}

/** Границы фильтра участка (от/до) в сотках с учётом режима га. */
export function plotFilterBoundsToSotki(
  fromRaw: string,
  toRaw: string,
  interpretAsHectares: boolean,
): { from: number | null; to: number | null } {
  const edge = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    return interpretAsHectares ? hectaresInputToSotki(t) : parseFlexiblePositiveNumber(t);
  };
  return { from: edge(fromRaw), to: edge(toRaw) };
}

/** Сотки → строка для поля в режиме «га» */
export function sotkiToHectaresDisplay(sotki: number): string {
  if (!Number.isFinite(sotki) || sotki <= 0) return "";
  const ha = sotki / 100;
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(ha);
  return formatted.replace(/\u00a0/g, " ");
}

/** Значение поля формы (число соток) → строка для объявления */
export function formatPlotAreaForListingFromSotkiString(plotAreaSotkiRaw: string): string {
  const sotki = parseFlexiblePositiveNumber(plotAreaSotkiRaw);
  if (sotki == null) return plotAreaSotkiRaw.trim();
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(sotki);
  return `${formatted.replace(/\u00a0/g, " ")} сот.`;
}
