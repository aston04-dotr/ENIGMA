import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { UiInput } from "../../components/UiInput";
import { signInWithMagicLink } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase";
import { colors } from "../../lib/theme";
import { isOptionalEmailValid } from "../../lib/validate";

export default function EmailAuthScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function sendLink() {
    setErr("");
    const em = email.trim().toLowerCase();
    if (!em || !isOptionalEmailValid(em)) {
      setErr("Введите корректный email");
      return;
    }
    if (!isSupabaseConfigured) {
      Alert.alert("Настройка", "Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env");
      return;
    }
    setLoading(true);
    const { error } = await signInWithMagicLink(em);
    setLoading(false);
    if (error) {
      Alert.alert("Ошибка", error.message);
      return;
    }
    setSent(true);
    Alert.alert(
      "Письмо отправлено",
      "Откройте письмо и нажмите на ссылку для входа. Код вводить не нужно."
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Text style={styles.title}>Вход по email</Text>
          <Text style={styles.sub}>
            Отправим ссылку для входа. После нажатия на ссылку в письме приложение откроется и вы войдёте
            автоматически — код не нужен.
          </Text>
        </View>
        <UiInput
          label="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (err) setErr("");
          }}
          error={err}
        />
        {sent ? (
          <Text style={styles.hint}>Проверьте почту и перейдите по ссылке из письма.</Text>
        ) : null}
        <UiButton title="Получить ссылку" loading={loading} onPress={sendLink} />
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
  hint: { marginBottom: 16, fontSize: 15, color: colors.violetLight, lineHeight: 22 },
});
