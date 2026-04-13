import * as Linking from "expo-linking";
import { supabase } from "./supabase";

/**
 * Вход только по ссылке из письма (magic link). В Supabase: Authentication → Email → шаблон «Magic Link»;
 * в URL Redirects добавьте схему приложения, например enigma:// и exp://… (dev).
 */
export async function signInWithMagicLink(email: string) {
  const trimmed = email.trim().toLowerCase();
  const emailRedirectTo = Linking.createURL("/");
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("MAGIC LINK emailRedirectTo (add to Supabase Redirect URLs)", emailRedirectTo);
  }
  return supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo,
    },
  });
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
