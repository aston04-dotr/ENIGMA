import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListingCard } from "../../components/ListingCard";
import { ListingCardSkeleton } from "../../components/Skeleton";
import { useAuth } from "../../context/auth-context";
import { CATEGORIES } from "../../lib/categories";
import { listingIsRussiaForFeed } from "../../lib/feedGeo";
import { fetchListings, getCitiesFromDb } from "../../lib/listings";
import { ALLOWED_LISTING_CITIES, isAllowedListingCity } from "../../lib/russianCities";
import {
  subscribeListingCreated,
  subscribeListingPromotionApplied,
} from "../../lib/listingPromotionEvents";
import { stashListingsFromFeed } from "../../lib/listingStash";
import { buildFeedSections, interleavePartnerFeedMain } from "../../lib/monetization";
import { isSchemaNotInCache } from "../../lib/postgrestErrors";
import { colors, radius, shadow } from "../../lib/theme";
import type { ListingRow } from "../../lib/types";
import { supabase } from "../../lib/supabase";

type FeedRow =
  | { id: string; kind: "header"; title: string }
  | { id: string; kind: "card"; item: ListingRow };

export default function FeedScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [selectedCity, setSelectedCity] = useState<string>(ALLOWED_LISTING_CITIES[0]);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cities, setCities] = useState<string[]>([...ALLOWED_LISTING_CITIES]);
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [favSet, setFavSet] = useState<Set<string>>(new Set());
  const [sqlSetupRequired, setSqlSetupRequired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    void (async () => {
      try {
        let saved: string | null = null;
        if (typeof localStorage !== "undefined") {
          saved = localStorage.getItem("selectedCity");
        } else {
          saved = await AsyncStorage.getItem("selectedCity");
        }
        if (saved && isAllowedListingCity(saved)) setSelectedCity(saved);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const dbCities = await getCitiesFromDb();
      console.log("[CITIES-HOME] Loaded:", dbCities.length, "cities");
      setCities(dbCities);
    })();
  }, []);

  console.log("[CITIES DEBUG] state:", cities?.length, cities);

  const persistSelectedCity = useCallback(async (city: string) => {
    if (!isAllowedListingCity(city)) return;
    setSelectedCity(city);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("selectedCity", city);
      } else {
        await AsyncStorage.setItem("selectedCity", city);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadFavs = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setFavSet(new Set());
      return;
    }
    const { data, error } = await supabase.from("favorites").select("listing_id").eq("user_id", uid);
    if (error && isSchemaNotInCache(error)) return;
    setFavSet(new Set((data ?? []).map((r) => r.listing_id)));
  }, [session?.user?.id]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetchListings({
        category,
        minPrice: minP ? Number(minP) : undefined,
        maxPrice: maxP ? Number(maxP) : undefined,
        search: debounced,
        city: selectedCity,
      });
      if (res.error) {
        console.error("LISTINGS FETCH ERROR", res.error);
        setItems([]);
        setSqlSetupRequired(res.sqlSetupRequired);
        setLoadError(res.error);
        return;
      }
      setItems(res.listings);
      setSqlSetupRequired(res.sqlSetupRequired);
    } catch (e) {
      setItems([]);
      setSqlSetupRequired(false);
      setLoadError(e instanceof Error ? e.message : "Не удалось загрузить ленту");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, minP, maxP, debounced, selectedCity]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    loadFavs();
  }, [loadFavs]);

  const itemsForFeed = useMemo(() => {
    return items.filter((x) => {
      if (!listingIsRussiaForFeed(x)) return false;
      if (!x.city) return false;
      return x.city.toLowerCase().trim() === selectedCity.toLowerCase().trim();
    });
  }, [items, selectedCity]);

  useEffect(() => {
    stashListingsFromFeed(itemsForFeed);
  }, [itemsForFeed]);

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

  async function toggleFav(id: string) {
    const uid = session?.user?.id;
    if (!uid) {
      router.push("/(auth)/email");
      return;
    }
    const wasFav = favSet.has(id);
    setFavSet((prev) => {
      const n = new Set(prev);
      if (wasFav) n.delete(id);
      else n.add(id);
      return n;
    });
    setItems((prev) =>
      prev.map((it) =>
        it.id !== id
          ? it
          : { ...it, favorite_count: Math.max(0, (it.favorite_count ?? 0) + (wasFav ? -1 : 1)) }
      )
    );
    try {
      if (wasFav) {
        const { error } = await supabase.from("favorites").delete().eq("user_id", uid).eq("listing_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("favorites").insert({ user_id: uid, listing_id: id });
        if (error) throw error;
      }
    } catch {
      setFavSet((prev) => {
        const n = new Set(prev);
        if (wasFav) n.add(id);
        else n.delete(id);
        return n;
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id !== id
            ? it
            : { ...it, favorite_count: Math.max(0, (it.favorite_count ?? 0) + (wasFav ? 1 : -1)) }
        )
      );
    }
  }

  const { recommended, main } = useMemo(() => buildFeedSections(itemsForFeed), [itemsForFeed]);
  const mainForFeed = useMemo(() => interleavePartnerFeedMain(main), [main]);

  const feedRows = useMemo((): FeedRow[] => {
    const rows: FeedRow[] = [];
    if (recommended.length > 0) {
      rows.push({ id: "hdr-rec", kind: "header", title: "Рекомендуемые" });
      for (const it of recommended) {
        if (!it?.id) continue;
        rows.push({ id: `card-${it.id}-rec`, kind: "card", item: it });
      }
    }
    if (recommended.length > 0) {
      rows.push({ id: "hdr-main", kind: "header", title: "Объявления" });
    }
    for (const it of mainForFeed) {
      if (!it?.id) continue;
      rows.push({ id: `card-${it.id}-main`, kind: "card", item: it });
    }
    return rows;
  }, [recommended, mainForFeed]);

  const header = useMemo(
    () => (
      <View style={styles.top}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>ENIGMA</Text>
          <Pressable onPress={() => setFilterOpen(true)} style={styles.filterBtn} hitSlop={8}>
            <Ionicons name="options-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>
        <View style={[styles.searchWrap, shadow.soft]}>
          <Ionicons name="search" size={20} color={colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Поиск в реальном времени…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
        </View>
        <Pressable onPress={() => setCityPickerOpen(true)} style={styles.cityBtn}>
          <Text style={styles.cityBtnLabel}>Город</Text>
          <Text style={styles.cityBtnValue} numberOfLines={1}>
            {selectedCity}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        {category ? (
          <Pressable onPress={() => setCategory(undefined)} style={styles.chip}>
            <Text style={styles.chipText}>{CATEGORIES.find((c) => c.id === category)?.label} ✕</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    [search, category, selectedCity]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={loading ? [] : feedRows}
        keyExtractor={(item) => item.id.toString()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            {loadError ? (
              <View style={styles.errBanner}>
                <Text style={styles.errBannerTitle}>Лента не загрузилась</Text>
                <Text style={styles.errBannerText}>{loadError}</Text>
                <Pressable onPress={() => { setLoading(true); load(); }} style={styles.errRetry}>
                  <Text style={styles.errRetryTx}>Повторить</Text>
                </Pressable>
              </View>
            ) : null}
            {sqlSetupRequired ? (
              <View style={styles.sqlBanner}>
                <Text style={styles.sqlBannerTitle}>Нужно создать таблицы в Supabase</Text>
                <Text style={styles.sqlBannerText}>
                  Включение Anonymous / API-ключ не создают БД. Откройте проект в браузере → SQL Editor →
                  выполните{" "}
                  <Text style={{ fontWeight: "700" }}>supabase/schema.sql</Text>, затем{" "}
                  <Text style={{ fontWeight: "700" }}>supabase/migrations/002_monetization.sql</Text> → Run.
                  Обновите приложение (потянуть ленту вниз).
                </Text>
              </View>
            ) : null}
            {loading ? (
              <View style={{ paddingHorizontal: 20 }}>
                <ListingCardSkeleton />
                <ListingCardSkeleton />
                <ListingCardSkeleton />
              </View>
            ) : null}
          </>
        }
        renderItem={({ item: row }) =>
          row.kind === "header" ? (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionHeadTx}>{row.title}</Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 20 }}>
              <ListingCard
                item={row.item}
                viewerUserId={session?.user?.id}
                isFavorite={favSet.has(row.item.id)}
                favoriteCount={row.item.favorite_count ?? 0}
                onToggleFavorite={() => toggleFav(row.item.id)}
              />
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.violet} />}
        ListEmptyComponent={
          loading ? null : loadError ? null : sqlSetupRequired ? null : itemsForFeed.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Пока пусто</Text>
              <Text style={styles.emptySub}>Создайте первое объявление во вкладке «Добавить»</Text>
            </View>
          ) : null
        }
      />

      <Modal visible={filterOpen} animationType="slide" transparent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)} />
          <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Фильтры</Text>
          <Text style={styles.sheetLabel}>Категория</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(category === c.id ? undefined : c.id)}
                style={[styles.catChip, category === c.id && styles.catChipOn]}
              >
                <Text style={[styles.catChipText, category === c.id && styles.catChipTextOn]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sheetLabel}>Цена, ₽</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={styles.priceIn}
              placeholder="От"
              keyboardType="numeric"
              value={minP}
              onChangeText={setMinP}
              placeholderTextColor={colors.muted}
            />
            <Text style={{ color: colors.muted }}>—</Text>
            <TextInput
              style={styles.priceIn}
              placeholder="До"
              keyboardType="numeric"
              value={maxP}
              onChangeText={setMaxP}
              placeholderTextColor={colors.muted}
            />
          </View>
          <Pressable
            onPress={() => {
              setFilterOpen(false);
              setLoading(true);
              load();
            }}
            style={styles.applyBtn}
          >
            <Text style={styles.applyText}>Применить</Text>
          </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={cityPickerOpen} animationType="slide" transparent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCityPickerOpen(false)} />
          <View style={styles.cityPickerSheet}>
            <Text style={styles.sheetTitle}>Город</Text>
            <ScrollView style={styles.cityScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {cities.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    void persistSelectedCity(c);
                    setCityPickerOpen(false);
                  }}
                  style={[styles.cityRow, selectedCity === c && styles.cityRowOn]}
                >
                  <Text style={[styles.cityRowTx, selectedCity === c && styles.cityRowTxOn]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.applyBtn} onPress={() => setCityPickerOpen(false)}>
              <Text style={styles.applyText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: 20, paddingBottom: 12 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  brand: { fontSize: 26, fontWeight: "300", letterSpacing: 6, color: colors.ink },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.soft,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, padding: 0 },
  cityBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  cityBtnLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, width: 48 },
  cityBtnValue: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  cityPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  chip: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: { fontSize: 13, color: colors.violet, fontWeight: "600" },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  emptySub: { marginTop: 8, color: colors.muted, textAlign: "center", lineHeight: 22 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,18,28,0.35)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "78%",
  },
  sheetTitle: { fontSize: 22, fontWeight: "700", color: colors.ink, marginBottom: 16 },
  sheetLabel: { fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 10, marginTop: 8 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  catChipOn: { borderColor: colors.violet, backgroundColor: "#F3EEFF" },
  catChipText: { fontSize: 13, color: colors.ink },
  catChipTextOn: { color: colors.violet, fontWeight: "600" },
  cityScroll: { maxHeight: 220, marginBottom: 8, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  cityRow: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  cityRowOn: { backgroundColor: "#F3EEFF" },
  cityRowTx: { fontSize: 15, color: colors.ink },
  cityRowTxOn: { color: colors.violet, fontWeight: "600" },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceIn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
  applyBtn: {
    marginTop: 24,
    backgroundColor: colors.violet,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  applyText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  sqlBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#2D2640",
    borderWidth: 1,
    borderColor: colors.violet,
  },
  sqlBannerTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  sqlBannerText: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 20 },
  errBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#3d2a2a",
    borderWidth: 1,
    borderColor: "#c45c5c",
  },
  errBannerTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  errBannerText: { color: "rgba(255,255,255,0.9)", fontSize: 14, lineHeight: 20 },
  errRetry: {
    marginTop: 14,
    alignSelf: "flex-start",
    backgroundColor: colors.violet,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.md,
  },
  errRetryTx: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sectionHead: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  sectionHeadTx: { fontSize: 15, fontWeight: "700", color: colors.muted, letterSpacing: 0.3 },
});
