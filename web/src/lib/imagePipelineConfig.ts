/**
 * Лимиты pipeline (Sharp на сервере). Менять здесь и в коде пайплайна синхронно.
 */
/** Максимальная сторона главного файла после resize (до encode). */
export const LISTING_IMAGE_MAX_EDGE_PX = 1920;
export const LISTING_THUMB_MAX_EDGE_PX = 480;

export const CHAT_IMAGE_MAX_EDGE_PX = 1600;
export const CHAT_THUMB_MAX_EDGE_PX = 360;

/** Raw upload до Sharp (байты). */
export const MEDIA_UPLOAD_RAW_MAX_BYTES = 15 * 1024 * 1024;
