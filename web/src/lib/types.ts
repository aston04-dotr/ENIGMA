export type UserRow = {
  id: string;
  phone: string | null;
  /** Из `profiles.phone_updated_at` (смена номера / первый ввод). */
  phone_updated_at?: string | null;
  /** Из `profiles.device_id` (отпечаток устройства). */
  device_id?: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
  public_id: string;
  created_at: string;
  /** Остатки пакетов размещения (после миграции 006_listing_packages). */
  real_estate_package_count?: number | null;
  auto_package_count?: number | null;
  other_package_count?: number | null;
  /** Уведомления о сообщениях в чате на email (Edge Function + webhook). */
  email_notifications?: boolean | null;
  /** Антискам: 100 по умолчанию, при 0 — авто-бан (см. миграцию 018). */
  trust_score?: number | null;
};

/** INSERT в `public.listings`: без `id` (default gen_random_uuid). В БД колонка `city`, не `location`; поля `status` нет. */
export type ListingInsertPayload = {
  title: string;
  description: string;
  price: number;
  category: string;
  city: string;
  /** Контактный телефон продавца (копируется из profiles.phone). */
  contact_phone?: string | null;
};

export type ListingRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  city: string | null;
  view_count: number;
  created_at: string;
  updated_at?: string | null;
  is_vip?: boolean | null;
  vip_until?: string | null;
  is_top?: boolean | null;
  top_until?: string | null;
  boosted_at?: string | null;
  /** Дата окончания поднятия (BOOST активен пока > now). */
  boosted_until?: string | null;
  /** Рекламное размещение партнёра (после миграции 007). */
  is_partner_ad?: boolean | null;
  /** Флаг буста для сортировки ленты (миграция 022). */
  is_boosted?: boolean | null;
  /** Число строк в `listing_favorites` (RPC `listing_favorites_counts`), для ленты. */
  favorite_count?: number;
  /** Контактный телефон продавца (копируется из profiles.phone при создании). */
  contact_phone?: string | null;
  images?: { url: string; sort_order?: number }[];
  /** Безопасно нормализованный продавец для страницы объявления. */
  seller?: UserRow | null;
};

export type ChatRow = {
  id: string;
  listing_id: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};
