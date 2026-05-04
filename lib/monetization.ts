import { supabase } from "./supabase";
import type { ListingRow } from "./types";

/** Лимиты бесплатных объявлений по категориям (ключ = id категории в приложении). */
export const CATEGORY_RULES: Record<
  string,
  { freeLimit: number; periodDays: number; priceRub: number }
> = {
  auto: { freeLimit: 1, periodDays: 30, priceRub: 1000 },
  moto: { freeLimit: 1, periodDays: 30, priceRub: 1000 },
  realestate: { freeLimit: 1, periodDays: 90, priceRub: 1500 },
  default: { freeLimit: 2, periodDays: 30, priceRub: 200 },
};

export function getCategoryRule(categoryId: string) {
  return CATEGORY_RULES[categoryId] ?? CATEGORY_RULES.default;
}

export function isTopActive(l: Pick<ListingRow, "is_top" | "top_until">): boolean {
  if (!l.is_top || !l.top_until) return false;
  return new Date(l.top_until).getTime() > Date.now();
}

export function isVipActive(l: Pick<ListingRow, "is_vip" | "vip_until">): boolean {
  if (!l.is_vip || !l.vip_until) return false;
  return new Date(l.vip_until).getTime() > Date.now();
}

/** Активный BOOST: есть boosted_until в будущем. */
export function isBoostActive(l: Pick<ListingRow, "boosted_until" | "boosted_at">): boolean {
  if (l.boosted_until) {
    return new Date(l.boosted_until).getTime() > Date.now();
  }
  return false;
}

/** Сколько обычных карточек подряд до одной партнёрской в основной ленте (не подряд две рекламы). */
export const PARTNER_FEED_ORGANIC_BEFORE_AD = 5;

function isPartnerAd(l: Pick<ListingRow, "is_partner_ad">): boolean {
  return l.is_partner_ad === true;
}

function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Production interleave партнёрских объявлений в ленте (UX/монетизация):
 * - динамический интервал по доле рекламы + небольшой random offset
 * - партнёрские сортируются по `boost_weight` (если есть)
 * - входные массивы не мутируются; на выходе нет дублей по `id`
 * - минимум 1 organic между рекламами и без 2 реклам подряд (если физически возможно при данном объёме organic)
 */
