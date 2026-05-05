export const CATEGORIES = [
  { id: "electronics", label: "Электроника" },
  { id: "fashion", label: "Одежда и обувь" },
  { id: "home", label: "Дом и сад" },
  { id: "realestate", label: "Недвижимость" },
  { id: "auto", label: "Авто" },
  { id: "moto", label: "Мотоциклы" },
  { id: "services", label: "Услуги" },
  { id: "kids", label: "Детям" },
  { id: "sport", label: "Спорт" },
  { id: "furniture", label: "Мебель" },
  { id: "other", label: "Другое" },
] as const;

export function categoryLabel(id: unknown): string {
  const key = typeof id === "string" ? id : "";
  return (CATEGORIES || []).find((c) => c.id === key)?.label ?? (key || "Другое");
}
