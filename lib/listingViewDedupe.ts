import AsyncStorage from "@react-native-async-storage/async-storage";

/** Ключ на устройстве: одно засчитывание просмотра на объявление (анти-накрутка). */
export function viewedStorageKey(listingId: string): string {
  return `viewed_${listingId}`;
}

export async function hasDeviceViewFlag(viewedKey: string): Promise<boolean> {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(viewedKey) === "1";
    }
    const v = await AsyncStorage.getItem(viewedKey);
    return v === "1";
  } catch {
    return false;
  }
}

export async function setDeviceViewFlag(viewedKey: string): Promise<void> {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(viewedKey, "1");
    } else {
      await AsyncStorage.setItem(viewedKey, "1");
    }
  } catch {
    /* ignore */
  }
}
