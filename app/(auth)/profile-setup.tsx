import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { UiInput } from "../../components/UiInput";
import { useAuth } from "../../context/auth-context";
import { supabase } from "../../lib/supabase";
import { colors } from "../../lib/theme";

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile, needsPhone, needsProfileSetup, loading, authResolved } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authResolved || loading) return;
    if (!session) {
      router.replace("/(auth)/email");
      return;
    }
    if (needsPhone) {
      router.replace("/(auth)/phone");
    }
  }, [authResolved, loading, session, needsPhone, router]);

  useEffect(() => {
    if (!authResolved || loading) return;
    if (session && !needsProfileSetup) {
      router.replace("/(tabs)");
    }
  }, [authResolved, loading, session, needsProfileSetup, router]);

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile]);

  async function save() {
    const n = name.trim();
    if (n.length < 2) {
      Alert.alert("Имя", "Введите имя хотя бы из 2 букв");
      return;
    }
    const uid = session?.user?.id;
    if (!uid) {
      Alert.alert("Сессия", "Войдите снова");
      return;
    }
    const sessionEmail = session.user.email?.trim() || null;
    setSaving(true);
    try {
      const { error } = await supabase.from("users").upsert(
        {
          id: uid,
          name: n,
          email: sessionEmail,
          phone: profile?.phone ?? null,
        },
        { onConflict: "id" }
      );
      if (error) {
        Alert.alert("Не сохранилось", error.message);
        return;
      }
      if (sessionEmail) {
        await supabase.from("profiles").upsert({ id: uid, email: sessionEmail }, { onConflict: "id" });
      }
      await refreshProfile();
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Повторите попытку");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Почти готово</Text>
            <Text style={styles.sub}>Вход по email уже есть. Укажите имя — его увидят другие пользователи.</Text>
          </View>
          <UiInput
            label="Ваше имя"
            placeholder="Александр"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={{ height: 8 }} />
          <UiButton title="Продолжить" loading={saving} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  sub: { marginTop: 10, fontSize: 16, color: colors.muted, lineHeight: 22 },
});
