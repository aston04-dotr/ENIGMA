import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { colors } from "../../lib/theme";

/** Старый экран SMS — устарел; вход только по email. */
export default function VerifyScreen() {
  const router = useRouter();

  useEffect(() => {
    if (__DEV__) console.warn("verify (SMS) deprecated; use email auth");
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Вход по номеру отключён</Text>
        <Text style={styles.sub}>Используйте вход по email — мы отправим код на почту.</Text>
      </View>
      <UiButton title="Войти по email" onPress={() => router.replace("/(auth)/email")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 8 },
  header: { marginBottom: 28, marginTop: 16 },
  title: { fontSize: 22, fontWeight: "700", color: colors.ink },
  sub: { marginTop: 10, fontSize: 16, color: colors.muted, lineHeight: 22 },
});
