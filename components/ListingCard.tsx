import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { categoryLabel } from "../lib/categories";
import { trackBoostEvent } from "../lib/boostAnalytics";
import { defaultBoostCtaPriceRub, expoBoostPaymentParams } from "../lib/boostPay";
import {
  BOOST_PREVIEW_ABOVE_OTHERS,
  boostComparisonUi,
  dailyBoostSocialCount,
  formatBoostCountdown,
  pickDeadZoneLine,
  pickRecentLiftLine,
} from "../lib/boostMarketing";
import { isBoostExpiredForUpsell, isBoostLastHours } from "../lib/boostUi";
import { isBoostActive, isTopActive, isVipActive } from "../lib/monetization";
import { stashListingRow } from "../lib/listingStash";
import { colors, radius, shadow } from "../lib/theme";
import { normalizeListingImages } from "../lib/listings";
import type { ListingRow } from "../lib/types";

function formatPrice(n: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function boostCtaLabel(isOwn: boolean, expiredBoost: boolean, priceRub: number): string {
  if (isOwn && expiredBoost) return "Вернуть в топ 🚀";
  if (isOwn) return `⚡ Получить просмотры за ${priceRub} ₽`;
  return "Получить больше просмотров 🔥";
}

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function useFakeHourlyViews(enabled: boolean): number | null {
  const [n, setN] = useState<number | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) {
      setN(null);
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = null;
      return;
    }
    const bump = () => setN(randInt(5, 40));
    bump();
    const schedule = () => {
      tRef.current = setTimeout(() => {
        bump();
        schedule();
      }, randInt(20_000, 40_000));
    };
    schedule();
    return () => {
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = null;
    };
  }, [enabled]);
  return n;
}

function useRotatorTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const schedule = () => {
      tRef.current = setTimeout(() => {
        if (cancelled) return;
        setTick((t) => t + 1);
        schedule();
      }, randInt(5000, 10_000));
    };
    schedule();
    return () => {
      cancelled = true;
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = null;
    };
  }, [enabled]);
  return tick;
}

function useBoostLiveCountdown(boostedUntil: string | undefined | null, active: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !boostedUntil) {
      setLabel(null);
      return;
    }
    const tick = () => {
      const end = new Date(boostedUntil).getTime();
      if (Number.isNaN(end)) {
        setLabel(null);
        return;
      }
      const rem = end - Date.now();
      if (rem <= 0) {
        setLabel("00:00:00");
        return;
      }
      setLabel(formatBoostCountdown(rem));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, boostedUntil]);
  return label;
}

type Props = {
  item: ListingRow;
  viewerUserId?: string | null;
  isFavorite?: boolean;
  favoriteCount?: number;
  onToggleFavorite?: () => void;
};

