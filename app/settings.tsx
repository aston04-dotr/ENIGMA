import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { UiButton } from "../components/UiButton";
import { UiInput } from "../components/UiInput";
import { useAuth } from "../context/auth-context";
import { useRedirectIfNeedsPhone } from "../hooks/useRedirectIfNeedsPhone";
import * as FileSystem from "expo-file-system/legacy";
import { safeGoBack } from "../lib/safeNavigation";
import { supabase } from "../lib/supabase";
import { colors, radius, shadow } from "../lib/theme";

function b64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export default function SettingsScreen() {
  useRedirectIfNeedsPhone();
  const router = useRouter();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [emailNotif, setEmailNotif] = useState(profile?.email_notifications !== false);

  React.useEffect(() => {
    setName(profile?.name ?? "");
  }, [profile?.name]);

  React.useEffect(() => {
    setEmailNotif(profile?.email_notifications !== false);
  }, [profile?.email_notifications]);

  async function onEmailNotifChange(v: boolean) {
    const uid = session?.user?.id;
    if (!uid) return;
    setEmailNotif(v);
    const { error } = await supabase.from("users").update({ email_notifications: v }).eq("id", uid);
    if (error) {
      setEmailNotif(!v);
      Alert.alert("Ошибка", error.message);
      return;
    }
    await refreshProfile();
  }

  async function saveName() {
    const uid = session?.user?.id;
    if (!uid) return;
    const n = name.trim();
    if (n.length < 2) {
      Alert.alert("Имя", "Слишком коротко");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("users").update({ name: n }).eq("id", uid);
    setSaving(false);
    if (error) Alert.alert("Ошибка", error.message);
    else {
      await refreshProfile();
      Alert.alert("Сохранено");
    }
  }

  async function changeAvatar() {
    const uid = session?.user?.id;
    if (!uid) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: Platform.OS === "ios",
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets[0]) return;
    try {
      setSaving(true);
      const uri = res.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      const path = `${uid}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("listing-images")
        .upload(path, b64ToBytes(base64), { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("users").update({ avatar: data.publicUrl }).eq("id", uid);
      if (dbErr) throw dbErr;
      await refreshProfile();
      Alert.alert("Аватар обновлён");
    } catch (e: unknown) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось загрузить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Настройки</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Аватар</Text>
        <Pressable onPress={changeAvatar} style={[styles.avatarBox, shadow.soft]}>
          {profile?.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPh}>
              <Text style={styles.avatarTx}>+</Text>
            </View>
          )}
          <Text style={styles.avatarHint}>Нажмите, чтобы сменить</Text>
        </Pressable>

        <UiInput label="Имя" value={name} onChangeText={setName} />
        <UiButton title="Сохранить имя" loading={saving} onPress={saveName} />

        <View style={{ height: 24 }} />

        <View style={[styles.notifRow, shadow.soft]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.notifTitle}>Получать уведомления на почту</Text>
            <Text style={styles.notifSub}>Новые сообщения в чате (если настроена почта в Supabase)</Text>
          </View>
          <Switch
            value={emailNotif}
            onValueChange={onEmailNotifChange}
            trackColor={{ false: colors.line, true: "rgba(109,40,217,0.45)" }}
            thumbColor={emailNotif ? colors.violet : "#f4f4f5"}
          />
        </View>

        <View style={{ height: 28 }} />

        <Text style={styles.label}>Продвижение</Text>
        <Pressable
          onPress={() => router.push("/settings-promotion")}
          style={styles.promoRow}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.promoTitle}>Продвижение объявлений</Text>
            <Text style={styles.promoSub}>Boost, VIP, сроки и оплата</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.92)" />
        </Pressable>

        <View style={{ height: 12 }} />

        <Pressable onPress={() => router.push("/settings-packages")} style={styles.promoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.promoTitle}>Пакеты объявлений</Text>
            <Text style={styles.promoSub}>Пакеты размещений и остаток слотов</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.92)" />
        </Pressable>

        <View style={{ height: 32 }} />

        <UiButton
          title="Выход"
          variant="outline"
          onPress={() =>
            signOut().then(() => {
              router.replace("/");
            })
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  scroll: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 10 },
  avatarBox: {
    alignItems: "center",
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPh: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTx: { fontSize: 40, color: colors.violet },
  avatarHint: { marginTop: 12, fontSize: 14, color: colors.muted },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  notifTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  notifSub: { marginTop: 6, fontSize: 13, color: colors.muted, lineHeight: 18 },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: "#2563eb",
    borderWidth: 1,
    borderColor: "#1d4ed8",
    marginBottom: 8,
  },
  promoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  promoSub: {
    marginTop: 6,
    fontSize: 14,
    color: "rgba(255,255,255,0.88)",
    lineHeight: 20,
  },
});
