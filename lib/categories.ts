export const CATEGORIES = [
  { id: "electronics", label: "Электроника" },
  { id: "fashion", label: "Одежда и обувь" },
  { id: "home", label: "Дом и сад" },
  { id: "realestate", label: "Недвижимость" },
  { id: "auto", label: "Авто" },
  { id: "services", label: "Услуги" },
  { id: "kids", label: "Детям" },
  { id: "sport", label: "Спорт" },
  { id: "other", label: "Другое" },
] as const;

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
