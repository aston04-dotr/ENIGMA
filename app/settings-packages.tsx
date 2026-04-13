import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/auth-context";
import { useRedirectIfNeedsPhone } from "../hooks/useRedirectIfNeedsPhone";
import { computePackageEconomics, LISTING_PACKAGES } from "../lib/packages";
import { safeGoBack } from "../lib/safeNavigation";
import { colors, radius, shadow } from "../lib/theme";

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SettingsPackagesScreen() {
  useRedirectIfNeedsPhone();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  const re = profile?.real_estate_package_count ?? 0;
  const au = profile?.auto_package_count ?? 0;
  const ot = profile?.other_package_count ?? 0;

  function buy(p: (typeof LISTING_PACKAGES)[number]) {
    if (!session?.user?.id) {
      router.push("/(auth)/email");
      return;
    }
    router.push({
      pathname: "/payment",
      params: {
        paymentType: "package",
        packageType: p.kind,
        amount: String(p.priceRub),
        title: p.headline,
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.headTitle}>Пакеты объявлений</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!session?.user?.id ? (
          <Text style={styles.hint}>Войдите, чтобы покупать пакеты и видеть остаток.</Text>
        ) : (
          <View style={[styles.balanceCard, shadow.soft]}>
            <Text style={styles.balanceTitle}>Ваши пакеты</Text>
            <Text style={styles.balanceLine}>
              Недвижимость: <Text style={styles.balanceNum}>{re}</Text> осталось
            </Text>
            <Text style={styles.balanceLine}>
              Авто: <Text style={styles.balanceNum}>{au}</Text> осталось
            </Text>
            <Text style={styles.balanceLine}>
              Объявления: <Text style={styles.balanceNum}>{ot}</Text> осталось
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Выберите пакет</Text>

        {LISTING_PACKAGES.map((p) => {
          const { savingsRub } = computePackageEconomics(p);
          return (
            <View key={p.kind} style={[styles.pkgCard, shadow.soft]}>
              {p.bestValue ? (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeTx}>ЛУЧШАЯ ВЫГОДА</Text>
                </View>
              ) : null}
              <View style={styles.pkgHead}>
                <Text style={styles.pkgEmoji}>{p.emoji}</Text>
                <Text style={styles.pkgCat}>{p.cardTitle}</Text>
              </View>
              <Text style={styles.pkgTitle}>{p.headline}</Text>
              <Text style={styles.pkgDesc}>{p.slotsLabel}</Text>
              <Text style={styles.pkgPrice}>{formatRub(p.priceRub)}</Text>
              {savingsRub > 0 ? (
                <Text style={styles.pkgSave}>Выгоднее на {formatRub(savingsRub)}</Text>
              ) : null}
              <Pressable style={styles.buyBtn} onPress={() => buy(p)}>
                <Text style={styles.buyBtnTx}>Купить</Text>
              </Pressable>
              <Text style={styles.buyMicro}>идеально для тех, кто размещает много объявлений</Text>
            </View>
          );
        })}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  hint: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 20 },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 28,
  },
  balanceTitle: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 14 },
  balanceLine: { fontSize: 15, color: colors.muted, marginBottom: 8, lineHeight: 22 },
  balanceNum: { fontWeight: "800", color: "#2563eb" },
  sectionLabel: { fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 14 },
  pkgCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 16,
  },
  bestBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.35)",
  },
  bestBadgeTx: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563eb",
    letterSpacing: 0.6,
  },
  pkgHead: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  pkgEmoji: { fontSize: 22, marginRight: 10 },
  pkgCat: { fontSize: 15, fontWeight: "600", color: colors.muted },
  pkgTitle: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: 6 },
  pkgDesc: { fontSize: 15, color: colors.muted, marginBottom: 12 },
  pkgPrice: { fontSize: 26, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  pkgSave: { marginTop: 8, fontSize: 14, color: "#16a34a", fontWeight: "600" },
  buyBtn: {
    marginTop: 18,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  buyBtnTx: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  buyMicro: {
    marginTop: 12,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 17,
  },
});
