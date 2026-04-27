import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  isBackoffSkipped,
  isSupabaseReachable,
  withPostgrestBackoff,
} from "./supabaseHealth";
import { isSupabaseConfigured, supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushTokenForUser(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
        ?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = String(tokenData.data ?? "").trim();
    if (!token) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
    if (!isSupabaseConfigured) return;

    const out = await withPostgrestBackoff({
      checkSession: async () => {
        const { data } = await supabase.auth.getSession();
        return Boolean(data?.session?.access_token?.trim());
      },
      checkHealth: () => isSupabaseReachable(supabaseUrl, anonKey),
      logLabel: "expo push_tokens upsert",
      run: (signal) =>
        supabase
          .from("push_tokens")
          .upsert(
            { user_id: userId, token, provider: "expo" },
            { onConflict: "user_id,token" },
          )
          .abortSignal(signal),
    });
    if (isBackoffSkipped(out) || out.result.error) {
      // prod: тихо; dev: логи в withPostgrestBackoff
    }
  } catch {
    // тихо
  }
}
