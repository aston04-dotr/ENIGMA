import rawCities from "../web/src/lib/russianCities.json";

export const cities = (rawCities as string[]).map((name) => ({ name }));

export const TOP_CITIES = [
  "Москва",
  "Сочи",
];