export function ListingCard({
  item,
  viewerUserId,
  isFavorite,
  favoriteCount = 0,
  onToggleFavorite,
}: Props) {
  const router = useRouter();
  const imgs = normalizeListingImages((item as ListingRow & { images?: unknown })?.images).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const uri = imgs[0]?.url ?? null;
  const itemTitle = typeof item.title === "string" && item.title.trim() ? item.title : "Без названия";
  const itemCity = typeof item.city === "string" && item.city.trim() ? item.city : "Россия";
  const top = isTopActive(item);
  const vip = isVipActive(item);
  const boosted = isBoostActive(item);
  const boostUrgent = boosted && isBoostLastHours(item);
  const countdown = useBoostLiveCountdown(item.boosted_until, boosted);
  const expiredBoost = isBoostExpiredForUpsell(item);
  const lid = item?.id;
  const luxuryPartnerRe = item.is_partner_ad === true && item.category === "realestate";
  const isOwn = Boolean(viewerUserId && item.user_id && item.user_id === viewerUserId);
  const partner = item.is_partner_ad === true;
  const socialN = dailyBoostSocialCount("expo-feed");
  const pulse = useRef(new Animated.Value(1)).current;
  const expiredTracked = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;
  const ctaFlash = useRef(new Animated.Value(1)).current;
  const previewOrBoost = boosted || (isOwn && !partner);
  const hourlyViews = useFakeHourlyViews(Boolean(lid && previewOrBoost));
  const rotTick = useRotatorTick(!partner);
  const cmp = boostComparisonUi(item);
  const showDeadZone = isOwn && !top && !boosted && !partner;
  const priceRub = defaultBoostCtaPriceRub();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fade, lid]);

  useEffect(() => {
    if (partner) return;
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1.02, duration: 420, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]).start();
  }, [partner, pulse, lid]);

  useEffect(() => {
    if (!isOwn || !expiredBoost || expiredTracked.current || !lid) return;
    expiredTracked.current = true;
    trackBoostEvent("boost_expired_seen", { listingId: lid });
  }, [isOwn, expiredBoost, lid]);

  if (!lid) return null;

  function goDetail() {
    stashListingRow(item);
    router.push({ pathname: "/listing/[id]", params: { id: String(lid) } });
  }

  function flashCtaDopamine() {
    try {
      Vibration.vibrate(12);
    } catch {
      /* ignore */
    }
    ctaFlash.setValue(1);
    Animated.sequence([
      Animated.timing(ctaFlash, { toValue: 0.55, duration: 50, useNativeDriver: true }),
      Animated.timing(ctaFlash, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }

  function onBoostPay() {
    flashCtaDopamine();
    trackBoostEvent("boost_click", { listingId: lid, own: isOwn });
    if (!viewerUserId) {
      router.push("/(auth)/email");
      return;
    }
    if (!isOwn) {
      goDetail();
      return;
    }
    router.push({ pathname: "/payment", params: expoBoostPaymentParams(String(lid), viewerUserId) });
  }

  return (
    <View style={styles.root}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={goDetail}
        style={[
          styles.card,
          shadow.card,
          vip && styles.cardVip,
          boosted && styles.cardBoost,
          luxuryPartnerRe && styles.cardLuxury,
        ]}
      >
        <View style={styles.imgWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.img} contentFit="cover" />
          ) : (
            <View style={[styles.ph, luxuryPartnerRe && styles.phLuxury]}>
              {luxuryPartnerRe ? (
                <Text style={styles.phLuxuryMark}>ENIGMA</Text>
              ) : (
                <Text style={styles.phText}>ENIGMA</Text>
              )}
            </View>
          )}
          {luxuryPartnerRe ? (
            <>
              <LinearGradient
                colors={["transparent", "rgba(12,10,18,0.92)"]}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <View style={styles.luxuryBand} pointerEvents="none">
                <Text style={styles.luxuryBandTitle}>Премиальная недвижимость</Text>
                <Text style={styles.luxuryBandSub}>подбор от партнёра ENIGMA</Text>
              </View>
            </>
          ) : null}
          <View style={styles.badges} pointerEvents="none">
            {top ? (
              <View style={[styles.badge, styles.badgeTop]}>
                <Text style={styles.badgeTx}>🔥 TOP</Text>
              </View>
            ) : null}
            {vip ? (
              <View style={[styles.badge, styles.badgeVip]}>
                <Text style={styles.badgeTx}>⭐ VIP</Text>
              </View>
            ) : null}
            {boosted ? (
              <View style={[styles.badge, styles.badgeBoost]}>
                <Text style={styles.badgeBoostTx}>BOOST</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.body}>
          <Text style={[styles.price, luxuryPartnerRe && styles.priceLuxury]}>
            {formatPrice(Number(item.price))}
          </Text>
          <Text style={[styles.title, luxuryPartnerRe && styles.titleLuxury]} numberOfLines={2}>
            {itemTitle}
          </Text>
          <View style={styles.row}>
            <Text style={styles.meta}>{itemCity}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.meta}>{categoryLabel(item.category)}</Text>
          </View>
          {hourlyViews != null && previewOrBoost ? (
            <Text style={styles.hourlyFake}>+{hourlyViews} просмотров за последний час 🔥</Text>
          ) : null}
          {item.is_partner_ad ? (
            <Text style={[styles.partnerHint, luxuryPartnerRe && styles.partnerHintLuxury]}>
              реклама от партнёра
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {!partner ? (
        <Animated.View style={[styles.ctaWrap, { opacity: fade }]}>
          {boosted ? (
            <View style={styles.boostStrip}>
              <Text style={styles.boostHead}>🔥 В ТОПЕ СЕЙЧАС</Text>
              {countdown != null ? (
                <Text style={styles.boostTimer}>⏳ Осталось: {countdown}</Text>
              ) : null}
              <Text style={styles.boostDropHint}>Потом объявление опустится вниз</Text>
              {boostUrgent ? (
                <Text style={styles.boostLastHours}>Последние часы Boost</Text>
              ) : null}
              {isOwn ? (
                <View style={styles.compareCard}>
                  <View style={styles.compareHeadRow}>
                    <Text style={styles.compareHeadMuted}>Без буста</Text>
                    <Text style={styles.compareHeadHot}>С бустом</Text>
                  </View>
                  <View style={styles.compareGrid}>
                    <Text style={styles.compareMuted}>{cmp.baselineViews.toLocaleString("ru-RU")} просмотров</Text>
                    <Text style={styles.compareStrong}>{cmp.boostedViews.toLocaleString("ru-RU")} просмотров</Text>
                    <Text style={styles.compareMuted}>1–2 сообщения</Text>
                    <Text style={styles.compareStrong}>15+ сообщений</Text>
                    <Text style={styles.compareMuted}>низко в ленте</Text>
                    <Text style={styles.compareHot}>в топе 🔥</Text>
                  </View>
                </View>
              ) : null}
              <Animated.View style={{ transform: [{ scale: pulse }], alignSelf: "stretch" }}>
                <Animated.View style={{ opacity: ctaFlash, alignSelf: "stretch" }}>
                  <Pressable onPress={onBoostPay} style={styles.gradBtnOuter}>
                    <LinearGradient
                      colors={["#9353FF", "#7B4FE8", "#22d3ee"]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.gradBtn}
                    >
                      <Text style={styles.gradBtnTx}>{boostCtaLabel(isOwn, expiredBoost, priceRub)}</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              </Animated.View>
              <Text style={styles.microHint}>💡 Это занимает меньше 10 секунд</Text>
              <Text style={styles.subHint}>До +300% просмотров за 3 дня</Text>
              <Text style={styles.rotLine}>{pickRecentLiftLine(rotTick)}</Text>
              <Text style={styles.socialProof}>
                🔥 Уже {socialN} человека сегодня подняли объявления
              </Text>
            </View>
          ) : (
            <View style={styles.boostCta}>
              {showDeadZone ? <Text style={styles.deadZone}>{pickDeadZoneLine(rotTick)}</Text> : null}
              {isOwn && expiredBoost ? (
                <View style={styles.expiredBox}>
                  <Text style={styles.expiredTitle}>❗ Объявление опустилось</Text>
                  <Text style={styles.expiredSub}>Просмотры падают</Text>
                </View>
              ) : isOwn ? (
                <Text style={styles.previewLine}>{BOOST_PREVIEW_ABOVE_OTHERS}</Text>
              ) : null}
              {isOwn ? (
                <View style={styles.compareCard}>
                  <View style={styles.compareHeadRow}>
                    <Text style={styles.compareHeadMuted}>Без буста</Text>
                    <Text style={styles.compareHeadHot}>С бустом</Text>
                  </View>
                  <View style={styles.compareGrid}>
                    <Text style={styles.compareMuted}>{cmp.baselineViews.toLocaleString("ru-RU")} просмотров</Text>
                    <Text style={styles.compareStrong}>{cmp.boostedViews.toLocaleString("ru-RU")} просмотров</Text>
                    <Text style={styles.compareMuted}>1–2 сообщения</Text>
                    <Text style={styles.compareStrong}>15+ сообщений</Text>
                    <Text style={styles.compareMuted}>низко в ленте</Text>
                    <Text style={styles.compareHot}>в топе 🔥</Text>
                  </View>
                </View>
              ) : null}
              <Animated.View style={{ transform: [{ scale: pulse }], alignSelf: "stretch" }}>
                <Animated.View style={{ opacity: ctaFlash, alignSelf: "stretch" }}>
                  <Pressable onPress={onBoostPay} style={styles.gradBtnOuter}>
                    <LinearGradient
                      colors={["#9353FF", "#7B4FE8", "#22d3ee"]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.gradBtn}
                    >
                      <Text style={styles.gradBtnTx}>{boostCtaLabel(isOwn, expiredBoost, priceRub)}</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              </Animated.View>
              <Text style={styles.microHint}>💡 Это занимает меньше 10 секунд</Text>
              <Text style={styles.subHint}>До +300% просмотров за 3 дня</Text>
              <Text style={styles.rotLine}>{pickRecentLiftLine(rotTick)}</Text>
              <Text style={styles.socialProof}>
                🔥 Уже {socialN} человека сегодня подняли объявления
              </Text>
            </View>
          )}
        </Animated.View>
      ) : null}
      {onToggleFavorite ? (
        <Pressable
          onPress={() => onToggleFavorite()}
          style={styles.favBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <View style={styles.favBtnInner}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={22}
              color={isFavorite ? "#DC2626" : colors.muted}
            />
            <Text style={styles.favCountTx} numberOfLines={1}>
              {favoriteCount}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardVip: {
    borderColor: "#C4A35A",
    backgroundColor: "#FFFCF5",
  },
  cardBoost: {
    borderLeftWidth: 2,
    borderLeftColor: "#7B4FE8",
  },
  cardLuxury: {
    borderColor: "rgba(196, 163, 90, 0.55)",
    borderWidth: 1,
    backgroundColor: "#0f0d14",
  },
  imgWrap: { position: "relative" },
  img: { width: "100%", height: 168, backgroundColor: colors.surface2 },
  ph: {
    height: 168,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  phText: { color: colors.line, fontWeight: "800", letterSpacing: 4, fontSize: 12 },
  phLuxury: {
    backgroundColor: "#1a1524",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196, 163, 90, 0.35)",
  },
  phLuxuryMark: {
    color: "rgba(196, 163, 90, 0.9)",
    fontWeight: "700",
    letterSpacing: 6,
    fontSize: 11,
  },
  luxuryBand: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  luxuryBandTitle: {
    color: "#f5f0e6",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  luxuryBandSub: {
    marginTop: 2,
    color: "rgba(196, 163, 90, 0.95)",
    fontSize: 11,
    fontWeight: "500",
  },
  badges: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "70%",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeTop: { backgroundColor: "rgba(220, 38, 38, 0.92)" },
  badgeVip: { backgroundColor: "rgba(180, 140, 40, 0.95)" },
  badgeBoost: { backgroundColor: "rgba(123, 79, 232, 0.95)" },
  badgeBoostTx: { color: "#fff", fontSize: 11, fontWeight: "800" },
  badgeTx: { color: "#fff", fontSize: 11, fontWeight: "800" },
  partnerHint: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    color: colors.muted,
    fontWeight: "400",
  },
  partnerHintLuxury: {
    color: "rgba(196, 163, 90, 0.85)",
  },
  priceLuxury: { color: "#f5f0e6" },
  titleLuxury: { color: "#ede8df" },
  favBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 56,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  favBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  favCountTx: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    minWidth: 14,
  },
  body: { padding: 14 },
  price: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: "600", color: colors.ink, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  meta: { fontSize: 13, color: colors.muted },
  dot: { marginHorizontal: 6, color: colors.muted },
  hourlyFake: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "800",
    color: "#fbbf24",
  },
  deadZone: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fb7185",
    marginBottom: 4,
    lineHeight: 17,
  },
  compareCard: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  compareHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  compareHeadMuted: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  compareHeadHot: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: "#0abab5",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  compareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 6,
  },
  compareMuted: {
    width: "50%",
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
  },
  compareStrong: {
    width: "50%",
    fontSize: 11,
    fontWeight: "700",
    color: colors.ink,
    lineHeight: 15,
  },
  compareHot: {
    width: "50%",
    fontSize: 11,
    fontWeight: "700",
    color: "#fbbf24",
    lineHeight: 15,
  },
  rotLine: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 14,
  },
  microHint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  ctaWrap: { marginTop: 10, paddingHorizontal: 4 },
  boostStrip: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: "rgba(123, 79, 232, 0.22)",
    borderRadius: 16,
    gap: 6,
  },
  boostHead: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#0abab5",
  },
  boostTimer: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: 0.5,
  },
  boostDropHint: { fontSize: 11, color: colors.muted, marginBottom: 8, lineHeight: 15 },
  boostLastHours: { fontSize: 12, fontWeight: "700", color: "#d97706", marginBottom: 4 },
  boostCta: { gap: 8 },
  previewLine: { fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: 4 },
  expiredBox: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(185, 28, 28, 0.25)",
    backgroundColor: "rgba(185, 28, 28, 0.06)",
    marginBottom: 4,
  },
  expiredTitle: { fontSize: 14, fontWeight: "800", color: colors.ink },
  expiredSub: { marginTop: 4, fontSize: 12, fontWeight: "600", color: colors.muted },
  gradBtnOuter: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#9353FF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 7,
  },
  gradBtn: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  gradBtnTx: { fontSize: 15, fontWeight: "900", color: "#fff" },
  subHint: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  socialProof: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
    lineHeight: 14,
    opacity: 0.95,
  },
});
