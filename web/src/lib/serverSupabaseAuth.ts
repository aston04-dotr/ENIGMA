/**
 * Единый server-side слой для Supabase Auth: одинаковая обработка
 * getSession / getUser / фатальный refresh_token / локальный sign-out,
 * чтобы middleware и Route Handlers не расходились с клиентским lifecycle.
 */

import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
  isInvalidLocalRefreshTokenError,
  peekAuthApiErrorParts,
} from "@/lib/authRefreshErrors";
import { serverSignOutLocalStaleSession } from "@/lib/authStaleSessionCleanup";
import { createServerSupabase } from "@/lib/supabaseServer";

export type HardenedServerSessionOutcome = {
  session: Session | null;
  fatalRefreshCleared: boolean;
};

export type HardenedServerUserOutcome = {
  user: User | null;
  fatalRefreshCleared: boolean;
  authErrorMessage: string | null;
};

/**
 * Как middleware: синхронизирует cookie-jar через getSession, чистит битый refresh.
 */
export async function hardenedServerGetSession(
  supabase: SupabaseClient,
  trace: string,
): Promise<HardenedServerSessionOutcome> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error && isInvalidLocalRefreshTokenError(error)) {
      console.warn("[AUTH_REFRESH]", {
        stage: "server_getSession_fatal_refresh",
        trace,
        t: Date.now(),
        ...peekAuthApiErrorParts(error),
      });
      await serverSignOutLocalStaleSession(supabase, trace);
      return { session: null, fatalRefreshCleared: true };
    }
    return { session: data.session ?? null, fatalRefreshCleared: false };
  } catch (e: unknown) {
    if (isInvalidLocalRefreshTokenError(e)) {
      console.warn("[AUTH_REFRESH]", {
        stage: "server_getSession_throw_fatal_refresh",
        trace,
        t: Date.now(),
        ...peekAuthApiErrorParts(e),
      });
      await serverSignOutLocalStaleSession(supabase, `${trace}:throw`);
      return { session: null, fatalRefreshCleared: true };
    }
    throw e;
  }
}

/**
 * Для Route Handlers: валидация пользователя + тот же фатальный cleanup, что в middleware.
 */
export async function hardenedServerGetUser(
  supabase: SupabaseClient,
  trace: string,
): Promise<HardenedServerUserOutcome> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && isInvalidLocalRefreshTokenError(error)) {
      console.warn("[AUTH_REFRESH]", {
        stage: "server_getUser_fatal_refresh",
        trace,
        t: Date.now(),
        ...peekAuthApiErrorParts(error),
      });
      await serverSignOutLocalStaleSession(supabase, trace);
      return {
        user: null,
        fatalRefreshCleared: true,
        authErrorMessage: error.message,
      };
    }
    if (error || !data?.user) {
      return {
        user: null,
        fatalRefreshCleared: false,
        authErrorMessage: error?.message ?? (!data?.user ? "no_user" : null),
      };
    }
    return {
      user: data.user,
      fatalRefreshCleared: false,
      authErrorMessage: null,
    };
  } catch (e: unknown) {
    if (isInvalidLocalRefreshTokenError(e)) {
      console.warn("[AUTH_REFRESH]", {
        stage: "server_getUser_throw_fatal_refresh",
        trace,
        t: Date.now(),
        ...peekAuthApiErrorParts(e),
      });
      await serverSignOutLocalStaleSession(supabase, `${trace}:throw`);
      return {
        user: null,
        fatalRefreshCleared: true,
        authErrorMessage: peekAuthApiErrorParts(e).message,
      };
    }
    throw e;
  }
}

/** Один импорт в `route.ts`: клиент + user с hardened-семантикой. */
export async function resolveRouteHandlerSupabaseUser(trace: string): Promise<{
  supabase: SupabaseClient;
} & HardenedServerUserOutcome> {
  const supabase = await createServerSupabase();
  const outcome = await hardenedServerGetUser(supabase, trace);
  return { supabase, ...outcome };
}
