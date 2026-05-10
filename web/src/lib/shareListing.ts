import { getRedirectSiteOrigin } from "@/lib/runtimeConfig";

export type ShareListingUrlResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Абсолютная ссылка на карточку для шаринга: в prod — канонический origin из env, в dev — текущее окно.
 */
export function buildListingShareUrl(listingId: string): string {
  const id = String(listingId ?? "").trim();
  if (!id) return "";
  const origin =
    typeof window !== "undefined" && process.env.NODE_ENV !== "production"
      ? window.location.origin
      : getRedirectSiteOrigin();
  return `${origin.replace(/\/+$/, "")}/listing/${id}`;
}

/**
 * Текст для Web Share API: многие цели (Telegram, часть клиентов Android) игнорируют поле `url`
 * и отправляют только `text`, поэтому ссылку дублируем в тексте.
 */
function shareBodyText(title: string, url: string): string {
  const cleanUrl = url.trim();
  const t = title.trim() || "Объявление Enigma";
  return `${t}\n\n${cleanUrl}`;
}

/**
 * Системный share sheet если есть; иначе копируем именно полный URL (открываемый в браузере).
 */
export async function shareListingUrl(params: {
  url: string;
  title?: string;
}): Promise<ShareListingUrlResult> {
  const url = typeof params.url === "string" ? params.url.trim() : "";
  if (!url) return "failed";

  const title =
    typeof params.title === "string" && params.title.trim() !== ""
      ? params.title.trim()
      : "Объявление Enigma";

  const text = shareBodyText(title, url);

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      /** `url` для нативного sheet/iOS; `text` со ссылкой — для Telegram и др. */
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      const name =
        e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
      if (name === "AbortError") return "cancelled";
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    /* fallthrough */
  }

  return "failed";
}
