import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { UiInput } from "../../components/UiInput";
import { useAuth } from "../../context/auth-context";
import { isDevPreviewSignInAvailable, signInDevPreviewWithoutSms } from "../../lib/devPreviewSignIn";
import { checkAccessBlocked } from "../../lib/bans";
import { normalizeProfilePhone } from "../../lib/phoneProfile";
import { decreaseTrust } from "../../lib/trust";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { colors } from "../../lib/theme";

/**
 * Телефон только в профиле (не для входа). Формат: + и ≥10 цифр.
 */
export default function ProfilePhoneScreen() {
  const router = useRouter();
  const { session, loading, authResolved, profile, refreshProfile, needsPhone, needsName } = useAuth();
  const [raw, setRaw] = useState("+");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session) {
      router.replace("/(auth)/email");
      return;
    }
    if (session) {
      router.replace("/(tabs)");
    }
  }, [authResolved, loading, session, router]);

  async function save() {
    if (saving) return;

    setErr("");
    const formattedPhone = normalizeProfilePhone(raw);

    if (!formattedPhone) {
      Alert.alert("Введите номер");
      setErr("Введите номер");
      return;
    }

    const existingPhone = profile?.phone?.trim();
    const updatedAt = profile?.phone_updated_at;

    if (existingPhone && formattedPhone === existingPhone) {
      Alert.alert("Этот номер уже указан");
      return;
    }

    if (existingPhone && formattedPhone !== existingPhone && updatedAt) {
      const lastUpdate = new Date(updatedAt);
      const now = new Date();
      const diffDays = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 60) {
        Alert.alert("Номер", `Сменить номер можно через ${Math.ceil(60 - diffDays)} дней`);
        return;
      }
    }

    console.log("PHONE SUBMIT START", formattedPhone);
    setSaving(true);

    try {
      const { data: authData, error: authGetErr } = await supabase.auth.getUser();
      if (authGetErr) console.log("GET USER WARN", authGetErr);

      const user = authData.user;
      if (!user) {
        console.error("NO USER SESSION");
        Alert.alert("Ошибка: нет сессии");
        return;
      }
      console.log("CURRENT USER", user);

      const blocked = await checkAccessBlocked(user.email, formattedPhone, profile?.device_id ?? null);
      if (blocked) {
        Alert.alert("Доступ ограничен. Обратитесь в поддержку.");
        await supabase.auth.signOut();
        return;
      }

      console.log("TRY SAVE PHONE", formattedPhone);

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email: user.email ?? null,
            phone: formattedPhone,
            phone_updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      console.log("SAVE RESULT", data);
      console.log("SAVE ERROR", error);

      if (error) {
        console.error("PHONE SAVE ERROR", error);
        if (error.code === "23505") {
          void decreaseTrust(user.id, 10);
          Alert.alert("Этот номер уже используется");
        } else {
          Alert.alert("Ошибка сохранения номера");
        }
        return;
      }

      const { error: uErr } = await supabase.from("users").upsert(
        {
          id: user.id,
          email: user.email ?? null,
          phone: formattedPhone,
        },
        { onConflict: "id" }
      );
      if (uErr) {
        console.error("USERS MIRROR ERROR", uErr);
      }

      await refreshProfile();
      console.log("PHONE SAVED OK");
      router.replace("/(tabs)");
    } catch (e) {
      console.error("PHONE SAVE CATCH", e);
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Повторите попытку");
    } finally {
      setSaving(false);
    }
  }

  async function devEnterWithoutSms() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await signInDevPreviewWithoutSms();
      if ("error" in res) {
        Alert.alert("Вход без SMS", res.error);
        return;
      }
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Text style={styles.title}>Ваш телефон</Text>
          <Text style={styles.sub}>Нужен для связи по объявлениям. Вход только по email.</Text>
        </View>
        <UiInput
          label="Телефон"
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="+7 900 000-00-00"
          value={raw}
          onChangeText={setRaw}
          error={err}
        />
        <UiButton title="Сохранить" loading={saving} disabled={saving} onPress={save} />
        {isDevPreviewSignInAvailable && isSupabaseConfigured ? (
          <>
            <View style={{ height: 20 }} />
            <Text style={styles.devHint}>Режим разработки</Text>
            <UiButton
              title="Войти без SMS (просмотр)"
              variant="outline"
              loading={saving}
              disabled={saving}
              onPress={devEnterWithoutSms}
            />
          </>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 8 },
  flex: { flex: 1 },
  header: { marginBottom: 28, marginTop: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink, letterSpacing: -0.5 },
  sub: { marginTop: 10, fontSize: 16, color: colors.muted, lineHeight: 22 },
  devHint: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
});
