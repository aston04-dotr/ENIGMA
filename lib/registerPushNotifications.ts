import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

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
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;
    if (!token) return;

    const { error } = await supabase.from("push_tokens").upsert(
      { user_id: userId, token },
      { onConflict: "user_id,token" }
    );
    if (error && __DEV__) console.warn("push_tokens upsert", error.message);
  } catch (e) {
    if (__DEV__) console.warn("registerPushTokenForUser", e);
  }
}
