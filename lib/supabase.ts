import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const url =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl ??
  "";
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  (Constants.expoConfig?.extra as { supabaseAnonKey?: string } | undefined)?.supabaseAnonKey ??
  "";

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Пустые значения ломают createClient — значения по умолчанию, чтобы UI открывался без .env (запросы к API не пройдут). */
const DEV_URL = "https://placeholder.supabase.co";
const DEV_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlbmlnbWEtbG9jYWwiLCJyb2xlIjoiYW5vbiJ9.dummy";

export const supabase = createClient(isSupabaseConfigured ? url : DEV_URL, isSupabaseConfigured ? anonKey : DEV_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: isSupabaseConfigured,
    persistSession: isSupabaseConfigured,
    detectSessionInUrl: false,
  },
});
