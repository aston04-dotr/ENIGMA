/** Общие константы формы недвижимости (создание + редактирование). */

export const COMMERCIAL_PROPERTY_LABEL = "Коммерческая";

/** Отдельное здание целиком — без поля «Этаж». */
export const COMMERCIAL_SHOPPING_CENTER_LABEL = "Торговый центр";

export const COMMERCIAL_PREMISES_OPTIONS = [
  "Офис",
  "Склад",
  "ПСН",
  "Торговый центр",
  "Производство",
  "Общепит",
  "Гостиница",
] as const;

export const HOUSE_LABEL = "Дом";
export const LAND_PLOT_LABEL = "Участок";

export const LAND_PURPOSE_OPTIONS = [
  { value: "ИЖС", label: "ИЖС (Индивидуальное жилищное строительство)" },
  { value: "ЛПХ", label: "ЛПХ (Личное подсобное хозяйство)" },
  { value: "СНТ / ДНП", label: "СНТ / ДНП (Садоводство и дачи)" },
  { value: "Промназначение", label: "Промназначение (Земли промышленности)" },
  { value: "Сельхозназначение", label: "Сельхозназначение (СХ)" },
  { value: "КФХ", label: "КФХ (Крестьянское фермерское хозяйство)" },
] as const;

export const LAND_OWNERSHIP_OPTIONS = ["Собственность", "Аренда", "Субаренда"] as const;
