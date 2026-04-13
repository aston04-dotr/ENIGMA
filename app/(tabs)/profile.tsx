import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/auth-context";
import { categoryLabel } from "../../lib/categories";
import {
  subscribeListingCreated,
  subscribeListingPromotionApplied,
} from "../../lib/listingPromotionEvents";
import { fetchListingsForUser } from "../../lib/listings";
import { openListing } from "../../lib/openListing";
import { colors, radius, shadow } from "../../lib/theme";
import type { ListingRow } from "../../lib/types";

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setListings([]);
      return;
    }
    const rows = await fetchListingsForUser(uid);
    setListings(rows);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const u1 = subscribeListingPromotionApplied(() => {
      void load();
    });
    const u2 = subscribeListingCreated(() => {
      void load();
    });
    return () => {
      u1();
      u2();
    };
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headRow}>
        <Text style={styles.h1}>Профиль</Text>
        <Pressable onPress={() => router.push("/settings")} hitSlop={12} style={styles.gear}>
          <Ionicons name="settings-outline" size={24} color={colors.ink} />
        </Pressable>
      </View>

      <View style={[styles.card, shadow.card]}>
        <Pressable onPress={() => router.push("/settings")}>
          {profile?.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPh}>
              <Text style={styles.avatarTx}>{(profile?.name ?? "?").slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <Text style={styles.name}>{profile?.name ?? "—"}</Text>
        <Text style={styles.pid}>ID: {profile?.public_id ?? "—"}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
      </View>

      <Text style={styles.section}>Мои объявления</Text>
      <FlatList
        style={{ flex: 1 }}
        data={listings}
        keyExtractor={(l) => l.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            tintColor={colors.violet}
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>Пока нет объявлений</Text>}
        renderItem={({ item }) => {
          if (!item?.id) return null;
          const imgs = [...(item.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const uri = imgs[0]?.url;
          return (
            <Pressable
              onPress={() => openListing(item.id)}
              style={[styles.lrow, shadow.soft]}
              android_ripple={{ color: "#00000010" }}
            >
              {uri ? <Image source={{ uri }} style={styles.limg} /> : <View style={[styles.limg, styles.limgPh]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.ltitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.lmeta}>
                  {categoryLabel(item.category)} · {item.city}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  h1: { fontSize: 28, fontWeight: "700", color: colors.ink },
  gear: { padding: 8 },
  card: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPh: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTx: { fontSize: 32, fontWeight: "700", color: colors.violet },
  name: { marginTop: 14, fontSize: 22, fontWeight: "700", color: colors.ink },
  pid: { marginTop: 6, fontSize: 14, color: colors.muted, letterSpacing: 1 },
  email: { marginTop: 4, fontSize: 14, color: colors.muted },
  section: { fontSize: 18, fontWeight: "700", color: colors.ink, paddingHorizontal: 20, marginBottom: 12 },
  empty: { color: colors.muted, paddingVertical: 20, textAlign: "center" },
  lrow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  limg: { width: 64, height: 64, borderRadius: radius.sm, marginRight: 12 },
  limgPh: { backgroundColor: colors.surface2 },
  ltitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  lmeta: { marginTop: 4, fontSize: 13, color: colors.muted },
});