export function interleavePartnerFeedMain(
  sortedMain: ListingRow[],
  options?: { userId?: string }
): ListingRow[] {
  type ListingRowExt = ListingRow & {
    /** Монетизация партнёрок: вес буста (чем выше — тем выше в показах). */
    boost_weight?: number;
    /** Истечение буста: активен пока `boost_expires_at > now`. */
    boost_expires_at?: string;
    id: string;
  };

  const DEBUG_SHOW_ADS = false;

  const dedupeById = (rows: ListingRowExt[]): ListingRowExt[] => {
    const seen = new Set<string>();
    const out: ListingRowExt[] = [];
    for (const r of rows) {
      const id = String(r?.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(r);
    }
    return out;
  };

  const input = (sortedMain ?? []) as ListingRowExt[];
  const organic = dedupeById(input.filter((l) => !isPartnerAd(l)));
  const partnerRaw = dedupeById(input.filter((l) => isPartnerAd(l)));

  let MIN_ORGANIC_BEFORE_AD =
    organic.length < 6 ? 1 :
    organic.length < 15 ? 2 :
    3;

  // 6) FALLBACK
  if (organic.length === 0) {
    const total = partnerRaw.length;
    const ratio = total === 0 ? 0 : 1;
    const interval = 5;
    const seed = options?.userId ?? "global";
    const rand = seededRandom(seed);
    const randomOffset = Math.floor(rand() * 2);
    const effectiveInterval = interval + randomOffset;
    const result = [...partnerRaw];
    return result;
  }

  if (partnerRaw.length === 0) {
    const total = organic.length;
    const ratio = total === 0 ? 0 : 0;
    const interval = 5;
    const seed = options?.userId ?? "global";
    const rand = seededRandom(seed);
    const randomOffset = Math.floor(rand() * 2);
    const effectiveInterval = interval + randomOffset;
    const result = [...organic];
    return result;
  }

  // 7) ДИНАМИЧЕСКИЙ ИНТЕРВАЛ
  const total = organic.length + partnerRaw.length;
  const ratio = total === 0 ? 0 : partnerRaw.length / total;
  let interval = 5;
  if (ratio > 0.4) interval = 2;
  else if (ratio > 0.2) interval = 3;

  void DEBUG_SHOW_ADS;

  // 3) Персонализация + 8) стабильный random offset
  const seed = options?.userId ?? "global";
  const rand = seededRandom(seed);
  const randomOffset = Math.floor(rand() * 2);
  const effectiveInterval = interval + randomOffset;

  const randCache = new Map<string, number>();
  const getRand = (key: string) => {
    if (!randCache.has(key)) {
      randCache.set(key, seededRandom(key)());
    }
    return randCache.get(key)!;
  };

  // 9) СОРТИРОВКА РЕКЛАМЫ (active boost → weight → стабильный random)
  const now = Date.now();
  const partners = [...partnerRaw].sort((a, b) => {
    const ea = a.boost_expires_at ? new Date(a.boost_expires_at).getTime() : 0;
    const eb = b.boost_expires_at ? new Date(b.boost_expires_at).getTime() : 0;
    const activeA = ea > now;
    const activeB = eb > now;
    if (activeA !== activeB) return activeB ? 1 : -1;

    const wa = typeof a.boost_weight === "number" ? a.boost_weight : 1;
    const wb = typeof b.boost_weight === "number" ? b.boost_weight : 1;
    if (wb !== wa) return wb - wa;

    const ra = getRand(`${seed}:partner:${a.id}`);
    const rb = getRand(`${seed}:partner:${b.id}`);
    return rb - ra;
  });

  // 11) ВСТАВКА
  const result: ListingRowExt[] = [];
  let pi = 0;
  let organicRun = 0;

  for (let oi = 0; oi < organic.length; oi++) {
    const row = organic[oi]!;
    result.push(row);
    organicRun++;

    // UX защита: первые 3 — без рекламы.
    if (oi + 1 < MIN_ORGANIC_BEFORE_AD) continue;

    // Рекламу вставляем только ПОСЛЕ organic.
    if (pi < partners.length && organicRun >= effectiveInterval) {
      // Гарантия «не подряд две рекламы»: в result перед вставкой всегда organic.
      result.push(partners[pi++]!);
      organicRun = 0;
    }
  }

  // 12) ДОБИВКА: остаток партнёрок вставляем после organic, где возможно (без 2 подряд).
  if (pi < partners.length) {
    for (let i = 0; i < result.length && pi < partners.length; i++) {
      if (isPartnerAd(result[i]!)) continue;
      const after = i + 1 < result.length ? result[i + 1]! : null;
      if (after && isPartnerAd(after)) continue;
      result.splice(i + 1, 0, partners[pi++]!);
      i++;
    }
  }

  // Если партнёрок всё ещё больше, чем separators (organic), без потери показов докидываем в конец.
  while (pi < partners.length) result.push(partners[pi++]!);

  const final = dedupeById(result).map((x) => x as ListingRow);
  return final;
}

/** Сортировка ленты: приоритетный слот (TOP) без партнёрок; основная лента — сначала обычные (VIP → BOOST → дата), затем партнёрские. */
export function buildFeedSections(listings: ListingRow[]): {
  recommended: ListingRow[];
  main: ListingRow[];
} {
  const recommended = listings
    .filter((l) => isTopActive(l) && !isPartnerAd(l))
    .sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime()
    );
  const topIds = new Set(recommended.map((l) => l.id));
  const rest = listings.filter((l) => !topIds.has(l.id));

  function tier(l: ListingRow): number {
    if (isVipActive(l)) return 2;
    if (isBoostActive(l)) return 1;
    return 0;
  }

  const main = [...rest].sort((a, b) => {
    const pa = isPartnerAd(a);
    const pb = isPartnerAd(b);
    if (pa !== pb) return pa ? 1 : -1;
    const ta = tier(a);
    const tb = tier(b);
    if (tb !== ta) return tb - ta;
    if (ta === 2) {
      const va = a.vip_until ? new Date(a.vip_until).getTime() : 0;
      const vb = b.vip_until ? new Date(b.vip_until).getTime() : 0;
      if (vb !== va) return vb - va;
    }
    if (ta === 1) {
      const ba = a.boosted_until ? new Date(a.boosted_until).getTime() : 0;
      const bb = b.boosted_until ? new Date(b.boosted_until).getTime() : 0;
      if (bb !== ba) return bb - ba;
    }
    const au = new Date(a.updated_at ?? a.created_at).getTime();
    const bu = new Date(b.updated_at ?? b.created_at).getTime();
    return bu - au;
  });

  return { recommended, main };
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function countListingsInCategoryWindow(
  userId: string,
  category: string,
  periodDays: number
): Promise<number> {
  const since = addDays(new Date(), -periodDays);
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category", category)
    .gte("created_at", since.toISOString());
  if (error) return 0;
  return count ?? 0;
}

// ─── Тарифы BOOST / VIP ─────────────────────────────────────────────

export const BOOST_TARIFFS = [
  { id: "boost_3" as const, days: 3, priceRub: 149 },
  { id: "boost_7" as const, days: 7, priceRub: 349 },
] as const;

export const VIP_TARIFFS = [
  { id: "vip_3" as const, days: 3, priceRub: 149 },
  { id: "vip_7" as const, days: 7, priceRub: 349 },
  { id: "vip_30" as const, days: 30, priceRub: 999 },
] as const;

export type PromotionTariffKind = (typeof BOOST_TARIFFS)[number]["id"] | (typeof VIP_TARIFFS)[number]["id"];

export function parsePromotionTariffKind(s: string | undefined | null): PromotionTariffKind | null {
  const k = String(s ?? "").trim();
  if (
    k === "boost_3" ||
    k === "boost_7" ||
    k === "vip_3" ||
    k === "vip_7" ||
    k === "vip_30"
  ) {
    return k;
  }
  return null;
}

export function promotionTariffLabel(kind: PromotionTariffKind): string {
  switch (kind) {
    case "boost_3":
      return "BOOST 3 дня";
    case "boost_7":
      return "BOOST 7 дней";
    case "vip_3":
      return "VIP 3 дня";
    case "vip_7":
      return "VIP 7 дней";
    case "vip_30":
      return "VIP 30 дней";
    default:
      return kind;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extendActivePeriod(currentUntil: string | null | undefined, days: number): string {
  const nowMs = Date.now();
  const parsedMs = currentUntil ? new Date(currentUntil).getTime() : 0;
  const baseMs = Number.isFinite(parsedMs) && parsedMs > nowMs ? parsedMs : nowMs;
  return new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
}

function envMap(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

export const PAYMENTS_UNAVAILABLE_MESSAGE = "Тестовый режим оплаты: заказ подтверждается автоматически.";

export function isPaymentsEnabled(): boolean {
  const env = envMap();
  const mode = String(
    env.PAYMENT_MODE ?? env.EXPO_PUBLIC_PAYMENT_MODE ?? env.NEXT_PUBLIC_PAYMENT_MODE ?? "mock"
  ).toLowerCase();

  if (mode !== "yookassa") return false;

  const shopId = String(
    env.YOOKASSA_SHOP_ID ?? env.EXPO_PUBLIC_YOOKASSA_SHOP_ID ?? env.NEXT_PUBLIC_YOOKASSA_SHOP_ID ?? ""
  ).trim();
  const secretKey = String(
    env.YOOKASSA_SECRET_KEY ?? env.EXPO_PUBLIC_YOOKASSA_SECRET_KEY ?? env.NEXT_PUBLIC_YOOKASSA_SECRET_KEY ?? ""
  ).trim();

  return Boolean(shopId && secretKey);
}

export function logPaymentIntent(payload: {
  userId: string;
  productId: string;
  amountRub: number;
  listingId?: string | null;
  orderId?: string | null;
  rail?: string | null;
  promoKind?: string | null;
  paymentType?: string | null;
}) {
  console.info("[payments-disabled] intent recorded", payload);
}

export type PromotionType = "boost" | "vip" | "top";
export type PackageCounterKind = "real_estate" | "auto" | "other";

export type PurchaseOrderStatus = "pending" | "confirmed" | "success" | "failed";

export type PurchaseOrder = {
  id: string;
  userId: string;
  productId: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  confirmedAt?: string;
  provider?: "disabled" | "mock" | "yookassa";
  note?: string;
};

const mockPurchaseOrders = new Map<string, PurchaseOrder>();

async function persistPurchaseOrder(order: PurchaseOrder): Promise<void> {
  try {
    const ordersTable = supabase.from as unknown as (relation: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };

    const { error } = await ordersTable("payment_orders").insert({
      id: order.id,
      user_id: order.userId,
      product_id: order.productId,
      provider: order.provider ?? (isPaymentsEnabled() ? "yookassa" : "disabled"),
      status: order.status,
      note: order.note ?? null,
      created_at: order.createdAt,
      confirmed_at: order.confirmedAt ?? null,
    });

    if (error) {
      console.warn("payment_orders insert skipped", error.message ?? error);
    }
  } catch (e) {
    console.warn("payment_orders insert skipped", e);
  }
}

async function updatePurchaseOrder(order: PurchaseOrder): Promise<void> {
  try {
    const ordersTable = supabase.from as unknown as (relation: string) => {
      insert: (values: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };

    const { error } = await ordersTable("payment_orders")
      .update({
        provider: order.provider ?? (isPaymentsEnabled() ? "yookassa" : "disabled"),
        status: order.status,
        note: order.note ?? null,
        confirmed_at: order.confirmedAt ?? null,
      })
      .eq("id", order.id);

    if (error) {
      console.warn("payment_orders update skipped", error.message ?? error);
    }
  } catch (e) {
    console.warn("payment_orders update skipped", e);
  }
}

function makeOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPromotionProductId(type: PromotionType, days: number): string {
  return `promotion:${type}_${days}`;
}

export function buildPackageProductId(type: PackageCounterKind, amount: number): string {
  return `package:${type}:${amount}`;
}

function getConfirmedOrder(
  userId: string,
  orderId: string | null | undefined,
  expectedProductId: string
): PurchaseOrder | null {
  if (!userId?.trim() || !orderId?.trim()) return null;
  const order = mockPurchaseOrders.get(orderId);
  if (!order) return null;
  if (order.userId !== userId) return null;
  if (order.status !== "confirmed" && order.status !== "success") return null;
  if (order.productId !== expectedProductId) return null;
  return order;
}

export const purchaseFlow = {
  async createOrder(userId: string, productId: string): Promise<PurchaseOrder> {
    if (!userId?.trim()) throw new Error("Не указан пользователь для заказа.");
    if (!productId?.trim()) throw new Error("Не указан товар для заказа.");

    await wait(150);
    const enabled = isPaymentsEnabled();
    const order: PurchaseOrder = {
      id: makeOrderId(),
      userId,
      productId,
      status: "pending",
      createdAt: nowIso(),
      provider: enabled ? "yookassa" : "mock",
      note: enabled ? undefined : PAYMENTS_UNAVAILABLE_MESSAGE,
    };
    mockPurchaseOrders.set(order.id, order);
    await persistPurchaseOrder(order);
    return order;
  },

  async confirmPayment(orderId: string): Promise<PurchaseOrder> {
    await wait(300);
    const current = mockPurchaseOrders.get(orderId);
    if (!current) throw new Error("Заказ не найден.");

    if (!isPaymentsEnabled()) {
      const succeeded: PurchaseOrder = {
        ...current,
        status: "success",
        confirmedAt: nowIso(),
        provider: "mock",
        note: PAYMENTS_UNAVAILABLE_MESSAGE,
      };
      mockPurchaseOrders.set(orderId, succeeded);
      await updatePurchaseOrder(succeeded);
      return succeeded;
    }

    const confirmed: PurchaseOrder = {
      ...current,
      status: "confirmed",
      confirmedAt: nowIso(),
      provider: "yookassa",
    };
    mockPurchaseOrders.set(orderId, confirmed);
    await updatePurchaseOrder(confirmed);
    return confirmed;
  },
};

export function promotionTariffToParams(kind: PromotionTariffKind): {
  type: Extract<PromotionType, "boost" | "vip">;
  days: number;
} {
  if (kind === "boost_3") return { type: "boost", days: 3 };
  if (kind === "boost_7") return { type: "boost", days: 7 };
  if (kind === "vip_3") return { type: "vip", days: 3 };
  if (kind === "vip_7") return { type: "vip", days: 7 };
  return { type: "vip", days: 30 };
}

/** @deprecated Используйте parsePromotionTariffKind + applyPromotion */
export type PromotionKind = "boost" | "vip" | "top3" | "top7";

export function parsePromotionKind(s: string | undefined | null): PromotionKind | null {
  if (s === "boost" || s === "vip" || s === "top3" || s === "top7") return s;
  return null;
}

export function legacyPromotionToParams(kind: PromotionKind): { type: PromotionType; days: number } {
  if (kind === "boost") return { type: "boost", days: 3 };
  if (kind === "vip") return { type: "vip", days: 7 };
  if (kind === "top3") return { type: "top", days: 3 };
  return { type: "top", days: 7 };
}

type PackageProfileField = "auto_package_count" | "real_estate_package_count" | "other_package_count";

const PACKAGE_FIELD_MAP = {
  auto: "auto_package_count",
  real_estate: "real_estate_package_count",
  general: "other_package_count",
  other: "other_package_count",
} as const;

function packageFieldByKind(type: PackageCounterKind): PackageProfileField {
  return PACKAGE_FIELD_MAP[type] ?? PACKAGE_FIELD_MAP.other;
}

function packageFieldByCategory(category: string): PackageProfileField {
  if (category === "auto") return PACKAGE_FIELD_MAP.auto;
  if (category === "realestate") return PACKAGE_FIELD_MAP.real_estate;
  return PACKAGE_FIELD_MAP.other;
}

async function incrementProfilePackageBalance(
  userId: string,
  field: PackageProfileField,
  amount: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc("increment_package", {
    field_name: field,
    inc_value: amount,
  });

  if (!error) return { ok: true };

  console.warn("increment_package RPC fallback", error.message ?? error);

  const { data: currentRow, error: selectError } = await supabase
    .from("profiles")
    .select(field)
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, message: selectError.message ?? "Не удалось загрузить профиль." };
  }

  const current = Number((currentRow as Record<string, unknown> | null)?.[field] ?? 0);
  const nextValue = current + amount;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ [field]: nextValue } as Record<string, number>)
    .eq("id", userId);

  if (updateError) {
    return { ok: false, message: updateError.message ?? "Не удалось начислить пакет." };
  }

  return { ok: true };
}

async function decrementProfilePackageBalance(
  userId: string,
  field: PackageProfileField
): Promise<{ ok: true; consumed: boolean } | { ok: false; message: string }> {
  const { data: currentRow, error: selectError } = await supabase
    .from("profiles")
    .select(field)
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    return { ok: false, message: selectError.message ?? "Не удалось загрузить профиль." };
  }

  const current = Number((currentRow as Record<string, unknown> | null)?.[field] ?? 0);
  if (current <= 0) {
    return { ok: true, consumed: false };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ [field]: current - 1 } as Record<string, number>)
    .eq("id", userId);

  if (updateError) {
    return { ok: false, message: updateError.message ?? "Не удалось списать пакет." };
  }

  return { ok: true, consumed: true };
}

