import { supabase } from "./supabase";

let magicLinkInFlight: Promise<void> | null = null;
let lastSuccessHref: string | null = null;

/**
 * Complete magic link authentication from the current URL.
 * Handles the code exchange and sets up the session.
 * Serialized to prevent duplicate exchanges.
 */
export async function completeMagicLinkFromHref(href: string): Promise<void> {
  const url = new URL(href);
  const code = url.searchParams.get("code");

  // Skip if no code or already processed this URL
  if (!code) {
    console.log("[magicLink] No code in URL, skipping");
    return;
  }

  if (href === lastSuccessHref) {
    console.log("[magicLink] Already processed this URL");
    return;
  }

  // Serialize concurrent calls
  if (magicLinkInFlight) {
    console.log("[magicLink] Waiting for in-flight exchange...");
    await magicLinkInFlight;
    return;
  }

  magicLinkInFlight = runMagicLinkExchange(code, href).finally(() => {
    magicLinkInFlight = null;
  });

  await magicLinkInFlight;
}

async function runMagicLinkExchange(code: string, href: string): Promise<void> {
  console.log("[magicLink] Starting code exchange...");

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[magicLink] Exchange failed:", error.message);
      throw error;
    }

    if (!data.session) {
      console.error("[magicLink] No session returned");
      throw new Error("No session returned");
    }

    console.log("[magicLink] Success! User:", data.session.user.email);
    lastSuccessHref = href;

    // Clear code from URL without page reload
    const url = new URL(href);
    url.searchParams.delete("code");
    window.history.replaceState({}, document.title, url.toString());
  } catch (err) {
    console.error("[magicLink] Exchange error:", err);
    throw err;
  }
}

/**
 * Check if current URL contains a magic link code
 */
export function hasMagicLinkCode(href: string): boolean {
  const url = new URL(href);
  return url.searchParams.has("code");
}
