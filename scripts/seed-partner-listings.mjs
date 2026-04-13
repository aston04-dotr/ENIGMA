/**
 * Массовая вставка партнёрских объявлений (реклама) по городам РФ.
 *
 * Требуется:
 *   - Миграция 007_partner_ad_listings.sql (колонка is_partner_ad).
 *   - В public.users есть строка с id = PARTNER_USER_ID (тот же uuid, что в auth.users).
 *
 * Переменные окружения:
 *   SUPABASE_URL          — URL проекта
 *   SUPABASE_SERVICE_ROLE_KEY — service_role (только на сервере/локально, не в приложении)
 *   PARTNER_USER_ID       — uuid пользователя-владельца объявлений
 *   PARTNER_ADS_PER_CITY  — сколько строк на каждый город из списка (кроме «Вся Россия»), по умолчанию 2500
 *   PARTNER_ADS_ALL_RUSSIA — сколько строк с city = «Вся Россия», по умолчанию 3000
 *   PARTNER_BATCH_SIZE    — размер пачки insert, по умолчанию 250
 *   SEED_PARTNER_IMAGES   — если "1", к ~30% объявлений добавляется одно фото (picsum.photos)
 *
 * Запуск из корня проекта:
 *   node scripts/seed-partner-listings.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  "electronics",
  "fashion",
  "home",
  "realestate",
  "auto",
  "services",
  "kids",
  "sport",
  "other",
];

const BRANDS = [
  "DNS",
  "М.Видео",
  "Ситилинк",
  "Ozon",
  "Wildberries",
  "Яндекс Маркет",
  "СберМегаМаркет",
  "Леруа Мерлен",
  "Авито",
  "Циан",
  "Авто.ру",
  "Booking.com",
  "СберЗдоровье",
  "МТС",
  "Билайн",
  "МегаФон",
  "Ростелеком",
  "Пятёрочка",
  "Магнит",
  "Перекрёсток",
];

const OFFERS = [
  "Скидка партнёра",
  "Распродажа",
  "Новая коллекция",
  "Бесплатная доставка",
  "Рассрочка 0%",
  "Кэшбэк",
  "Комплект со скидкой",
  "Онлайн-цена",
  "Только у нас",
  "Лимитированная серия",
];

function numEnv(name, def) {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : def;
}

function buildRow(partnerUserId, city, globalIndex) {
  const brand = BRANDS[globalIndex % BRANDS.length];
  const offer = OFFERS[globalIndex % OFFERS.length];
  const cat = CATEGORIES[globalIndex % CATEGORIES.length];
  const n = globalIndex + 1;
  const price = 99 + ((globalIndex * 7919) % 120_000);
  return {
    user_id: partnerUserId,
    title: `${brand} · ${offer} — ${city} №${n}`,
    description:
      `Партнёрское размещение ENIGMA. Город: ${city}. Условия акции, наличие и сроки действия уточняйте у рекламодателя. ` +
      `Материал носит рекламный характер и не является публичной офертой.`,
    price,
    category: cat,
    city,
    is_partner_ad: true,
  };
}

async function insertBatches(admin, rows, batchSize) {
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await admin.from("listings").insert(chunk);
    if (error) {
      console.error("Insert error at offset", i, error.message);
      throw error;
    }
    done += chunk.length;
    if (done % (batchSize * 4) === 0 || done === rows.length) {
      process.stdout.write(`\r  …вставлено ${done} / ${rows.length}`);
    }
  }
  process.stdout.write("\n");
}

async function attachImages(admin, listingIds) {
  const imageRows = listingIds.map((listing_id) => ({
    listing_id,
    url: `https://picsum.photos/seed/${listing_id.replace(/-/g, "")}/800/600`,
    sort_order: 0,
  }));
  const { error } = await admin.from("images").insert(imageRows);
  if (error) {
    console.warn("Предупреждение: не удалось вставить изображения:", error.message);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const partnerUserId = process.env.PARTNER_USER_ID?.trim();

  if (!url || !key || !partnerUserId) {
    console.error(
      "Задайте SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY и PARTNER_USER_ID в окружении."
    );
    process.exit(1);
  }

  const perCity = numEnv("PARTNER_ADS_PER_CITY", 2500);
  const allRussia = numEnv("PARTNER_ADS_ALL_RUSSIA", 3000);
  const batchSize = Math.max(50, numEnv("PARTNER_BATCH_SIZE", 250));
  const withImages = process.env.SEED_PARTNER_IMAGES === "1";

  const citiesPath = join(__dirname, "..", "lib", "russianCities.json");
  const all = JSON.parse(readFileSync(citiesPath, "utf8"));
  const CITY_ALL = "Вся Россия";
  const geoCities = all.filter((c) => c !== CITY_ALL);

  console.log(
    `Городов (без «${CITY_ALL}»): ${geoCities.length}; по ${perCity} объявлений; ` +
      `«${CITY_ALL}»: ${allRussia}; пачка ${batchSize}; картинки: ${withImages ? "да" : "нет"}`
  );

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: urow, error: uerr } = await admin.from("users").select("id").eq("id", partnerUserId).maybeSingle();
  if (uerr || !urow) {
    console.error(
      "PARTNER_USER_ID не найден в public.users. Создайте пользователя в приложении и подставьте его uuid."
    );
    if (uerr) console.error(uerr.message);
    process.exit(1);
  }

  let globalIndex = 0;
  const allRows = [];

  for (const city of geoCities) {
    for (let k = 0; k < perCity; k++) {
      allRows.push(buildRow(partnerUserId, city, globalIndex));
      globalIndex++;
    }
  }

  for (let k = 0; k < allRussia; k++) {
    allRows.push(buildRow(partnerUserId, CITY_ALL, globalIndex));
    globalIndex++;
  }

  console.log(`Всего строк: ${allRows.length}. Вставка…`);
  const t0 = Date.now();

  if (!withImages) {
    await insertBatches(admin, allRows, batchSize);
  } else {
    // Медленнее: вставка пачками с возвратом id для images
    let done = 0;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const chunk = allRows.slice(i, i + batchSize);
      const { data, error } = await admin.from("listings").insert(chunk).select("id");
      if (error) {
        console.error("Insert error at offset", i, error.message);
        throw error;
      }
      const ids = (data ?? []).map((r) => r.id);
      const pick = ids.filter((_, idx) => idx % 3 === 0);
      if (pick.length) await attachImages(admin, pick);
      done += chunk.length;
      process.stdout.write(`\r  …вставлено ${done} / ${allRows.length}`);
    }
    process.stdout.write("\n");
  }

  console.log(`Готово за ${Math.round((Date.now() - t0) / 1000)} с`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
