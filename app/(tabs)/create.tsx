import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton } from "../../components/UiButton";
import { UiInput } from "../../components/UiInput";
import { useAuth } from "../../context/auth-context";
import { CATEGORIES } from "../../lib/categories";
import { clearPublishSlotPaid, isPublishSlotPaid } from "../../lib/paymentBridge";
import { emitListingCreated } from "../../lib/listingPromotionEvents";
import { insertListingRow } from "../../lib/listings";
import { hasListingPackageBalance } from "../../lib/packages";
import { countListingsInCategoryWindow, getCategoryRule, tryConsumePackage } from "../../lib/monetization";
import { formatPostgrestError, logRlsIfBlocked } from "../../lib/postgrestErrors";
import { uploadListingPhoto } from "../../lib/storageUpload";
import { registerRapidListingCreated } from "../../lib/trust";
import { getListingPublishBlockMessage } from "../../lib/trustPublishGate";
import { canEditListingsAndListingPhotos, getTrustLevel } from "../../lib/trustLevels";
import { supabase } from "../../lib/supabase";
import { colors, radius, shadow } from "../../lib/theme";
import { filterCitiesByQuery } from "../../lib/russianCities";
import { parseNonNegativePrice } from "../../lib/validate";
import { getCitiesFromDb } from "../../lib/listings";

