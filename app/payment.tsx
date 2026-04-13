import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../components/UiButton";
import { useAuth } from "../context/auth-context";
import { useRedirectIfNeedsPhone } from "../hooks/useRedirectIfNeedsPhone";
import { trackBoostEvent } from "../lib/boostAnalytics";
import { BOOST_PREVIEW_ABOVE_OTHERS, boostComparisonUi, estimateViews } from "../lib/boostMarketing";
import {
  defaultBoostCtaPriceRub,
  expoVipUpsellAfterBoostParams,
  VIP_UPSELL_BASE_PRICE_RUB,
  VIP_UPSELL_DISCOUNT_PRICE_RUB,
} from "../lib/boostPay";
import { emitBoostActivated, emitListingPromotionApplied } from "../lib/listingPromotionEvents";
import { fetchListingById } from "../lib/listings";
import { markPublishSlotPaid } from "../lib/paymentBridge";
import { isPaymentProcessed, logPaymentEvent, markPaymentProcessed } from "../lib/paymentLogs";
import { validatePromotionPaymentAmount } from "../lib/paymentValidation";
import { confirmPayment, createPaymentIntent, paymentRailLabel, verifyPayment, type PaymentRail } from "../lib/payments";
import { safeGoBack } from "../lib/safeNavigation";
import {
  applyListingPromotionMock,
  applyPromotionTariff,
  parsePromotionKind,
  parsePromotionTariffKind,
} from "../lib/monetization";
import { packageByKind, parsePackageKind } from "../lib/packages";
import { supabase } from "../lib/supabase";
import { colors, radius, shadow } from "../lib/theme";
import type { ListingRow } from "../lib/types";

function oneParam(p: string | string[] | undefined): string | undefined {
  if (p == null) return undefined;
  return Array.isArray(p) ? p[0] : p;
}

type RailOption = {
  id: PaymentRail;
  title: string;
  sub: string;
  accent: string;
};

const RAILS: RailOption[] = [
  {
    id: "sbp",
    title: "Система быстрых платежей (СБП)",
    sub: "Сканируйте QR в приложении банка или выберите банк из списка",
    accent: "#7B4FE8",
  },
  {
    id: "sber",
    title: "СберБанк Онлайн",
    sub: "Оплата через приложение СберБанка",
    accent: "#21A038",
  },
  {
    id: "tinkoff",
    title: "Тинькофф",
    sub: "Оплата в приложении Т-Банка",
    accent: "#FFDD2D",
  },
  {
    id: "vtb",
    title: "ВТБ Онлайн",
    sub: "Оплата через ВТБ",
    accent: "#0A2896",
  },
  {
    id: "alfa",
    title: "Альфа-Онлайн",
    sub: "Оплата в приложении Альфа-Банка",
    accent: "#EF3124",
  },
  {
    id: "raiffeisen",
    title: "Райффайзен Онлайн",
    sub: "Оплата в приложении банка",
    accent: "#FFED00",
  },
  {
    id: "card_mir",
    title: "Банковская карта",
    sub: "МИР, Visa, Mastercard — ввод реквизитов на защищённой странице банка",
    accent: "#0F766E",
  },
];

