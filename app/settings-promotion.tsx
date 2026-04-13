import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/auth-context";
import { useRedirectIfNeedsPhone } from "../hooks/useRedirectIfNeedsPhone";
import { BOOST_PREVIEW_ABOVE_OTHERS } from "../lib/boostMarketing";
import {
  BOOST_TARIFFS,
  VIP_TARIFFS,
  isBoostActive,
  isVipActive,
  promotionTariffLabel,
  type PromotionTariffKind,
} from "../lib/monetization";
import {
  subscribeListingCreated,
  subscribeListingPromotionApplied,
} from "../lib/listingPromotionEvents";
import { fetchListingsForUser } from "../lib/listings";
import { safeGoBack } from "../lib/safeNavigation";
import { colors } from "../lib/theme";
import type { ListingRow } from "../lib/types";

const BG = "#ffffff";
const ACCENT = "#2563eb";
const LINE = colors.line;
const SHEET_BG = "#ffffff";
const TEXT_PRIMARY = colors.ink;
const TEXT_SECONDARY = colors.muted;
const TARIFF_IDLE_BG = "#F3F4F6";
const CARD_BG = "#ffffff";

function oneParam(p: string | string[] | undefined): string | undefined {
  if (p == null) return undefined;
  return Array.isArray(p) ? p[0] : p;
}

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatExpires(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatRuPeriodDays(days: number): string {
  const m10 = days % 10;
  const m100 = days % 100;
  if (m100 >= 11 && m100 <= 14) return `${days} дней`;
  if (m10 === 1) return `${days} день`;
  if (m10 >= 2 && m10 <= 4) return `${days} дня`;
  return `${days} дней`;
}

export default function SettingsPromotionScreen() {
  useRedirectIfNeedsPhone();
  const router = useRouter();
  const raw = useLocalSearchParams<{ listingId?: string | string[]; openBoost?: string | string[] }>();
  const paramListingId = oneParam(raw.listingId);
  const openBoostParam = oneParam(raw.openBoost);
  const { session } = useAuth();
  const uid = session?.user?.id;

  const [listings, setListings] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boostOpen, setBoostOpen] = useState(false);
  const [vipOpen, setVipOpen] = useState(false);

  const load = useCallback(async () => {
    if (!uid) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const rows = await fetchListingsForUser(uid);
    setListings(rows);
    setLoading(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  React.useEffect(() => {
    if (openBoostParam !== "1" || !paramListingId) return;
    if (!listings.some((l) => l.id === paramListingId)) return;
    setBoostOpen(true);
    router.setParams({ listingId: paramListingId, openBoost: undefined });
  }, [openBoostParam, paramListingId, listings, router]);

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!listings.length) {
      setSelectedId(null);
      return;
    }
    if (paramListingId && listings.some((l) => l.id === paramListingId)) {
      setSelectedId(paramListingId);
      return;
    }
    setSelectedId((prev) => (prev && listings.some((l) => l.id === prev) ? prev : listings[0]!.id));
  }, [listings, paramListingId]);

  const selected = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId]
  );

  const boostOn = selected ? isBoostActive(selected) : false;
  const vipOn = selected ? isVipActive(selected) : false;

  function pay(kind: PromotionTariffKind) {
    if (!selected) return;
    const t = [...BOOST_TARIFFS, ...VIP_TARIFFS].find((x) => x.id === kind);
    if (!t) return;
    setBoostOpen(false);
    setVipOpen(false);
    router.push({
      pathname: "/payment",
      params: {
        listingId: selected.id,
        promoKind: kind,
        amount: String(t.priceRub),
        title: promotionTariffLabel(kind),
      },
    });
  }

  if (!uid) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.head}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>
          <Text style={styles.headTitle}>Продвижение</Text>
          <View style={{ width: 26 }} />
        </View>
        <Text style={styles.muted}>Войдите, чтобы управлять продвижением.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.headTitle}>Продвижение</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} />
      ) : listings.length === 0 ? (
        <Text style={styles.muted}>Нет объявлений. Создайте объявление во вкладке «Добавить».</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>Выберите объявление</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
            {listings.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => setSelectedId(l.id)}
                style={[styles.chip, selectedId === l.id && styles.chipOn]}
              >
                <Text style={[styles.chipTx, selectedId === l.id && styles.chipTxOn]} numberOfLines={1}>
                  {l.title.slice(0, 28)}
                  {l.title.length > 28 ? "…" : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {selected ? (
            <>
              <View style={styles.boostCard}>
                <Text style={styles.cardTitle}>Boost</Text>
                <Text style={styles.cardSub}>Больше просмотров в ленте</Text>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Статус</Text>
                  <Text style={boostOn ? styles.statusOn : styles.statusOff}>
                    {boostOn ? "Активно" : "Не активно"}
                  </Text>
                </View>
                <Text style={styles.expiresLine}>
                  Действует до:{" "}
                  <Text style={styles.expiresVal}>
                    {boostOn && selected.boosted_until ? formatExpires(selected.boosted_until) : "—"}
                  </Text>
                </Text>
                <Pressable style={styles.cardPrimaryBtn} onPress={() => setBoostOpen(true)}>
                  <Text style={styles.cardPrimaryBtnTx}>Управлять Boost</Text>
                </Pressable>
              </View>

              <View style={styles.vipCard}>
                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeTx}>VIP</Text>
                </View>
                <Text style={styles.cardTitle}>VIP</Text>
                <Text style={styles.cardSub}>Приоритет и заметность в поиске</Text>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Статус</Text>
                  <Text style={vipOn ? styles.statusOn : styles.statusOff}>
                    {vipOn ? "Активно" : "Не активно"}
                  </Text>
                </View>
                <Text style={styles.expiresLine}>
                  Действует до:{" "}
                  <Text style={styles.expiresVal}>
                    {vipOn && selected.vip_until ? formatExpires(selected.vip_until) : "—"}
                  </Text>
                </Text>
                <Pressable style={styles.cardSecondaryBtn} onPress={() => setVipOpen(true)}>
                  <Text style={styles.cardSecondaryBtnTx}>Управлять VIP</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={boostOpen} animationType="fade" transparent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setBoostOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetH1}>Продвижение объявления</Text>
            <Text style={styles.sheetTagline}>
              Получите больше просмотров и быстрее найдите покупателя
            </Text>
            <Text style={styles.sheetPreview}>{BOOST_PREVIEW_ABOVE_OTHERS}</Text>
            <Text style={styles.sheetSocialProof}>Объявления с продвижением продаются быстрее</Text>
            <Text style={styles.sheetSocialProofMeta}>На основе недавней активности</Text>
            {selected && boostOn && selected.boosted_until ? (
              <Text style={styles.sheetSub}>Текущий Boost до {formatExpires(selected.boosted_until)}</Text>
            ) : null}
            <View style={styles.tariffList}>
              {BOOST_TARIFFS.map((t) => {
                const featured = t.id === "boost_7";
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => pay(t.id)}
                    style={[styles.tariffBtn, featured ? styles.tariffBtnFeatured : styles.tariffBtnIdle]}
                  >
                    <Text style={[styles.tariffBtnTitle, featured && styles.tariffBtnTitleOn]}>
                      {formatRuPeriodDays(t.days)} — {formatRub(t.priceRub)}
                    </Text>
                    {featured ? <Text style={styles.tariffBtnHint}>Лучший выбор</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sheetTrust}>Продвигаемые объявления заметнее в ленте</Text>
            <Text style={styles.extendHint}>Продлить продвижение — выберите срок выше</Text>
            <Text style={styles.sheetHint}>Оплата откроется на следующем экране</Text>
            <Pressable onPress={() => setBoostOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnTx}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={vipOpen} animationType="fade" transparent>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setVipOpen(false)} />
          <View style={[styles.sheet, styles.sheetVipGlow]}>
            <View style={styles.sheetVipBadge}>
              <Text style={styles.sheetVipBadgeTx}>VIP</Text>
            </View>
            <Text style={styles.sheetH1}>VIP-статус</Text>
            <Text style={styles.sheetTagline}>Выделитесь среди объявлений и вызывайте больше доверия</Text>
            {selected && vipOn && selected.vip_until ? (
              <Text style={styles.sheetSub}>Текущий VIP до {formatExpires(selected.vip_until)}</Text>
            ) : null}
            <View style={styles.tariffList}>
              {VIP_TARIFFS.map((t) => {
                const featured = t.id === "vip_30";
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => pay(t.id)}
                    style={[styles.tariffBtn, featured ? styles.tariffBtnFeatured : styles.tariffBtnIdle]}
                  >
                    <Text style={[styles.tariffBtnTitle, featured && styles.tariffBtnTitleOn]}>
                      {formatRuPeriodDays(t.days)} — {formatRub(t.priceRub)}
                    </Text>
                    {featured ? <Text style={styles.tariffBtnHint}>Лучший выбор</Text> : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.extendHint}>Продлить VIP — выберите срок выше</Text>
            <Text style={styles.sheetHint}>
              Если VIP уже активен, срок добавится к текущей дате окончания
            </Text>
            <Pressable onPress={() => setVipOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnTx}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LINE,
  },
  headTitle: { fontSize: 17, fontWeight: "700", color: TEXT_PRIMARY },
  scroll: { padding: 20, paddingBottom: 48 },
  muted: { color: TEXT_SECONDARY, fontSize: 15, padding: 24, lineHeight: 22 },
  sectionLabel: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  chipsRow: { marginBottom: 24 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    marginRight: 10,
    maxWidth: 240,
    backgroundColor: TARIFF_IDLE_BG,
  },
  chipOn: { borderColor: ACCENT, backgroundColor: "rgba(37, 99, 235, 0.1)" },
  chipTx: { color: TEXT_SECONDARY, fontSize: 14, fontWeight: "500" },
  chipTxOn: { color: ACCENT, fontWeight: "700" },
  boostCard: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: LINE,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  vipCard: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    backgroundColor: "#FFFCF5",
    borderWidth: 1,
    borderColor: "rgba(196, 163, 90, 0.45)",
    ...Platform.select({
      ios: {
        shadowColor: "#C4A35A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  vipBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(196, 163, 90, 0.22)",
    marginBottom: 10,
  },
  vipBadgeTx: { fontSize: 11, fontWeight: "800", color: "#8B6914", letterSpacing: 1 },
  cardTitle: { fontSize: 20, fontWeight: "700", color: TEXT_PRIMARY },
  cardSub: { marginTop: 6, fontSize: 14, color: TEXT_SECONDARY, lineHeight: 20 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  statusLabel: { fontSize: 14, color: TEXT_SECONDARY },
  statusOn: { fontSize: 15, fontWeight: "700", color: "#34c759" },
  statusOff: { fontSize: 15, fontWeight: "600", color: colors.muted },
  expiresLine: { marginTop: 10, fontSize: 14, color: TEXT_SECONDARY },
  expiresVal: { color: TEXT_PRIMARY, fontWeight: "600" },
  cardPrimaryBtn: {
    marginTop: 18,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: "center",
  },
  cardPrimaryBtnTx: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  cardSecondaryBtn: {
    marginTop: 18,
    backgroundColor: "rgba(196, 163, 90, 0.2)",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(180, 140, 40, 0.45)",
  },
  cardSecondaryBtnTx: { fontSize: 16, fontWeight: "700", color: "#6B4E0A" },
  modalRoot: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: SHEET_BG,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: LINE,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  sheetVipGlow: {
    borderColor: "rgba(196, 163, 90, 0.4)",
    backgroundColor: "#FFFCF5",
    ...Platform.select({
      ios: {
        shadowColor: "#C4A35A",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  sheetVipBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(196, 163, 90, 0.22)",
    marginBottom: 12,
  },
  sheetVipBadgeTx: { fontSize: 11, fontWeight: "800", color: "#8B6914", letterSpacing: 1 },
  sheetH1: { fontSize: 22, fontWeight: "700", color: TEXT_PRIMARY, marginBottom: 8 },
  sheetTagline: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  sheetPreview: {
    fontSize: 16,
    fontWeight: "700",
    color: ACCENT,
    lineHeight: 22,
    marginBottom: 12,
  },
  sheetSocialProof: {
    color: "#6A6A6A",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 4,
  },
  sheetSocialProofMeta: {
    color: "#6A6A6A",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 14,
    opacity: 0.9,
  },
  sheetSub: { color: TEXT_SECONDARY, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  tariffList: { gap: 12 },
  tariffBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  tariffBtnIdle: {
    backgroundColor: TARIFF_IDLE_BG,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tariffBtnFeatured: {
    backgroundColor: ACCENT,
    borderWidth: 0,
  },
  tariffBtnTitle: { fontSize: 17, fontWeight: "700", color: TEXT_PRIMARY },
  tariffBtnTitleOn: { color: "#ffffff" },
  tariffBtnHint: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
  sheetTrust: {
    marginTop: 16,
    color: "#6A6A6A",
    fontSize: 12,
    lineHeight: 17,
  },
  extendHint: {
    marginTop: 10,
    color: ACCENT,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  sheetHint: { color: colors.muted, fontSize: 12, marginTop: 12, lineHeight: 18 },
  closeBtn: {
    marginTop: 20,
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: TARIFF_IDLE_BG,
    borderWidth: 1,
    borderColor: LINE,
  },
  closeBtnTx: { fontSize: 16, fontWeight: "600", color: TEXT_PRIMARY },
});
