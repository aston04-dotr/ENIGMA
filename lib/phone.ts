const DEFAULT_CC = "+7";

/** Нормализует ввод в E.164 для РФ: +7XXXXXXXXXX */
export function normalizeRuPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let n = digits;
  if (n.startsWith("8") && n.length >= 10) n = "7" + n.slice(1);
  if (n.startsWith("7") && n.length === 11) return `+${n}`;
  if (n.length === 10 && !n.startsWith("7")) return `${DEFAULT_CC}${n}`;
  return null;
}

export function formatPhoneDisplay(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) {
    const a = d.slice(1, 4);
    const b = d.slice(4, 7);
    const c = d.slice(7, 9);
    const e = d.slice(9, 11);
    return `+7 ${a} ${b}-${c}-${e}`;
  }
  return e164;
}
