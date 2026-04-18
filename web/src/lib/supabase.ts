"use client";

import type { LockFunc } from "@supabase/auth-js";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./runtimeConfig";

const { url, anonKey, configured } = getSupabasePublicConfig();

let browserClient: SupabaseClient | null = null;

/**
 * GoTrue по умолчанию использует Web Locks API + lockAcquireTimeout: при параллельных
 * getSession / refresh / PostgREST с JWT один запрос «отбирает» lock → ошибка
 * "Lock ... was released because another request stole it" и падают profiles/listings.
 * In-process очередь убирает гонки в одной вкладке (основной кейс PWA).
 */
let authStorageMutex = Promise.resolve();

/** Сериализация всех операций с токеном в одной вкладке (см. комментарий выше). */
const authQueueLock: LockFunc = async (_name, _acquireTimeout, fn) => {
  const next = authStorageMutex.then(() => fn());
  authStorageMutex = next.then(
    () => undefined,
    () => undefined
  );
  return await next;
};

function getBrowserSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey, {
      auth: {
        lock: authQueueLock,
      },
    });
  }
  return browserClient;
}

export const supabase = getBrowserSupabaseClient();

export const isSupabaseConfigured = configured;
