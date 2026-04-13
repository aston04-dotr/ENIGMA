import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

function b64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function uploadListingPhoto(userId: string, listingId: string, uri: string, index: number) {
  const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/${listingId}/${Date.now()}_${index}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const body = b64ToBytes(base64);
  const contentType = guessMime(uri);
  const { error } = await supabase.storage.from("listing-images").upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  return data.publicUrl;
}

/** Чат: bucket `images` (миграция 012). */
export async function uploadChatImage(userId: string, uri: string) {
  const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${userId}/chat/${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const body = b64ToBytes(base64);
  const contentType = guessMime(uri);
  const { error } = await supabase.storage.from("images").upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}

/** @deprecated используйте uploadChatImage (bucket `images`). */
export async function uploadChatPhoto(userId: string, uri: string) {
  return uploadChatImage(userId, uri);
}

/** Голосовые: bucket `voices`, m4a. */
export async function uploadChatVoice(userId: string, uri: string) {
  const name = `voice-${Date.now()}.m4a`;
  const path = `${userId}/${name}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const body = b64ToBytes(base64);
  const { error } = await supabase.storage.from("voices").upload(path, body, {
    contentType: "audio/m4a",
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("voices").getPublicUrl(path);
  return data.publicUrl;
}
