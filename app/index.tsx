import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../components/UiButton";
import { useAuth } from "../context/auth-context";
import { isSupabaseConfigured } from "../lib/supabase";
import { colors, radius } from "../lib/theme";

export default function WelcomeScreen() {
  const router = useRouter();
  const { session, loading, authResolved } = useAuth();

  useEffect(() => {
    if (!authResolved || loading) return;
    console.log("SESSION", session);
    if (!session) {
      console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "EMAIL");
      router.replace("/(auth)/email");
      return;
    }
    console.log("REDIRECT → EMAIL / PHONE / PROFILE / TABS", "TABS");
    router.replace("/(tabs)");
  }, [session, loading, authResolved, router]);

  return (
    <LinearGradient colors={[colors.navy, "#2d2659", colors.violet]} style={styles.grad}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.logo}>ENIGMA</Text>
          <Text style={styles.tag}>Объявления без лишнего шума</Text>
        </View>
        <View style={styles.footer}>
          {!isSupabaseConfigured ? (
            <Text style={styles.warn}>
              Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env
            </Text>
          ) : null}
          <UiButton
            title="Начать"
            onPress={() => router.push("/(auth)/email")}
            style={styles.btn}
            textStyle={{ fontSize: 18 }}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  grad: { flex: 1 },
  safe: { flex: 1, justifyContent: "space-between" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  logo: {
    fontSize: 44,
    fontWeight: "200",
    color: "#fff",
    letterSpacing: 14,
  },
  tag: {
    marginTop: 16,
    fontSize: 16,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 24,
  },
  footer: { padding: 24, paddingBottom: 40 },
  btn: { overflow: "hidden", borderRadius: radius.lg },
  warn: { color: "rgba(255,255,255,0.9)", textAlign: "center", marginBottom: 16, fontSize: 13 },
});
