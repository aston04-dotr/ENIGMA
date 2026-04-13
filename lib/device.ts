import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const STORAGE_KEY = "device_id";

/** Stable id: AsyncStorage + Android ID / iOS IDFV when available. */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(STORAGE_KEY);
  if (id) return id;

  try {
    if (Platform.OS === "android") {
      try {
        const aid = Application.getAndroidId();
        if (typeof aid === "string" && aid.length > 0) id = `a:${aid}`;
      } catch {
        /* Expo Go / web */
      }
    } else if (Platform.OS === "ios") {
      const idfv = await Application.getIosIdForVendorAsync();
      if (idfv) id = `i:${idfv}`;
    }
  } catch {
    /* web */
  }

  if (!id) {
    id = `x:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}

export async function rpcCheckDeviceBanned(deviceId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_device_banned", { p_device: deviceId });
  if (error) {
    console.log("DEVICE BAN CHECK ERROR", error);
    return false;
  }
  return data === true;
}

export async function rpcCountProfilesForDevice(deviceId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_profiles_for_device", { p_device: deviceId });
  if (error) {
    console.log("DEVICE COUNT ERROR", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
