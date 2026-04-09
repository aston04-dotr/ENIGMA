/**
 * seedListings(): генерация тестовых данных для ленты объявлений.
 *
 * Требуется:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (только локально/на сервере, не в клиенте)
 * - SEED_USER_ID: uuid пользователя, который уже существует в `public.users`
 *
 * Вставляет:
 * - 50–100 строк в `public.listings` (batch insert)
 * - 1–3 изображения на каждое объявление в `public.images` (batch insert)
 *
 * Запуск:
 *   node scripts/seed-listings.mjs
 */
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const WORDS = [
  "iPhone",
  "Samsung",
  "PlayStation",
  "Xiaomi",
  "Кроссовки",
  "Коляска",
  "Диван",
  "Стул",
  "Велосипед",
  "Ноутбук",
  "Монитор",
  "Кофемашина",
  "Куртка",
  "Пальто",
  "Квартира",
  "Дом",
  "Машина",
  "Шины",
  "Пылесос",
  "Наушники",
];

const CATEGORIES = ["electronics", "fashion", "home", "realestate", "auto", "services", "kids", "sport", "other"];

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function randomTitle() {
  const a = pick(WORDS);
  const b = pick(WORDS);
  const suffix = randInt(1, 999);
  return `${a} ${b} ${suffix}`.replace(/\s+/g, " ").trim();
}

function randomCreatedAt() {
  const daysAgo = randInt(0, 45);
  const hours = randInt(0, 23);
  const minutes = randInt(0, 59);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function seedListings(options = {}) {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const userId = process.env.SEED_USER_ID?.trim();
  if (!url || !key || !userId) {
    throw new Error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_USER_ID");
  }

  const total = options.total ?? randInt(50, 100);
  const partnerRatio = options.partnerRatio ?? 0.2;
  const batchSize = options.batchSize ?? 200;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: urow, error: uerr } = await admin.from("users").select("id").eq("id", userId).maybeSingle();
  if (uerr || !urow) {
    throw new Error("SEED_USER_ID not found in public.users (create user in app first, then set SEED_USER_ID)");
  }

  const listingRows = [];
  const imagesRows = [];

  for (let i = 0; i < total; i++) {
    const id = crypto.randomUUID();
    const isPartner = Math.random() < partnerRatio;
    listingRows.push({
      id,
      user_id: userId,
      title: randomTitle(),
      description: isPartner
        ? "реклама от партнёра"
        : "Тестовое объявление для проверки ленты. Безопасно для удаления.",
      price: randInt(1000, 100000),
      category: pick(CATEGORIES),
      city: pick(["Москва", "Сочи", "Санкт-Петербург", "Вся Россия"]),
      created_at: randomCreatedAt(),
      is_partner_ad: isPartner,
    });

    const imgCount = randInt(1, 3);
    for (let k = 0; k < imgCount; k++) {
      imagesRows.push({
        listing_id: id,
        url: `https://picsum.photos/seed/${id.replace(/-/g, "")}${k}/800/600`,
        sort_order: k,
      });
    }
  }

  console.log(
    "seedListings: total=",
    listingRows.length,
    "partner≈",
    Math.round(listingRows.filter((x) => x.is_partner_ad).length),
    "images=",
    imagesRows.length
  );

  // Batch insert: списками, не по одному.
  for (const c of chunk(listingRows, batchSize)) {
    const { error } = await admin.from("listings").insert(c);
    if (error) throw error;
  }
  for (const c of chunk(imagesRows, batchSize)) {
    const { error } = await admin.from("images").insert(c);
    if (error) throw error;
  }

  return { listings: listingRows.length, images: imagesRows.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedListings()
    .then((r) => {
      console.log("seedListings done:", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

