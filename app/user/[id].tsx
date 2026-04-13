import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRedirectIfNeedsPhone } from "../../hooks/useRedirectIfNeedsPhone";
import { categoryLabel } from "../../lib/categories";
import { fetchListingsForUser } from "../../lib/listings";
import { openListing } from "../../lib/openListing";
import { safeGoBack } from "../../lib/safeNavigation";
import { supabase } from "../../lib/supabase";
import { colors, radius, shadow } from "../../lib/theme";
import type { ListingRow, UserRow } from "../../lib/types";

export default function PublicUserScreen() {
  useRedirectIfNeedsPhone();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserRow | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: u } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    setUser(u as UserRow | null);
    const rows = await fetchListingsForUser(String(id));
    setListings(rows);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => safeGoBack(router)} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.muted}>Загрузка…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => safeGoBack(router)} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.muted}>Пользователь не найден</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Pressable onPress={() => safeGoBack(router)} style={styles.back}>
        <Ionicons name="chevron-back" size={28} color={colors.ink} />
      </Pressable>
      <View style={[styles.card, shadow.card]}>
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPh}>
            <Text style={styles.avatarTx}>{(user.name ?? "?").slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{user.name ?? "Пользователь"}</Text>
        <Text style={styles.pid}>ID: {user.public_id}</Text>
      </View>
      <Text style={styles.section}>Объявления</Text>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>Нет активных объявлений</Text>}
        renderItem={({ item }) => {
          if (!item?.id) return null;
          const imgs = [...(item.images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const uri = imgs[0]?.url;
          return (
            <Pressable
              onPress={() => openListing(item.id)}
              style={[styles.row, shadow.soft]}
              android_ripple={{ color: "#00000010" }}
            >
              {uri ? <Image source={{ uri }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbPh]} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.ttitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.tmeta}>{categoryLabel(item.category)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  back: { paddingHorizontal: 16, paddingVertical: 8, alignSelf: "flex-start" },
  muted: { textAlign: "center", marginTop: 40, color: colors.muted },
  card: {
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
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
  pid: { marginTop: 6, fontSize: 14, color: colors.muted },
  section: { fontSize: 18, fontWeight: "700", color: colors.ink, paddingHorizontal: 20, marginBottom: 12 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, marginRight: 12 },
  thumbPh: { backgroundColor: colors.surface2 },
  ttitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  tmeta: { marginTop: 4, fontSize: 13, color: colors.muted },
});
