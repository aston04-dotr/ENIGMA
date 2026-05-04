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
  /** Уведомления о сообщениях в чате на email / push. */
  email_notifications?: boolean | null;
  /** Антискам: 100 по умолчанию, при 0 — авто-бан (см. миграцию 018). */
  trust_score?: number | null;
};

export type ListingInsertPayload = {
  title: string;
  description: string;
  price: number;
  category: string;
  city: string;
  user_id: string;
  owner_id: string;
  /** Структурированные параметры объявления (для фильтров/поиска). */
  params?: Record<string, unknown> | null;
  /** Контактный телефон продавца (копируется из profiles.phone). */
  contact_phone?: string | null;
  /** Недвижимость: подтип коммерческого помещения. */
  commercial_type?: string | null;
  has_gas?: boolean;
  has_water?: boolean;
  has_electricity?: boolean;
  has_sewage?: boolean;
  comms_gas?: boolean;
  comms_water?: boolean;
  comms_electricity?: string | null;
  comms_sewage?: boolean;
  /** Площадь участка (текст). */
  plot_area?: string | null;
  /** Участок: вид разрешённого использования. */
  land_type?: string | null;
  /** Участок: статус собственности / аренды. */
  land_ownership_status?: string | null;
  /** sale | rent */
  deal_type?: string | null;
  /** Авто: мощность (л.с.), текст. */
  engine_power?: string | null;
  /** Авто: объём двигателя (л), текст. */
  engine_volume?: string | null;
  /** Мото: тип (Спортивный, Чоппер, …). */
  moto_type?: string | null;
  /** Мото: двигатель (Бензиновый / Электрический). */
  moto_engine?: string | null;
  /** Мото: пробег (текст, км). */
  moto_mileage?: string | null;
  /** Мото: растаможен (Да / Нет). */
  moto_customs_cleared?: string | null;
  /** Мото: владельцев по ПТС (1, 2, 3+). */
  moto_owners_pts?: string | null;
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
  commercial_type?: string | null;
  deal_type?: string | null;
  has_gas?: boolean | null;
  has_water?: boolean | null;
  has_electricity?: boolean | null;
  has_sewage?: boolean | null;
  comms_gas?: boolean | null;
  comms_water?: boolean | null;
  comms_electricity?: string | null;
  comms_sewage?: boolean | null;
  plot_area?: string | null;
  land_type?: string | null;
  land_ownership_status?: string | null;
  engine_power?: string | null;
  engine_volume?: string | null;
  moto_type?: string | null;
  moto_engine?: string | null;
  moto_mileage?: string | null;
  moto_customs_cleared?: string | null;
  moto_owners_pts?: string | null;
  /** Структурированные параметры объявления (jsonb). */
  params?: Record<string, unknown> | null;
  images?: { url: string; sort_order?: number }[];
  /** Безопасно нормализованный продавец для страницы объявления. */
  seller?: UserRow | null;
};

export type ChatRow = {
  id: string;
  listing_id: string | null;
  created_at: string;
  last_message_at?: string | null;
  title?: string | null;
  is_group?: boolean | null;
};

export type ChatMemberRow = {
  chat_id: string;
  user_id: string;
  role?: string | null;
  joined_at?: string | null;
  last_read_at?: string | null;
  last_read_message_id?: string | null;
};

export type MessageStatus = "sent" | "delivered" | "seen";

export type MessageType = "text" | "image";

/** Поля, совпадающие с `public.messages` (recipient_id в схеме нет). Клиент-only поля — с пометками ниже. */
export type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  /** Тип с сервера: text | image. */
  type?: MessageType;
  image_url?: string | null;
  /** Клиент: оптимистичная отправка картинки, пока идёт upload. */
  pendingUpload?: boolean;
  /** Клиент: upload/insert не удался — показать retry. */
  imageUploadFailed?: boolean;
  /** Клиент: 0–100 при upload (сеть). */
  imageUploadProgress?: number;
  /** Клиент: w/h, чтобы удержать aspect-ratio бокса до onLoad. */
  imageAspectRatio?: number;
  voice_url?: string | null;
  reply_to?: string | null;
  edited_at?: string | null;
  deleted?: boolean;
  deleted_at?: string | null;
  hidden_for_user_ids?: string[];
  status?: MessageStatus | string | null;
  /** Получатель отметил доставку (✓✓ серые). */
  delivered_at?: string | null;
  /** Собеседник прочитал (✓✓ фиолетовые). */
  read_at?: string | null;
};

/**
 * Список чатов: `list_my_chats` сейчас отдаёт только id / buyer / seller / created_at;
 * поля превью и имени — опциональны, доезжают с Realtime/истории или подставляются в UI.
 */
export type ChatListRow = {
  chat_id: string;
  /** Из RPC `chats` (1:1) */
  buyer_id: string | null;
  seller_id: string | null;
  created_at: string;
  listing_id?: string | null;
  listing_image?: string | null;
  is_group?: boolean;
  title?: string | null;
  other_user_id?: string | null;
  other_name?: string | null;
  other_avatar?: string | null;
  other_public_id?: string | null;
  last_message_id?: string | null;
  last_message_text?: string | null;
  last_message_sender_id?: string | null;
  last_message_created_at?: string | null;
  last_message_image_url?: string | null;
  last_message_voice_url?: string | null;
  last_message_deleted?: boolean | null;
  last_message_at?: string | null;
  unread_count?: number;
};

export type ChatUnreadSnapshot = {
  rows: ChatListRow[];
  totalUnread: number;
};

export type PushTokenRow = {
  user_id: string;
  token: string;
  provider?: "expo" | "webpush" | string;
  subscription?: Record<string, unknown> | null;
  user_agent?: string | null;
  last_seen_at?: string | null;
  created_at?: string | null;
};
