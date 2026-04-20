import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useGlobalSearchParams, useLocalSearchParams, useRouter, useFocusEffect, useSegments } from "expo-router";
import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Dimensions, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { useAuth } from "../../context/auth-context";
import { useRedirectIfNeedsPhone } from "../../hooks/useRedirectIfNeedsPhone";
import { getOrCreateChat } from "../../lib/chats";
import { categoryLabel } from "../../lib/categories";
import { isValidListingUuid, resolveListingRouteId } from "../../lib/listingParams";
import { peekStashedListing } from "../../lib/listingStash";
import { subscribeListingPromotionApplied } from "../../lib/listingPromotionEvents";
import { fetchListingById, fetchListingFavoriteCount, incrementViews, normalizeListingImages } from "../../lib/listings";
import { hasDeviceViewFlag, setDeviceViewFlag } from "../../lib/listingViewDedupe";
import { safeGoBack } from "../../lib/safeNavigation";
import {
  boostRemainingMs,
  formatBoostRemainingRu,
  isBoostLastHours,
  boostVisibilityNudgeMessage,
  shouldShowBoostVisibilityNudge,
} from "../../lib/boostUi";
import { expoBoostPaymentParams } from "../../lib/boostPay";
import { isBoostActive, isVipActive } from "../../lib/monetization";
import { reportListingTrustPenalty } from "../../lib/trust";
import { colors, radius, shadow } from "../../lib/theme";
import type { ListingRow, UserRow } from "../../lib/types";

const W = Dimensions.get("window").width - 40;

function ruTimesWord(n: number): string {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return "раз";
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return "раза";
  return "раз";
}

function ruViewsWord(n: number): string {
  const m = n % 10;
  const h = n % 100;
  if (m === 1 && h !== 11) return "просмотр";
  if (m >= 2 && m <= 4 && (h < 10 || h >= 20)) return "просмотра";
  return "просмотров";
}

/** Цифры для tel: (+7XXXXXXXXXX). Источник — телефон продавца в профиле (users.phone). */
function normalizePhoneForTel(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("8") && d.length === 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) return d;
  return d.length >= 10 ? d : null;
}