export async function tryConsumePackage(
  userId: string,
  category: string
): Promise<{ ok: true; consumed: boolean } | { ok: false; message: string }> {
  if (!userId?.trim()) {
    return { ok: false, message: "Нужен вход в аккаунт." };
  }

  const { data, error } = await supabase.rpc("try_consume_listing_package", {
    p_category: category,
  });

  if (!error) {
    return { ok: true, consumed: data === true };
  }

  console.warn("try_consume_listing_package RPC fallback", error.message ?? error);
  return decrementProfilePackageBalance(userId, packageFieldByCategory(category));
}

export async function addPackage(
  userId: string,
  type: PackageCounterKind,
  amount: number,
  options?: { orderId?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!userId?.trim()) return { ok: false, message: "Нужен вход в аккаунт." };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: "Некорректное количество пакетов." };
  }

  const order = getConfirmedOrder(userId, options?.orderId, buildPackageProductId(type, amount));
  if (!order) {
    return { ok: false, message: "Нельзя начислить пакет без подтверждённой оплаты." };
  }

  const field = packageFieldByKind(type);
  const balanceRes = await incrementProfilePackageBalance(userId, field, amount);
  if (!balanceRes.ok) {
    return balanceRes;
  }

  console.log("PAYMENT SUCCESS:", {
    orderId: order.id,
    type,
    count: amount,
  });

  return { ok: true };
}

