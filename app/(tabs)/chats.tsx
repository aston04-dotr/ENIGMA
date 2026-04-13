import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/auth-context";
import { logSupabaseResult } from "../../lib/postgrestErrors";
import { supabase } from "../../lib/supabase";
import { colors, radius, shadow } from "../../lib/theme";
import type { UserRow } from "../../lib/types";

type Row = {
  id: string;
  other: UserRow | null;
  displayName: string;
  preview: string;
  isGroup: boolean;
};

export default function ChatsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user?.id;
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!me) return;
    const memberRes = await supabase.from("chat_members").select("chat_id").eq("user_id", me);
    logSupabaseResult("chats_screen_chat_members", { data: memberRes.data, error: memberRes.error });
    const chatIds = [...new Set((memberRes.data ?? []).map((r) => r.chat_id))];
    if (!chatIds.length) {
      setRows([]);
      return;
    }

    const chatsRes = await supabase
      .from("chats")
      .select("id,user1,user2,created_at,title,is_group")
      .in("id", chatIds)
      .order("created_at", { ascending: false });
    logSupabaseResult("chats_screen_chats", { data: chatsRes.data, error: chatsRes.error });
    const { data: chats, error } = chatsRes;
    if (error || !chats?.length) {
      setRows([]);
      return;
    }

    const others = chats
      .filter((c) => !c.is_group && c.user1 && c.user2)
      .map((c) => (c.user1 === me ? c.user2 : c.user1) as string);
    const { data: users } = await supabase.from("users").select("*").in("id", others);
    const umap = new Map((users ?? []).map((u) => [u.id, u as UserRow]));

    const enriched: Row[] = [];
    for (const c of chats) {
      const isGroup = !!c.is_group;
      let displayName = String(c.title ?? "").trim() || "Группа";
      let other: UserRow | null = null;
      if (!isGroup && c.user1 && c.user2) {
        const oid = c.user1 === me ? c.user2 : c.user1;
        other = umap.get(oid) ?? null;
        displayName = other?.name ?? "Пользователь";
      }

      const lastRes = await supabase
        .from("messages")
        .select("text,image_url,voice_url,deleted,created_at")
        .eq("chat_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRes.error) {
        logSupabaseResult(`chats_screen_last_msg_${c.id}`, { data: lastRes.data, error: lastRes.error });
      }
      const last = lastRes.data;
      let preview = "Напишите первым";
      if (last?.deleted) preview = "Сообщение удалено";
      else if (last?.image_url) preview = "Фото";
      else if (last?.voice_url) preview = "Голосовое";
      else if (last?.text) preview = last.text.slice(0, 80);
      enriched.push({ id: c.id, other, displayName, preview, isGroup });
    }
    setRows(enriched);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.h1}>Сообщения</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyT}>Нет переписок</Text>
            <Text style={styles.emptyS}>Откройте объявление и нажмите «Написать»</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}`)}
            style={({ pressed }) => [styles.row, shadow.soft, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTx}>{item.displayName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.prev} numberOfLines={2}>
                {item.preview}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  h1: { fontSize: 28, fontWeight: "700", color: colors.ink, paddingHorizontal: 20, marginBottom: 16 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarTx: { fontSize: 18, fontWeight: "700", color: colors.violet },
  name: { fontSize: 16, fontWeight: "600", color: colors.ink },
  prev: { marginTop: 4, fontSize: 14, color: colors.muted },
  empty: { padding: 40, alignItems: "center" },
  emptyT: { fontSize: 17, fontWeight: "600", color: colors.ink },
  emptyS: { marginTop: 8, color: colors.muted, textAlign: "center" },
});