/** Отображение: +7 XXX XXX-XX-XX */
function formatRuPhoneDisplay(digits: string): string {
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function ListingDetailScreenInner() {
  const localParams = useLocalSearchParams<{ id?: string | string[] }>();
  const globalParams = useGlobalSearchParams<{ id?: string | string[] }>();
  const segments = useSegments();
  const listingId = resolveListingRouteId(localParams, globalParams, segments);
  const idValid = Boolean(listingId && isValidListingUuid(listingId));
  const router = useRouter();
  useRedirectIfNeedsPhone();
  const { session } = useAuth();
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [seller, setSeller] = useState<UserRow | null>(null);
  const [idx, setIdx] = useState(0);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const routeIdRef = useRef(listingId);
  routeIdRef.current = listingId;
  const badIdAlerted = useRef(false);

  useEffect(() => {
    if (listingId && isValidListingUuid(listingId)) badIdAlerted.current = false;
  }, [listingId]);

  useEffect(() => {
    setFavoriteCount(0);
  }, [listingId]);

  useLayoutEffect(() => {
    if (!listingId || !isValidListingUuid(listingId)) return;
    const s = peekStashedListing(listingId);
    if (s) {
      setListing(s);
      setLoading(false);
      setLoadError(null);
      setMissing(false);
    }
  }, [listingId]);

  const load = useCallback(async () => {
    if (!listingId || !isValidListingUuid(listingId)) return;
    const startedId = listingId;
    const stashed = peekStashedListing(listingId);
    if (!stashed) setLoading(true);
    setLoadError(null);
    setMissing(false);
    try {
      const res = await fetchListingById(listingId);
      if (routeIdRef.current !== startedId) return;

      if (res.timedOut) {
        setLoading(false);
        Alert.alert("Нет ответа", "Сервер не ответил за 5 секунд.", [
          { text: "Назад", onPress: () => safeGoBack(router) },
        ]);
        return;
      }
      if (res.invalidId) {
        setLoading(false);
        if (!badIdAlerted.current) {
          badIdAlerted.current = true;
          Alert.alert("Ошибка", "Некорректный id объявления.", [
            { text: "OK", onPress: () => safeGoBack(router) },
          ]);
        }
        return;
      }
      if (res.loadError) {
        setListing(null);
        setSeller(null);
        setLoadError(res.loadError);
        setMissing(false);
        return;
      }
      if (!res.row) {
        setListing(stashed ?? null);
        setSeller(null);
        setMissing(true);
        return;
      }
      setListing(res.row);
      setMissing(false);
      setSeller(res.row.seller ?? null);

      void (async () => {
        const n = await fetchListingFavoriteCount(listingId);
        if (routeIdRef.current !== startedId) return;
        setFavoriteCount(n);
      })();

      const viewedKey = `viewed_${listingId}`;
      const alreadyViewed = await hasDeviceViewFlag(viewedKey);
      if (!alreadyViewed) {
        const viewsOk = await incrementViews(listingId);
        if (viewsOk) {
          await setDeviceViewFlag(viewedKey);
          if (routeIdRef.current === startedId) {
            setListing((prev) => (prev ? { ...prev, view_count: prev.view_count + 1 } : prev));
          }
        }
      }
    } catch (e) {
      if (routeIdRef.current !== startedId) return;
      console.error("LISTING_LOAD_ERROR:", e);
      setListing(null);
      setSeller(null);
      setLoadError(e instanceof Error ? e.message : String(e));
      setMissing(false);
    } finally {
      if (routeIdRef.current === startedId) setLoading(false);
    }
  }, [listingId, router]);

  useFocusEffect(
    useCallback(() => {
      if (!listingId || !isValidListingUuid(listingId)) return;
      void load();
    }, [listingId, load])
  );

  useEffect(() => {
    if (!listingId || !isValidListingUuid(listingId)) return;
    return subscribeListingPromotionApplied((id) => {
      if (id === listingId) void load();
    });
  }, [listingId, load]);

  useEffect(() => {
    if (!listingId || isValidListingUuid(listingId)) return;
    if (badIdAlerted.current) return;
    badIdAlerted.current = true;
    Alert.alert("Некорректная ссылка", "Не удалось распознать id объявления.", [
      { text: "OK", onPress: () => safeGoBack(router) },
    ]);
  }, [listingId, router]);

  if (!listingId) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.muted}>Не удалось определить объявление. Вернитесь в ленту и откройте карточку снова.</Text>
      </SafeAreaView>
    );
  }

  if (listingId && !idValid) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.muted}>Некорректный id…</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.muted}>Загрузка…</Text>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.errTitle}>Ошибка загрузки</Text>
        <Text style={styles.errBody}>{loadError}</Text>
        <Pressable onPress={() => void load()} style={styles.retryBtn}>
          <Text style={styles.retryTx}>Повторить</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.nav}>
          <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.muted}>Объявление не найдено</Text>
      </SafeAreaView>
    );
  }

  const listingSafe = (listing ?? {}) as Partial<ListingRow>;
  const sellerSafe = (listingSafe.seller ?? seller ?? null) as UserRow | null;
  const me = session?.user?.id;
  const rowId = typeof listingSafe.id === "string" ? listingSafe.id : "";
  const ownerId = typeof listingSafe.user_id === "string" ? listingSafe.user_id : "";
  const isOwner = !!me && !!ownerId && me === ownerId;
  const images = Array.isArray(listingSafe.images) ? listingSafe.images : [];
  const imgs = normalizeListingImages(images).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const safeIdx = idx >= 0 && idx < imgs.length ? idx : 0;
  const uri = imgs[safeIdx]?.url ?? null;
  const title = typeof listingSafe.title === "string" && listingSafe.title.trim() ? listingSafe.title : "Без названия";
  const description =
    typeof listingSafe.description === "string" && listingSafe.description.trim()
      ? listingSafe.description
      : "Без описания";
  const city = typeof listingSafe.city === "string" && listingSafe.city.trim() ? listingSafe.city : "-";
  const category = typeof listingSafe.category === "string" ? listingSafe.category : "";
  const viewCount = Number.isFinite(Number(listingSafe.view_count)) ? Number(listingSafe.view_count) : 0;
  const priceValue = Number(listingSafe.price);
  const row = listingSafe as ListingRow;

  async function openChat() {
    const uid = session?.user?.id;
    if (!uid) {
      router.push("/(auth)/email");
      return;
    }
    if (!ownerId) {
      Alert.alert("Ошибка", "Не найден владелец объявления.");
      return;
    }
    if (uid === ownerId) {
      Alert.alert("Это ваше объявление");
      return;
    }
    const chatRes = await getOrCreateChat(ownerId);
    if (!chatRes.ok) {
      Alert.alert("Чат", chatRes.error);
      return;
    }
    router.push(`/chat/${chatRes.id}`);
  }

  async function report() {
    const me = session?.user?.id;
    if (!me) {
      router.push("/(auth)/email");
      return;
    }
    if (!rowId) {
      Alert.alert("Ошибка", "Объявление не найдено.");
      return;
    }
    if (me === ownerId) {
      Alert.alert("Это ваше объявление");
      return;
    }
    Alert.alert("Пожаловаться", "Выберите причину", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Спам / мошенничество",
        style: "destructive",
        onPress: async () => {
          const { error } = await reportListingTrustPenalty(rowId, "spam");
          if (error) {
            Alert.alert("Ошибка", error);
            return;
          }
          Alert.alert("Спасибо", "Жалоба отправлена");
        },
      },
      {
        text: "Запрещённый товар",
        onPress: async () => {
          const { error } = await reportListingTrustPenalty(rowId, "prohibited");
          if (error) {
            Alert.alert("Ошибка", error);
            return;
          }
          Alert.alert("Спасибо", "Жалоба отправлена");
        },
      },
    ]);
  }

  const price = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(priceValue) ? priceValue : 0);

  const sellerPhoneDigits = normalizePhoneForTel(sellerSafe?.phone);
  const sellerPhoneDisplay = sellerPhoneDigits ? formatRuPhoneDisplay(sellerPhoneDigits) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.nav}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        {!isOwner ? (
          <Pressable onPress={report} hitSlop={12} style={styles.reportBtn}>
            <Ionicons name="flag-outline" size={20} color={colors.muted} />
            <Text style={styles.reportLabel}>Пожаловаться</Text>
          </Pressable>
        ) : (
          <View style={styles.navSpacer} />
        )}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, shadow.card]}>
          {uri ? (
            <Image source={{ uri }} style={{ width: W, height: W * 0.72 }} contentFit="cover" />
          ) : (
            <View style={[styles.ph, { width: W, height: W * 0.72 }]}>
              <Text style={styles.phTx}>ENIGMA</Text>
            </View>
          )}
          {imgs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {imgs.map((im, i) => (
                <Pressable key={im.url + i} onPress={() => setIdx(i)} style={[styles.tdot, i === idx && styles.tdotOn]}>
                  <Image source={{ uri: im.url }} style={styles.timg} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        <Text style={styles.price}>{price}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.viewsLine}>
          {viewCount} {ruViewsWord(viewCount)}
        </Text>
        <View style={styles.favCountRow}>
          <Ionicons name="heart" size={15} color="#DC2626" />
          <Text style={styles.favCountNum}>{favoriteCount}</Text>
        </View>
        <Text style={styles.meta}>
          {city} · {categoryLabel(category)}
        </Text>

        {listingSafe.is_partner_ad === true ? (
          <Text style={styles.partnerNote}>реклама от партнёра</Text>
        ) : null}

        {isBoostActive(row) && boostRemainingMs(row.boosted_until) != null ? (
          <Text style={styles.boostPublicLine}>
            🔥 В топе сейчас · {formatBoostRemainingRu(boostRemainingMs(row.boosted_until)!)}
          </Text>
        ) : null}

        {isOwner && viewCount >= 1 && viewCount <= 12 ? (
          <View style={styles.nudge}>
            <Text style={styles.nudgeTx}>
              Ваше объявление посмотрели {viewCount} {ruTimesWord(viewCount)}. Поднимите, чтобы ускорить
              продажу.
            </Text>
          </View>
        ) : null}

        {isOwner ? (
          <View style={[styles.sellFaster, shadow.soft]}>
            <Text style={styles.sellTitle}>Продвижение</Text>
            <Text style={styles.sellSub}>Boost и VIP — приоритет в ленте, сроки и оплата</Text>
            <View style={styles.termBox}>
              <View style={styles.promoRow}>
                <View style={styles.promoBoostBadge}>
                  <Text style={styles.promoBoostBadgeText}>BOOST</Text>
                </View>
                <Text style={isBoostActive(row) ? styles.promoStatusOn : styles.promoStatusOff}>
                  {isBoostActive(row) ? "Активен" : "Не подключён"}
                </Text>
              </View>
              {isBoostActive(row) && boostRemainingMs(row.boosted_until) != null ? (
                <Text style={styles.termMeta}>{formatBoostRemainingRu(boostRemainingMs(row.boosted_until)!)}</Text>
              ) : null}
              {isBoostActive(row) && isBoostLastHours(row) ? (
                <>
                  <Text style={styles.termWarn}>Последние часы Boost</Text>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/payment",
                        params: expoBoostPaymentParams(rowId, session?.user?.id),
                      })
                    }
                    style={styles.termPrimaryBtn}
                  >
                    <Text style={styles.termPrimaryBtnTx}>Получить больше просмотров 🔥</Text>
                  </Pressable>
                  <Text style={styles.termFomoLine}>Скоро объявление потеряет позиции в ленте</Text>
                </>
              ) : null}
              <View style={styles.promoRowVip}>
                <View style={styles.promoVipBadge}>
                  <Text style={styles.promoVipBadgeText}>VIP</Text>
                </View>
                <Text style={isVipActive(row) ? styles.promoStatusOn : styles.promoStatusOff}>
                  {isVipActive(row) ? "Активен" : "Не подключён"}
                </Text>
              </View>
              {isVipActive(row) && row.vip_until ? (
                <Text style={styles.termMeta}>
                  До {new Date(row.vip_until).toLocaleString("ru-RU")}
                </Text>
              ) : null}
            </View>
            {shouldShowBoostVisibilityNudge(row) ? (
              <View style={styles.visibilityNudge}>
                <Text style={styles.termGray}>{boostVisibilityNudgeMessage}</Text>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/payment",
                      params: expoBoostPaymentParams(rowId, session?.user?.id),
                    })
                  }
                  style={styles.termPrimaryBtn}
                >
                  <Text style={styles.termPrimaryBtnTx}>Получить больше просмотров 🔥</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              onPress={() =>
                router.push({ pathname: "/settings-promotion", params: { listingId: rowId } })
              }
              style={styles.sellBtn}
            >
              <Text style={styles.sellBtnTx}>Управление продвижением</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            if (ownerId) router.push(`/user/${ownerId}`);
          }}
          style={[styles.seller, shadow.soft]}
        >
          <View style={styles.sav}>
            <Text style={styles.savTx}>{(sellerSafe?.name ?? "П").slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sname}>{sellerSafe?.name ?? "Пользователь"}</Text>
            <Text style={styles.sid}>ID {sellerSafe?.public_id ?? "—"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>

        <Text style={styles.h2}>Описание</Text>
        <Text style={styles.desc}>{description}</Text>

        <View style={styles.phoneRow}>
          {sellerPhoneDisplay ? (
            <Text style={styles.phoneDisplay}>📞 {sellerPhoneDisplay}</Text>
          ) : (
            <Text style={styles.phoneMissing}>Номер не указан</Text>
          )}
        </View>

        <View style={styles.actions}>
          <UiButton title="💬 Написать" onPress={openChat} style={styles.btnHalf} />
          <View style={{ width: 12 }} />
          <UiButton
            title={sellerPhoneDigits ? `Позвонить: ${sellerPhoneDisplay}` : "Номер не указан"}
            variant="outline"
            disabled={!sellerPhoneDigits}
            onPress={async () => {
              if (!sellerPhoneDigits) return;
              try {
                await Linking.openURL(`tel:+${sellerPhoneDigits}`);
              } catch (e) {
                console.warn("Failed to open dialer", e);
              }
            }}
            style={styles.btnHalf}
          />
        </View>

        <Pressable onPress={() => router.push("/payment")} style={styles.payRow}>
          <Text style={styles.payTx}>Оплата: СБП, Сбер, Тинькофф, ВТБ и другие банки</Text>
          <Ionicons name="card-outline" size={22} color={colors.violet} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export default memo(ListingDetailScreenInner);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  muted: { textAlign: "center", marginTop: 40, color: colors.muted, paddingHorizontal: 24 },
  errTitle: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    paddingHorizontal: 24,
  },
  errBody: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 15,
    color: colors.muted,
    paddingHorizontal: 24,
    lineHeight: 22,
  },
  retryBtn: {
    alignSelf: "center",
    marginTop: 24,
    backgroundColor: colors.violet,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.md,
  },
  retryTx: { color: "#fff", fontSize: 16, fontWeight: "600" },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  back: { padding: 4 },
  navSpacer: { minWidth: 1 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 4 },
  reportLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  hero: { borderRadius: radius.xl, overflow: "hidden", marginBottom: 16, backgroundColor: colors.surface },
  ph: { backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  phTx: { color: colors.line, fontWeight: "800", letterSpacing: 6 },
  thumbs: { flexDirection: "row", padding: 10, gap: 8, flexGrow: 0 },
  tdot: { borderRadius: radius.sm, overflow: "hidden", opacity: 0.6, borderWidth: 2, borderColor: "transparent" },
  tdotOn: { opacity: 1, borderColor: colors.violet },
  timg: { width: 56, height: 56 },
  price: { fontSize: 28, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink, lineHeight: 26 },
  viewsLine: { marginTop: 8, fontSize: 14, fontWeight: "500", color: colors.muted },
  favCountRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  favCountNum: { fontSize: 14, fontWeight: "600", color: colors.ink },
  meta: { marginTop: 6, fontSize: 14, color: colors.muted },
  partnerNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    fontWeight: "400",
  },
  boostPublicLine: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
    color: colors.muted,
  },
  nudge: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "#F3EEFF",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.25)",
  },
  nudgeTx: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  sellFaster: {
    marginTop: 18,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sellTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  sellSub: { marginTop: 6, fontSize: 13, color: colors.muted, lineHeight: 18 },
  termBox: {
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  promoRowVip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  promoBoostBadge: {
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  promoBoostBadgeText: {
    color: colors.violetLight,
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  promoVipBadge: {
    backgroundColor: "rgba(180, 83, 9, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  promoVipBadgeText: {
    color: "#B45309",
    fontWeight: "600",
    fontSize: 12,
  },
  promoStatusOn: { fontSize: 15, fontWeight: "700", color: colors.success },
  promoStatusOff: { fontSize: 15, fontWeight: "600", color: colors.muted },
  termMeta: { marginTop: 6, fontSize: 13, color: colors.muted, lineHeight: 18 },
  termGray: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  termWarn: {
    marginTop: 12,
    fontSize: 14,
    color: "#d97706",
    fontWeight: "700",
  },
  termFomoLine: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  termPrimaryBtn: {
    alignSelf: "stretch",
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  termPrimaryBtnTx: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  visibilityNudge: {
    marginTop: 14,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "#1a1510",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  sellGrid: { marginTop: 14, gap: 10 },
  sellBtn: {
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  sellBtnTx: { fontSize: 16, fontWeight: "700", color: colors.ink },
  seller: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sav: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  savTx: { fontSize: 18, fontWeight: "700", color: colors.violet },
  sname: { fontSize: 16, fontWeight: "600", color: colors.ink },
  sid: { marginTop: 2, fontSize: 13, color: colors.muted },
  h2: { marginTop: 28, fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 10 },
  desc: { fontSize: 16, color: colors.ink, lineHeight: 24 },
  phoneRow: { marginTop: 20 },
  phoneDisplay: { fontSize: 17, fontWeight: "600", color: colors.ink },
  phoneMissing: { fontSize: 15, color: colors.muted },
  actions: { flexDirection: "row", marginTop: 16 },
  btnHalf: { flex: 1 },
  payRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  payTx: { flex: 1, fontSize: 15, color: colors.violet, fontWeight: "600", marginRight: 12 },
});
