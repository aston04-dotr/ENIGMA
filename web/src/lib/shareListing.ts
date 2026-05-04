export type ShareListingUrlResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Uses the system share sheet when available; otherwise copies the URL to the clipboard.
 */
export async function shareListingUrl(params: {
  url: string;
  title?: string;
}): Promise<ShareListingUrlResult> {
  const { url } = params;
  const title =
    typeof params.title === "string" && params.title.trim() !== ""
      ? params.title.trim()
      : "Объявление Enigma";

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: title, url });
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