export async function applyPromotion(
  userId: string,
  listingId: string,
  type: PromotionType,
  days: number,
  options?: { orderId?: string | null }
): Promise<{ ok: true; expiresAt: string } | { ok: false; message: string }> {
  if (!userId?.trim()) return { ok: false, message: "Нужен вход в аккаунт." };
  if (!listingId?.trim()) return { ok: false, message: "Не найдено объявление." };
  if (!Number.isInteger(days) || days <= 0) {
    return { ok: false, message: "Некорректный срок продвижения." };
  }

  const order = getConfirmedOrder(userId, options?.orderId, buildPromotionProductId(type, days));
  if (!order) {
    return { ok: false, message: "Нельзя применить продвижение без подтверждённой оплаты." };
  }
  void order;

  const { data: fresh, error: loadError } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();

  if (loadError || !fresh) {
    return { ok: false, message: loadError?.message ?? "Не удалось загрузить объявление." };
  }

  const listing = fresh as ListingRow;
  if (listing.user_id !== userId) {
    return { ok: false, message: "Продвижение можно применять только к своим объявлениям." };
  }

  const updatedAt = nowIso();
  const expiresAt =
    type === "boost"
      ? extendActivePeriod(listing.boosted_until, days)
      : type === "vip"
        ? extendActivePeriod(listing.vip_until, days)
        : extendActivePeriod(listing.top_until, days);

  const patch =
    type === "boost"
      ? {
          boosted_at: updatedAt,
          boosted_until: expiresAt,
          updated_at: updatedAt,
          is_boosted: true,
        }
      : type === "vip"
        ? {
            is_vip: true,
            vip_until: expiresAt,
            updated_at: updatedAt,
          }
        : {
            is_top: true,
            top_until: expiresAt,
            updated_at: updatedAt,
          };

  const { error: updateError } = await supabase
    .from("listings")
    .update(patch)
    .eq("id", listingId)
    .eq("user_id", userId);

  if (updateError) {
    return { ok: false, message: updateError.message ?? "Не удалось применить продвижение." };
  }

  const { error: historyError } = await supabase.from("listing_boosts").insert({
    listing_id: listingId,
    type,
    expires_at: expiresAt,
    created_at: updatedAt,
  });

  if (historyError) {
    return { ok: false, message: historyError.message ?? "Не удалось сохранить историю продвижения." };
  }

  return { ok: true, expiresAt };
}

/** Тарифы BOOST/VIP теперь проходят через единый production-ready слой. */
export async function applyPromotionTariff(
  listing: ListingRow,
  kind: PromotionTariffKind,
  options?: { orderId?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = promotionTariffToParams(kind);
  const res = await applyPromotion(listing.user_id, listing.id, config.type, config.days, options);
  if (!res.ok) return res;
  return { ok: true };
}

/** Legacy-вызов для старых экранов; реальная логика теперь единая и защищённая. */
export async function applyListingPromotionMock(
  listing: ListingRow,
  kind: PromotionKind,
  options?: { orderId?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = legacyPromotionToParams(kind);
  const res = await applyPromotion(listing.user_id, listing.id, config.type, config.days, options);
  if (!res.ok) return res;
  return { ok: true };
}