function formatRub(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function isBoostTariffKey(s: string | undefined): boolean {
  return s === "boost_3" || s === "boost_7";
}

type PaymentUiState = "idle" | "creating" | "pending" | "confirmed" | "failed";

function BoostSuccessView(props: {
  router: ReturnType<typeof useRouter>;
  uid?: string | null;
  vipUpsell: boolean;
  boostSuccess: { listingId: string };
}) {
  const { router, uid, vipUpsell, boostSuccess } = props;
  const scale = useRef(new Animated.Value(0.88)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Готово</Text>
        <View style={{ width: 28 }} />
      </View>
      <View style={styles.successBody}>
        <View style={styles.successHeadWrap}>
          <View style={styles.successParticles} pointerEvents="none">
            <View style={[styles.successParticle, { left: "12%", top: "18%" }]} />
            <View style={[styles.successParticle, { left: "78%", top: "28%" }]} />
            <View style={[styles.successParticle, { left: "44%", top: "8%" }]} />
            <View style={[styles.successParticle, { left: "62%", top: "52%" }]} />
          </View>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Text style={styles.successHead}>🚀 ВЫ В ТОПЕ</Text>
          </Animated.View>
        </View>
        {vipUpsell ? (
          <View style={styles.vipCard}>
            <Text style={styles.vipAsk}>Закрепить и получать максимум клиентов?</Text>
            <Text style={styles.vipSub}>VIP даёт ещё больше показов</Text>
            <View style={styles.vipPriceRow}>
              <Text style={styles.vipPriceBase}>{VIP_UPSELL_BASE_PRICE_RUB} ₽</Text>
              <Text style={styles.vipPriceDiscount}>{VIP_UPSELL_DISCOUNT_PRICE_RUB} ₽</Text>
              <View style={styles.vipDiscountBadge}>
                <Text style={styles.vipDiscountBadgeTx}>Скидка</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                try {
                  Vibration.vibrate(12);
                } catch {
                  /* ignore */
                }
                router.replace({
                  pathname: "/payment",
                  params: expoVipUpsellAfterBoostParams(boostSuccess.listingId, uid),
                });
              }}
              style={styles.vipBtnWrap}
            >
              <LinearGradient
                colors={["#7B4FE8", "#0abab5"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.vipBtnGrad}
              >
                <Text style={styles.vipBtnTx}>Включить VIP за {VIP_UPSELL_DISCOUNT_PRICE_RUB} ₽</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
        <UiButton title="На ленту" variant="outline" onPress={() => safeGoBack(router)} />
      </View>
    </SafeAreaView>
  );
}

export default function PaymentScreen() {
  useRedirectIfNeedsPhone();
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const raw = useLocalSearchParams<{
    amount?: string;
    title?: string;
    listingId?: string;
    promoKind?: string;
    flow?: string;
    paymentType?: string;
    packageType?: string;
  }>();

  const amountStr = oneParam(raw.amount);
  const amountNum = amountStr ? Number(amountStr) : NaN;
  const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
  const orderTitle = (oneParam(raw.title) ?? "").trim() || "Оплата на ENIGMA";
  const isPublishFlow = oneParam(raw.flow) === "publish";
  const listingId = oneParam(raw.listingId);
  const promoKindRaw = oneParam(raw.promoKind);
  const paymentType = oneParam(raw.paymentType);
  const packageTypeRaw = oneParam(raw.packageType);

  const showBoostPreview = Boolean(listingId && isBoostTariffKey(promoKindRaw));

  const [rail, setRail] = useState<PaymentRail>("sbp");
  const [paymentState, setPaymentState] = useState<PaymentUiState>("idle");
  const [listingRow, setListingRow] = useState<ListingRow | null>(null);
  const [boostSuccess, setBoostSuccess] = useState<{ listingId: string } | null>(null);
  const [vipUpsell, setVipUpsell] = useState(false);
  const busy = paymentState === "creating" || paymentState === "pending";

  const description = useMemo(() => `ENIGMA — ${orderTitle}`, [orderTitle]);
  const viewEst = useMemo(() => {
    if (!listingRow) return null;
    return estimateViews(listingRow);
  }, [listingRow]);
  const cmpUi = useMemo(() => (listingRow ? boostComparisonUi(listingRow) : null), [listingRow]);
  const defaultBoostPrice = defaultBoostCtaPriceRub();

  useEffect(() => {
    if (showBoostPreview && listingId) {
      trackBoostEvent("boost_payment_open", { listingId, promoKind: promoKindRaw });
    }
  }, [showBoostPreview, listingId, promoKindRaw]);

  useEffect(() => {
    if (!listingId?.trim()) return;
    let cancelled = false;
    void (async () => {
      const res = await fetchListingById(listingId.trim());
      if (cancelled) return;
      if (res.row) setListingRow(res.row);
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    if (!boostSuccess) return;
    const t = setTimeout(() => setVipUpsell(true), 2000);
    return () => clearTimeout(t);
  }, [boostSuccess]);

  useEffect(() => {
    setBoostSuccess(null);
    setVipUpsell(false);
  }, [listingId, promoKindRaw, amountStr]);

  function tapHaptic() {
    try {
      Vibration.vibrate(12);
    } catch {
      /* ignore */
    }
  }

  async function pay() {
    if (!hasAmount) {
      Alert.alert("Сумма не указана", "Откройте оплату из карточки объявления или при публикации.");
      return;
    }
    if (!session?.user?.id) {
      Alert.alert("Нужен вход", "Войдите в аккаунт, чтобы продолжить оплату.");
      return;
    }
    tapHaptic();
    const uid = session.user.id;
    const lid = listingId?.trim() ?? null;
    const tariffKind = parsePromotionTariffKind(promoKindRaw);
    let secureAmount = amountNum;
    if (tariffKind) {
      const amountCheck = validatePromotionPaymentAmount(tariffKind, amountNum);
      if (!amountCheck.valid) {
        setPaymentState("failed");
        Alert.alert("Ошибка", amountCheck.reason ?? "Сумма не прошла проверку.");
        logPaymentEvent({
          user_id: uid,
          listing_id: lid,
          promoKind: tariffKind,
          amount: amountNum,
          status: "invalid",
        });
        return;
      }
      secureAmount = amountCheck.normalizedAmountRub;
    }

    setPaymentState("creating");
    logPaymentEvent({
      user_id: uid,
      listing_id: lid,
      promoKind: promoKindRaw ?? null,
      amount: secureAmount,
      status: "creating",
    });

    try {
      const intent = await createPaymentIntent(rail, secureAmount, description, {
        user_id: uid,
        listing_id: lid ?? "",
        promoKind: promoKindRaw ?? "",
      });

      setPaymentState("pending");
      logPaymentEvent({
        user_id: uid,
        listing_id: lid,
        promoKind: promoKindRaw ?? null,
        amount: secureAmount,
        payment_id: intent.id,
        status: "pending",
      });

      const confirmedStatus = await confirmPayment(intent.id);
      if (confirmedStatus !== "confirmed") {
        setPaymentState("failed");
        Alert.alert("Ошибка", "Платёж не подтверждён. Попробуйте ещё раз.");
        logPaymentEvent({
          user_id: uid,
          listing_id: lid,
          promoKind: promoKindRaw ?? null,
          amount: secureAmount,
          payment_id: intent.id,
          status: "failed",
        });
        return;
      }

      const verifyStatus = await verifyPayment(intent.id);
      if (verifyStatus !== "confirmed") {
        setPaymentState("failed");
        Alert.alert("Ошибка", "Платёж не прошёл проверку.");
        logPaymentEvent({
          user_id: uid,
          listing_id: lid,
          promoKind: promoKindRaw ?? null,
          amount: secureAmount,
          payment_id: intent.id,
          status: "failed",
        });
        return;
      }

      setPaymentState("confirmed");
      logPaymentEvent({
        user_id: uid,
        listing_id: lid,
        promoKind: promoKindRaw ?? null,
        amount: secureAmount,
        payment_id: intent.id,
        status: "confirmed",
      });

      if (isPaymentProcessed(intent.id)) {
        Alert.alert("Оплата уже обработана", "Повторное списание не выполняется.");
        return;
      }

      if (isPublishFlow) {
        markPublishSlotPaid();
        safeGoBack(router);
        return;
      }

      if (paymentType === "package") {
        const pkgKind = parsePackageKind(packageTypeRaw);
        const def = pkgKind ? packageByKind(pkgKind) : undefined;
        if (!pkgKind || !def) {
          Alert.alert("Ошибка", "Неизвестный тип пакета.");
          return;
        }
        const { error } = await supabase.rpc("add_package_credits", {
          p_kind: pkgKind,
          p_slots: def.slots,
        });
        if (error) {
          Alert.alert(
            "Не удалось начислить пакет",
            `${error.message}\n\nЕсли колонок ещё нет в БД, выполните миграцию 006_listing_packages.sql в Supabase.`
          );
          return;
        }
        await refreshProfile();
        Alert.alert("Готово", `Пакет «${def.headline}» активирован: +${def.slots} размещений.`, [
          { text: "OK", onPress: () => safeGoBack(router) },
        ]);
        return;
      }

      if (lid && tariffKind) {
        const guard = validatePromotionPaymentAmount(tariffKind, secureAmount);
        if (!guard.valid) {
          setPaymentState("failed");
          Alert.alert("Ошибка", guard.reason ?? "Сумма не прошла проверку.");
          logPaymentEvent({
            user_id: uid,
            listing_id: lid,
            promoKind: tariffKind,
            amount: secureAmount,
            payment_id: intent.id,
            status: "invalid",
          });
          return;
        }
        const { data: fresh, error } = await supabase.from("listings").select("*").eq("id", lid).maybeSingle();
        if (error || !fresh) {
          setPaymentState("failed");
          Alert.alert("Ошибка", "Не удалось загрузить объявление.");
          return;
        }
        const res = await applyPromotionTariff(fresh as ListingRow, tariffKind);
        if (!res.ok) {
          setPaymentState("failed");
          Alert.alert("Ошибка", res.message);
          return;
        }
        logPaymentEvent({
          user_id: uid,
          listing_id: lid,
          promoKind: tariffKind,
          amount: secureAmount,
          payment_id: intent.id,
          status: "applied",
        });
        markPaymentProcessed(intent.id);
        const isBoost = tariffKind === "boost_3" || tariffKind === "boost_7";
        if (isBoost) {
          emitBoostActivated(lid);
          trackBoostEvent("boost_paid", { listingId: lid, promoKind: tariffKind });
          setBoostSuccess({ listingId: lid });
        } else {
          emitListingPromotionApplied(lid);
          Alert.alert("Оплата прошла успешно", "Услуга подключена.", [
            { text: "OK", onPress: () => safeGoBack(router) },
          ]);
        }
        return;
      }

      const kind = parsePromotionKind(promoKindRaw);
      if (lid && kind) {
        const { data: fresh, error } = await supabase.from("listings").select("*").eq("id", lid).maybeSingle();
        if (error || !fresh) {
          setPaymentState("failed");
          Alert.alert("Ошибка", "Не удалось загрузить объявление.");
          return;
        }
        const res = await applyListingPromotionMock(fresh as ListingRow, kind);
        if (!res.ok) {
          setPaymentState("failed");
          Alert.alert("Ошибка", res.message);
          return;
        }
        if (kind === "boost") {
          emitBoostActivated(lid);
          trackBoostEvent("boost_paid", { listingId: lid, kind: "boost" });
          setBoostSuccess({ listingId: lid });
        } else {
          emitListingPromotionApplied(lid);
          Alert.alert("Оплата прошла успешно", "Услуга подключена.", [
            { text: "OK", onPress: () => safeGoBack(router) },
          ]);
        }
        markPaymentProcessed(intent.id);
        return;
      }

      Alert.alert("Оплата прошла успешно", `Способ: ${paymentRailLabel(rail)}`, [
        { text: "OK", onPress: () => safeGoBack(router) },
      ]);
    } catch {
      setPaymentState("failed");
      Alert.alert("Ошибка", "Платёж завершился с ошибкой. Попробуйте снова.");
    } finally {
      setTimeout(() => {
        setPaymentState((prev) => (prev === "failed" ? "idle" : prev));
      }, 1200);
    }
  }

  if (boostSuccess) {
    const uid = session?.user?.id;
    return <BoostSuccessView router={router} uid={uid} vipUpsell={vipUpsell} boostSuccess={boostSuccess} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Оплата</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.tapLine}>⚡ Оплатить в 1 тап</Text>
        <Text style={styles.tapHint}>Apple Pay / Google Pay — при подключении эквайринга.</Text>

        <View style={[styles.sumCard, shadow.soft]}>
          <Text style={styles.sumLabel}>К оплате</Text>
          {hasAmount ? (
            <Text style={styles.sumValue}>{formatRub(amountNum)}</Text>
          ) : (
            <Text style={styles.sumMissing}>—</Text>
          )}
          <Text style={styles.orderName}>{orderTitle}</Text>
          {showBoostPreview ? (
            <View style={styles.previewBoost}>
              <Text style={styles.previewBoostTitle}>{BOOST_PREVIEW_ABOVE_OTHERS}</Text>
              <Text style={styles.previewBoostSub}>После оплаты — приоритет в ленте на выбранный срок.</Text>
            </View>
          ) : null}
          {showBoostPreview && cmpUi ? (
            <View style={styles.compareCard}>
              <Text style={styles.compareCardTitle}>Без буста · С бустом</Text>
              <View style={styles.compareGrid}>
                <Text style={styles.compareLeft}>{cmpUi.baselineViews.toLocaleString("ru-RU")} просмотров</Text>
                <Text style={styles.compareRight}>{cmpUi.boostedViews.toLocaleString("ru-RU")} просмотров</Text>
                <Text style={styles.compareLeft}>1–2 сообщения</Text>
                <Text style={styles.compareRight}>15+ сообщений</Text>
                <Text style={styles.compareLeft}>низко в ленте</Text>
                <Text style={styles.compareRightHot}>в топе 🔥</Text>
              </View>
            </View>
          ) : null}
          {showBoostPreview && viewEst ? (
            <View style={styles.estimateBox}>
              <Text style={styles.estimateLabel}>Прогноз просмотров</Text>
              <Text style={styles.estimateBase}>
                👁 Обычно: {viewEst.baseline.toLocaleString("ru-RU")} просмотров
              </Text>
              <Text style={styles.estimateBoost}>
                🔥 С бустом: {viewEst.boosted.toLocaleString("ru-RU")}+ просмотров
              </Text>
            </View>
          ) : null}
          <Text style={styles.legalNote}>
            Платёж защищён. Реквизиты карты не хранятся в ENIGMA — ввод на стороне банка или СБП (НСПК / ЦБ РФ).
          </Text>
          {!hasAmount ? (
            <Text style={styles.sumHint}>
              Сумма подставится из объявления или при оплате размещения при публикации.
            </Text>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Способ оплаты</Text>
        <Text style={styles.sectionHint}>Как в типичном чек-ауте РФ: СБП, крупные банки, карта.</Text>

        {RAILS.map((r) => {
          const on = rail === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => {
                tapHaptic();
                setRail(r.id);
              }}
              style={[styles.card, shadow.soft, on && styles.cardOn]}
            >
              <View style={[styles.accentBar, { backgroundColor: r.accent }]} />
              <View style={styles.cardBody}>
                <View style={styles.radioRow}>
                  <View style={styles.radio}>{on ? <View style={styles.radioIn} /> : null}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{r.title}</Text>
                    <Text style={styles.cardSub}>{r.sub}</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}

        <View style={{ height: 24 }} />
      </ScrollView>

      <View style={styles.footer}>
        {hasAmount ? (
          <>
            <Pressable disabled={busy} onPress={() => void pay()} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
              <LinearGradient
                colors={["#9353FF", "#7B4FE8", "#22d3ee"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.payGrad, busy && { opacity: 0.6 }]}
              >
                <Text style={styles.payGradTx}>
                  {busy
                    ? "…"
                    : showBoostPreview
                      ? `⚡ Получить просмотры за ${hasAmount ? amountNum : defaultBoostPrice} ₽`
                      : `Оплатить ${formatRub(amountNum)}`}
                </Text>
              </LinearGradient>
            </Pressable>
            <Text style={styles.footerMicro}>💡 Это занимает меньше 10 секунд</Text>
            <Text style={styles.footerTrust}>🔒 Безопасная оплата</Text>
            <Text style={styles.footerTrust}>⚡ Мгновенная активация</Text>
          </>
        ) : (
          <UiButton variant="outline" title="Закрыть" onPress={() => safeGoBack(router)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.ink },
  scroll: { paddingHorizontal: 20, paddingBottom: 16 },
  tapLine: { fontSize: 13, fontWeight: "700", color: colors.violet, marginBottom: 4 },
  tapHint: { fontSize: 11, color: colors.muted, marginBottom: 14, lineHeight: 16 },
  sumCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 22,
  },
  sumLabel: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  sumValue: { marginTop: 6, fontSize: 32, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  sumMissing: { marginTop: 6, fontSize: 28, fontWeight: "700", color: colors.muted },
  orderName: { marginTop: 12, fontSize: 16, fontWeight: "600", color: colors.ink, lineHeight: 22 },
  legalNote: { marginTop: 14, fontSize: 12, color: colors.muted, lineHeight: 18 },
  sumHint: { marginTop: 12, fontSize: 13, color: colors.muted, lineHeight: 19 },
  previewBoost: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: "rgba(123, 79, 232, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(123, 79, 232, 0.28)",
  },
  previewBoostTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, lineHeight: 22 },
  previewBoostSub: { marginTop: 6, fontSize: 12, color: colors.muted, lineHeight: 17 },
  estimateBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  estimateLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  estimateBase: { fontSize: 14, color: colors.ink, marginBottom: 4 },
  estimateBoost: { fontSize: 14, fontWeight: "800", color: "#0abab5" },
  sectionLabel: { fontSize: 17, fontWeight: "700", color: colors.ink, marginBottom: 6 },
  sectionHint: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 14 },
  card: {
    flexDirection: "row",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardOn: { borderColor: colors.violet, backgroundColor: "#FAF8FF" },
  accentBar: { width: 4 },
  cardBody: { flex: 1, paddingVertical: 14, paddingRight: 14, paddingLeft: 10 },
  radioRow: { flexDirection: "row", alignItems: "flex-start" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.violet,
    marginRight: 10,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioIn: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  cardSub: { marginTop: 6, fontSize: 13, color: colors.muted, lineHeight: 18 },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  payGrad: {
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#9353FF",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.42,
    shadowRadius: 18,
    elevation: 7,
  },
  payGradTx: { fontSize: 16, fontWeight: "800", color: "#fff" },
  footerMicro: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  footerTrust: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600",
    color: colors.muted,
  },
  compareCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  compareCardTitle: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  compareGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  compareLeft: { width: "50%", fontSize: 12, color: colors.muted, lineHeight: 16 },
  compareRight: { width: "50%", fontSize: 12, fontWeight: "700", color: colors.ink, textAlign: "right", lineHeight: 16 },
  compareRightHot: {
    width: "50%",
    fontSize: 12,
    fontWeight: "800",
    color: "#fbbf24",
    textAlign: "right",
    lineHeight: 16,
  },
  successBody: { paddingHorizontal: 24, paddingTop: 32, gap: 20 },
  successHeadWrap: { position: "relative", alignItems: "center", minHeight: 72, justifyContent: "center" },
  successParticles: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.35,
  },
  successParticle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#7dd3fc",
  },
  successHead: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    lineHeight: 32,
    textAlign: "center",
    textShadowColor: "rgba(56, 189, 248, 0.35)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  vipCard: {
    padding: 18,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(123, 79, 232, 0.35)",
    backgroundColor: "rgba(123, 79, 232, 0.08)",
    gap: 10,
  },
  vipAsk: { fontSize: 16, fontWeight: "700", color: colors.ink },
  vipSub: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  vipPriceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vipPriceBase: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  vipPriceDiscount: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0abab5",
  },
  vipDiscountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(10,186,181,0.14)",
  },
  vipDiscountBadgeTx: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0abab5",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  vipBtnWrap: { borderRadius: radius.lg, overflow: "hidden", marginTop: 6 },
  vipBtnGrad: { paddingVertical: 16, alignItems: "center" },
  vipBtnTx: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