export default function CreateListingScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const uid = session?.user?.id;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("Москва");
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("other");
  const [uris, setUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const dbCities = await getCitiesFromDb();
        console.log("[CITIES-CREATE] Loaded:", dbCities.length, "cities");
        setCities(dbCities);
      })();
    }, [])
  );

  console.log("[CITIES DEBUG] state:", cities?.length, cities);

  const filteredCities = useMemo(() => {
    if (!cityQuery.trim()) return cities;
    const q = cityQuery.toLowerCase();
    return cities.filter(c => c.toLowerCase().includes(q));
  }, [cityQuery, cities]);

  console.log("[CITIES DEBUG] filtered:", filteredCities?.length, filteredCities);

  function validateForm(): string | null {
    if (!title.trim() || title.trim().length < 2) {
      return "Укажите заголовок (минимум 2 символа)";
    }
    if (parseNonNegativePrice(price) === null) {
      return "Укажите цену числом не ниже нуля";
    }
    if (!city.trim()) {
      return "Выберите город из списка";
    }
    return null;
  }

  const runInsert = useCallback(async () => {
    if (!uid) {
      console.error("SUPABASE_SAVE_ERROR: нет сессии — session.user.id отсутствует");
      throw new Error("Нет сессии. Войдите снова.");
    }
    const gate = await getListingPublishBlockMessage(uid, profile ?? null);
    if (gate) {
      throw new Error(gate);
    }
    const priceNum = parseNonNegativePrice(price);
    if (priceNum === null) {
      throw new Error("Некорректная цена");
    }

    const res = await insertListingRow({
      user_id: uid,
      title: title.trim(),
      description: description.trim(),
      price: priceNum,
      category,
      city: city.trim() || "Не указан",
      contact_phone: profile?.phone ?? null,
    });
    console.log("CREATE LISTING RESULT", res);
    if (res.error) {
      Alert.alert("Ошибка", res.error);
      return;
    }
    if (!res.id) {
      Alert.alert("Ошибка", "Не удалось создать объявление. Попробуй снова.");
      return;
    }
    const lid = res.id;

    for (let i = 0; i < uris.length; i++) {
      const url = await uploadListingPhoto(uid, lid, uris[i]!, i);
      const imgRow = { listing_id: lid, url, sort_order: i };
      console.log("IMAGES_INSERT payload", imgRow);
      const { data: imgData, error: ie } = await supabase.from("images").insert(imgRow).select();
      console.log("DATA", imgData);
      console.log("ERROR", ie);
      logRlsIfBlocked(ie);
      if (ie) {
        console.error("SUPABASE_SAVE_ERROR:", ie);
        throw ie;
      }
    }

    emitListingCreated();
    registerRapidListingCreated(uid);

    Alert.alert("Готово", "Объявление в ленте.", [
      {
        text: "OK",
        onPress: () => {
          router.replace("/(tabs)");
        },
      },
    ]);
    setTitle("");
    setDescription("");
    setPrice("");
    setCity("");
    setUris([]);
  }, [uid, profile, title, description, price, city, category, uris]);

  useFocusEffect(
    useCallback(() => {
      if (!isPublishSlotPaid()) return;
      let cancelled = false;
      (async () => {
        setBusy(true);
        try {
          if (!uid) {
            console.error("SUPABASE_SAVE_ERROR: автопубликация без сессии");
            Alert.alert("Вход", "Войдите, чтобы опубликовать объявление");
            clearPublishSlotPaid();
            return;
          }
          const v = validateForm();
          if (v) {
            Alert.alert("Проверка", v);
            clearPublishSlotPaid();
            return;
          }
          await runInsert();
          if (!cancelled) clearPublishSlotPaid();
        } catch (e: unknown) {
          if (!cancelled) {
            console.error("SUPABASE_SAVE_ERROR:", e);
            Alert.alert("Ошибка", formatPostgrestError(e));
            clearPublishSlotPaid();
          }
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [uid, title, description, price, city, category, runInsert])
  );

  async function pick() {
    if (!canEditListingsAndListingPhotos(profile?.trust_score)) {
      Alert.alert("Ограничение", "Загрузка фото к объявлениям недоступна при текущем уровне доверия.");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Разрешите доступ к фото");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 8,
    });
    if (!res.canceled) {
      setUris((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, 8));
    }
  }

  async function publish() {
    if (!uid) {
      console.error("SUPABASE_SAVE_ERROR: публикация без сессии — нет session.user.id");
      Alert.alert("Вход", "Войдите, чтобы опубликовать объявление");
      router.push("/(auth)/email");
      return;
    }
    const v = validateForm();
    if (v) {
      Alert.alert("Проверка", v);
      return;
    }
    const level = getTrustLevel(profile?.trust_score);
    if (level === "CRITICAL") {
      Alert.alert("Ограничение", "Ваш аккаунт ограничен. Публикация недоступна.");
      return;
    }
    if (level === "LOW") {
      const msg = await getListingPublishBlockMessage(uid, profile ?? null);
      if (msg) {
        Alert.alert("Ограничение", msg);
        return;
      }
    }
    setBusy(true);
    try {
      const rule = getCategoryRule(category);
      const inWindow = await countListingsInCategoryWindow(uid, category, rule.periodDays);
      if (inWindow >= rule.freeLimit) {
        const packageRes = await tryConsumePackage(uid, category);
        if (packageRes.ok && packageRes.consumed) {
          await runInsert();
          await refreshProfile();
          return;
        }
        const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? category;
        const paymentParams = {
          flow: "publish" as const,
          amount: String(rule.priceRub),
          title: `Размещение — ${catLabel}`,
        };
        setBusy(false);
        if (!hasListingPackageBalance(profile, category)) {
          Alert.alert(
            "Размещение",
            "Выгоднее взять пакет и сэкономить до 70%",
            [
              { text: "Посмотреть пакеты", onPress: () => router.push("/settings-packages") },
              {
                text: "Оплатить разово",
                style: "cancel",
                onPress: () =>
                  router.push({
                    pathname: "/payment",
                    params: paymentParams,
                  }),
              },
            ]
          );
          return;
        }
        router.push({
          pathname: "/payment",
          params: paymentParams,
        });
        return;
      }
      await runInsert();
    } catch (e: unknown) {
      console.error("SUPABASE_SAVE_ERROR:", e);
      Alert.alert("Ошибка", formatPostgrestError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.h1}>Новое объявление</Text>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pick} style={[styles.addPh, shadow.soft]}>
          <Text style={styles.addPhText}>+ Добавить фото</Text>
          <Text style={styles.addPhSub}>до 8 изображений</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
          {uris.map((u) => (
            <Image key={u} source={{ uri: u }} style={styles.thumb} />
          ))}
        </ScrollView>
        <UiInput label="Заголовок" value={title} onChangeText={setTitle} placeholder="Например, iPhone 15 Pro" />
        <Text style={styles.label}>Описание</Text>
        <TextInput
          style={styles.area}
          multiline
          placeholder="Состояние, комплектация, причина продажи…"
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />
        <Text style={styles.label}>Категория</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.cat, category === c.id && styles.catOn]}
            >
              <Text style={[styles.catTx, category === c.id && styles.catTxOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <UiInput label="Цена, ₽" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0" />
        <Text style={styles.label}>Город</Text>
        <Pressable
          onPress={() => {
            setCityQuery("");
            setCityModalOpen(true);
          }}
          style={styles.cityPick}
        >
          <Text style={styles.cityPickTx}>{city.trim() || "Выберите город"}</Text>
          <Text style={styles.cityPickHint}>Список городов РФ</Text>
        </Pressable>
        <UiButton title="Опубликовать" loading={busy} onPress={publish} />
      </ScrollView>

      <Modal visible={cityModalOpen} animationType="slide" transparent>
        <View style={styles.cityModalRoot}>
          <Pressable style={styles.cityModalBackdrop} onPress={() => setCityModalOpen(false)} />
          <View style={styles.cityModalSheet}>
            <Text style={styles.cityModalTitle}>Город</Text>
            <TextInput
              style={styles.cityModalSearch}
              placeholder="Поиск: Сочи, Москва…"
              placeholderTextColor={colors.muted}
              value={cityQuery}
              onChangeText={setCityQuery}
            />
            <View style={styles.cityModalListWrap}>
              <FlatList
                data={filteredCities}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                style={styles.cityModalList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.cityModalRow, city === item && styles.cityModalRowOn]}
                    onPress={() => {
                      setCity(item);
                      setCityModalOpen(false);
                    }}
                  >
                    <Text style={[styles.cityModalRowTx, city === item && styles.cityModalRowTxOn]}>{item}</Text>
                  </Pressable>
                )}
              />
            </View>
            <Pressable style={styles.cityModalClose} onPress={() => setCityModalOpen(false)}>
              <Text style={styles.cityModalCloseTx}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.ink,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  addPh: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderStyle: "dashed",
    padding: 24,
    alignItems: "center",
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  addPhText: { fontSize: 16, fontWeight: "600", color: colors.violet },
  addPhSub: { marginTop: 4, color: colors.muted, fontSize: 13 },
  thumbRow: { marginBottom: 16, maxHeight: 88 },
  thumb: { width: 88, height: 88, borderRadius: radius.md, marginRight: 8, backgroundColor: colors.surface2 },
  label: { fontSize: 14, fontWeight: "600", color: colors.muted, marginBottom: 8 },
  area: {
    minHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 16,
  },
  cat: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginRight: 8,
  },
  catOn: { borderColor: colors.violet, backgroundColor: "#F3EEFF" },
  catTx: { fontSize: 13, color: colors.ink },
  catTxOn: { color: colors.violet, fontWeight: "600" },
  cityPick: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 16,
  },
  cityPickTx: { fontSize: 16, fontWeight: "600", color: colors.ink },
  cityPickHint: { marginTop: 4, fontSize: 13, color: colors.muted },
  cityModalRoot: { flex: 1, justifyContent: "flex-end" },
  cityModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,18,28,0.4)" },
  cityModalSheet: {
    height: "72%",
    maxHeight: "72%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  cityModalTitle: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  cityModalSearch: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 8,
  },
  cityModalListWrap: { flex: 1, minHeight: 120 },
  cityModalList: { flex: 1 },
  cityModalRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cityModalRowOn: { backgroundColor: "#F3EEFF" },
  cityModalRowTx: { fontSize: 16, color: colors.ink },
  cityModalRowTxOn: { color: colors.violet, fontWeight: "600" },
  cityModalClose: { marginTop: 16, alignItems: "center", paddingVertical: 12 },
  cityModalCloseTx: { fontSize: 16, fontWeight: "600", color: colors.violet },
});
