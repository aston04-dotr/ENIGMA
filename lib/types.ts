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
  user_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  city: string;
};

export type ListingRow = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  city: string;
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
  /** Число строк в `favorites` (RPC `listing_favorites_counts`), для ленты. */
  favorite_count?: number;
  images?: { url: string; sort_order?: number }[];
};

export type ChatRow = {
  id: string;
  user1: string | null;
  user2: string | null;
  created_at: string;
  title?: string | null;
  is_group?: boolean | null;
  pinned_message_id?: string | null;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  image_url: string | null;
  voice_url?: string | null;
  created_at: string;
  /** sent | delivered | seen */
  status?: string | null;
  payload?: unknown;
  reply_to?: string | null;
  edited_at?: string | null;
  deleted?: boolean | null;
  hidden_for_user_ids?: string[] | null;
};
