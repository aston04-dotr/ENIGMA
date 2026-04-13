import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import { RecordingOptionsPresets } from "expo-av/build/Audio/RecordingConstants";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useGlobalSearchParams, useLocalSearchParams, useRouter } from "expo-router";
import type { PostgrestError } from "@supabase/supabase-js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/auth-context";
import { useRedirectIfNeedsPhone } from "../../hooks/useRedirectIfNeedsPhone";
import { ensureDmChatMembership, isChatUuid } from "../../lib/chatMembers";
import { uploadChatImage, uploadChatVoice } from "../../lib/storageUpload";
import { isRlsViolation, logRlsIfBlocked, logSupabaseResult } from "../../lib/postgrestErrors";
import { safeGoBack } from "../../lib/safeNavigation";
import { supabase } from "../../lib/supabase";
import { colors, radius, shadow } from "../../lib/theme";
import type { MessageRow } from "../../lib/types";

const SCREEN_W = Dimensions.get("window").width;
const BUBBLE_IMG_MAX = SCREEN_W * 0.7;

function isOtherOnline(lastSeenIso: string | null): boolean {
  if (!lastSeenIso) return false;
  return Date.now() - new Date(lastSeenIso).getTime() < 30_000;
}

function VoiceBubble({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (Platform.OS === "web") return;
    try {
      if (playing && soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlaying(false);
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st: AVPlaybackStatus) => {
        if (st.isLoaded && "didJustFinish" in st && st.didJustFinish) {
          setPlaying(false);
          void sound.unloadAsync();
          soundRef.current = null;
        }
      });
      await sound.playAsync();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  return (
    <Pressable onPress={toggle} style={styles.voiceRow} hitSlop={8}>
      <Ionicons name={playing ? "pause" : "play"} size={22} color={colors.violet} />
      <Text style={styles.voiceLabel}>Голосовое сообщение</Text>
    </Pressable>
  );
}

/** Превью цитируемого: если родитель удалён или не в ленте — «Сообщение недоступно». */
function replySnippet(m: MessageRow | undefined, replyToId?: string | null): string {
  if (replyToId && !m) return "Сообщение недоступно";
  if (!m) return "Сообщение";
  if (m.deleted) return "Сообщение недоступно";
  if (m.image_url) return "Фото";
  if (m.voice_url) return "Голосовое";
  return (m.text || "").slice(0, 120) || "Сообщение";
}

function pinnedBarSnippet(m: MessageRow | undefined): string {
  if (!m) return "Сообщение";
  if (m.deleted) return "Сообщение удалено";
  if (m.image_url) return "Фото";
  if (m.voice_url) return "Голосовое";
  return (m.text || "").slice(0, 120) || "Сообщение";
}

/** Realtime INSERT + optimistic: без дублей по id, temp-строке и запасному совпадению контента. */
type ChatMetaRow = {
  user1: string | null;
  user2: string | null;
  title: string | null;
  is_group: boolean | null;
  pinned_message_id: string | null;
};

function mergeIncomingInsert(prev: MessageRow[], row: MessageRow): MessageRow[] {
  if (prev.some((m) => m.id === row.id)) {
    return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
  }
  const tempIdx = prev.findIndex(
    (m) =>
      m.id.startsWith("temp-") &&
      m.sender_id === row.sender_id &&
      m.text === row.text &&
      (m.image_url ?? null) === (row.image_url ?? null) &&
      (m.voice_url ?? null) === (row.voice_url ?? null) &&
      (m.reply_to ?? null) === (row.reply_to ?? null)
  );
  if (tempIdx >= 0) {
    const next = [...prev];
    next[tempIdx] = row;
    return next;
  }
  const fallbackIdx = prev.findIndex(
    (m) =>
      m.sender_id === row.sender_id &&
      m.text === row.text &&
      (m.image_url ?? null) === (row.image_url ?? null) &&
      (m.voice_url ?? null) === (row.voice_url ?? null) &&
      (m.reply_to ?? null) === (row.reply_to ?? null) &&
      Math.abs(new Date(m.created_at).getTime() - new Date(row.created_at).getTime()) < 15_000
  );
  if (fallbackIdx >= 0) {
    const next = [...prev];
    next[fallbackIdx] = { ...next[fallbackIdx], ...row };
    return next;
  }
  return [...prev, row];
}

export default function ChatThreadScreen() {
  const localParams = useLocalSearchParams<{ id?: string | string[] }>();
  const globalParams = useGlobalSearchParams<{ id?: string | string[] }>();
  const rawId = localParams.id ?? globalParams.id;
  const chatId: string | null =
    Array.isArray(rawId) ? (rawId[0] ?? "").trim() || null : typeof rawId === "string" ? rawId.trim() || null : null;

  const router = useRouter();
  useRedirectIfNeedsPhone();
  const { session } = useAuth();
  const me = session?.user?.id;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const textRef = useRef("");
  const sendGestureLockRef = useRef(false);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordStartedAtRef = useRef(0);
  const [recordingUi, setRecordingUi] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);

  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherName, setOtherName] = useState<string>("");
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(null);
  const [typingOther, setTypingOther] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [groupTitle, setGroupTitle] = useState<string>("");
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string>("member");

  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageRow | null>(null);

  const isAtBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const forceScrollAfterSendRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const loadRlsRetryRef = useRef(false);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const handleListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const h = contentSize.height;
    const vh = layoutMeasurement.height;
    const y = contentOffset.y;
    if (!Number.isFinite(h) || h <= 0) return;
    const distanceFromBottom = h - (vh + y);
    const atBottom = distanceFromBottom < 80;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
  }, []);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    prevMsgCountRef.current = 0;
    isAtBottomRef.current = true;
    setShowScrollButton(false);
    loadRlsRetryRef.current = false;
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !me) return;
    let cancelled = false;
    void (async () => {
      let chat: ChatMetaRow | null = null;
      try {
        const res = await supabase
          .from("chats")
          .select("user1,user2,title,is_group,pinned_message_id")
          .eq("id", chatId)
          .maybeSingle();
        if (res.error) console.error("chat meta", res.error);
        chat = (res.data as ChatMetaRow | null) ?? null;
      } catch (e) {
        console.error("chat meta", e);
      }
      if (cancelled || !chat) return;
      setIsGroup(!!chat.is_group);
      setGroupTitle(String(chat.title ?? ""));
      setPinnedMessageId(chat.pinned_message_id ? String(chat.pinned_message_id) : null);

      if (chat.is_group) {
        setOtherUserId(null);
        setOtherName("");
        return;
      }
      if (!chat.user1 || !chat.user2) return;
      const oid = chat.user1 === me ? chat.user2 : chat.user1;
      setOtherUserId(oid);
      void ensureDmChatMembership(chatId);
      const { data: u } = await supabase.from("users").select("name").eq("id", oid).maybeSingle();
      if (!cancelled && u?.name) setOtherName(String(u.name));

      const { data: mem } = await supabase
        .from("chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("user_id", me)
        .maybeSingle();
      if (!cancelled && mem?.role) setMyRole(String(mem.role));
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId, me]);

  useEffect(() => {
    if (!chatId || !me) return;
    void supabase
      .from("chat_members")
      .select("role")
      .eq("chat_id", chatId)
      .eq("user_id", me)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.role) setMyRole(String(data.role));
      });
  }, [chatId, me]);

  useEffect(() => {
    if (!me) return;
    const pulse = () => {
      void supabase.from("online_users").upsert(
        { user_id: me, last_seen: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    };
    pulse();
    const id = setInterval(pulse, 15_000);
    return () => clearInterval(id);
  }, [me]);

  useEffect(() => {
    if (!otherUserId) return;
    void supabase
      .from("online_users")
      .select("last_seen")
      .eq("user_id", otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.last_seen) setOtherLastSeen(String(data.last_seen));
      });

    const ch = supabase
      .channel(`online-peer-${otherUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "online_users",
          filter: `user_id=eq.${otherUserId}`,
        },
        (payload) => {
          const row = payload.new as { last_seen?: string } | undefined;
          if (row?.last_seen) setOtherLastSeen(String(row.last_seen));
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [otherUserId]);

  const load = useCallback(async () => {
    if (!chatId) {
      setLoading(false);
      return;
    }
    if (!isChatUuid(chatId)) {
      console.error("chat load: invalid chat_id", chatId);
      setLoading(false);
      return;
    }
    try {
      let res = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });
      logSupabaseResult("messages_load", { data: res.data, error: res.error });

      if (res.error && isRlsViolation(res.error) && !loadRlsRetryRef.current) {
        loadRlsRetryRef.current = true;
        await ensureDmChatMembership(chatId);
        res = await supabase
          .from("messages")
          .select("*")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: true });
        logSupabaseResult("messages_load_retry", { data: res.data, error: res.error });
      }

      if (res.error) {
        console.error("chat load messages", res.error);
        return;
      }
      setMessages((res.data || []) as MessageRow[]);
    } catch (e) {
      console.error("chat load messages", e);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (!chatId || !me) return;
      void (async () => {
        try {
          const res = await supabase
            .from("messages")
            .update({ status: "seen" })
            .eq("chat_id", chatId)
            .neq("sender_id", me)
            .eq("deleted", false);
          logSupabaseResult("messages_mark_seen", { data: res.data, error: res.error });
        } catch (e) {
          console.error("mark seen", e);
        }
      })();
    }, [chatId, me])
  );

  useEffect(() => {
    if (!chatId) return;
    const channel = supabase
      .channel("messages-" + chatId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (row.sender_id !== me) {
            void (async () => {
              try {
                const { error } = await supabase.from("messages").update({ status: "delivered" }).eq("id", row.id);
                if (error) console.error("delivered", error);
              } catch (e) {
                console.error("delivered", e);
              }
            })();
          }
          setMessages((prev) => mergeIncomingInsert(prev, row));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (me && row.hidden_for_user_ids?.includes(me)) {
              return prev.filter((m) => m.id !== row.id);
            }
            return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const oldRow = payload.old as { id?: string } | undefined;
          const id = oldRow?.id;
          if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, me]);

  useEffect(() => {
    if (!chatId || !me) return;
    const ch = supabase
      .channel(`typing-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_status",
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          void supabase
            .from("typing_status")
            .select("user_id,updated_at")
            .eq("chat_id", chatId)
            .neq("user_id", me)
            .order("updated_at", { ascending: false })
            .limit(1)
            .then(({ data }) => {
              const row = data?.[0];
              const fresh =
                row &&
                Date.now() - new Date(String(row.updated_at)).getTime() < 8000;
              setTypingOther(!!fresh);
            });
        }
      )
      .subscribe();
    void supabase
      .from("typing_status")
      .select("user_id,updated_at")
      .eq("chat_id", chatId)
      .neq("user_id", me)
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0];
        const fresh =
          row && Date.now() - new Date(String(row.updated_at)).getTime() < 8000;
        setTypingOther(!!fresh);
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [chatId, me]);

  useEffect(() => {
    if (loading) return;
    if (!messages.length) {
      prevMsgCountRef.current = 0;
      return;
    }
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      isAtBottomRef.current = true;
      setShowScrollButton(false);
      prevMsgCountRef.current = messages.length;
      const t = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(t);
    }
    const prev = prevMsgCountRef.current;
    const next = messages.length;
    if (next > prev && (isAtBottomRef.current || forceScrollAfterSendRef.current)) {
      forceScrollAfterSendRef.current = false;
      const t = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 50);
      prevMsgCountRef.current = next;
      return () => clearTimeout(t);
    }
    prevMsgCountRef.current = next;
  }, [loading, messages.length]);

  const flushTyping = useCallback(() => {
    if (!me || !chatId) return;
    void supabase.from("typing_status").delete().eq("user_id", me).eq("chat_id", chatId);
  }, [me, chatId]);

  const upsertTyping = useCallback(() => {
    if (!me || !chatId) return;
    void supabase.from("typing_status").upsert(
      { user_id: me, chat_id: chatId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,chat_id" }
    );
  }, [me, chatId]);

  async function pinMessage(messageId: string | null) {
    if (!chatId) return;
    try {
      const { error: e1 } = await supabase.from("chats").update({ pinned_message_id: null }).eq("id", chatId);
      if (e1) {
        console.error("pin clear", e1);
        Alert.alert("Ошибка", e1.message);
        return;
      }
      if (messageId !== null) {
        const { error: e2 } = await supabase.from("chats").update({ pinned_message_id: messageId }).eq("id", chatId);
        if (e2) {
          console.error("pin set", e2);
          Alert.alert("Ошибка", e2.message);
          return;
        }
      }
      setPinnedMessageId(messageId);
    } catch (e) {
      console.error("pinMessage", e);
    }
  }

  async function deleteForAll(item: MessageRow) {
    try {
      const { error } = await supabase
        .from("messages")
        .update({ deleted: true, text: "", image_url: null, voice_url: null })
        .eq("id", item.id);
      if (error) {
        console.error("deleteForAll", error);
        Alert.alert("Ошибка", error.message);
      }
    } catch (e) {
      console.error("deleteForAll", e);
    }
  }

  async function deleteForMe(item: MessageRow) {
    if (!me) return;
    const next = Array.from(new Set([...(item.hidden_for_user_ids ?? []), me]));
    try {
      const { error } = await supabase.from("messages").update({ hidden_for_user_ids: next }).eq("id", item.id);
      if (error) {
        console.error("deleteForMe", error);
        Alert.alert("Ошибка", error.message);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== item.id));
    } catch (e) {
      console.error("deleteForMe", e);
    }
  }

  function openMessageMenu(item: MessageRow) {
    const mine = item.sender_id === me;
    const buttons: { text: string; style?: "destructive" | "cancel"; onPress?: () => void }[] = [];

    buttons.push({
      text: "Ответить",
      onPress: () => setReplyingTo(item),
    });

    if (mine && !item.deleted) {
      if (item.text && !item.image_url && !item.voice_url) {
        buttons.push({
          text: "Редактировать",
          onPress: () => {
            setEditingMessage(item);
            setText(item.text);
            textRef.current = item.text;
          },
        });
      }
      buttons.push({
        text: "Удалить для всех",
        style: "destructive",
        onPress: () => {
          Alert.alert("Удалить для всех?", undefined, [
            { text: "Отмена", style: "cancel" },
            { text: "Удалить", style: "destructive", onPress: () => void deleteForAll(item) },
          ]);
        },
      });
    }

    if (!mine && !item.deleted) {
      buttons.push({
        text: "Удалить у меня",
        style: "destructive",
        onPress: () => void deleteForMe(item),
      });
    }

    if (myRole === "admin" && !item.deleted) {
      const isPinned = pinnedMessageId === item.id;
      buttons.push({
        text: isPinned ? "Открепить" : "Закрепить",
        onPress: () => void pinMessage(isPinned ? null : item.id),
      });
    }

    buttons.push({ text: "Отмена", style: "cancel" });

    Alert.alert("Сообщение", undefined, buttons);
  }

  function scrollToPinned() {
    if (!pinnedMessageId) return;
    const idx = messages.findIndex((m) => m.id === pinnedMessageId);
    if (idx < 0) return;
    try {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.15 });
    } catch {
      setTimeout(() => listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.15 }), 200);
    }
  }

  async function sendMessage(body: { text: string; image_url?: string | null; voice_url?: string | null }) {
    setSending(true);
    try {
      if (!me || chatId == null) return;
      if (!isChatUuid(chatId)) {
        Alert.alert("Ошибка", "Некорректный идентификатор чата");
        return;
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData.user;
      if (authErr || !user) {
        console.error("MESSAGES_INSERT getUser failed", authErr);
        Alert.alert("Ошибка", "Нет сессии. Войдите снова.");
        return;
      }
      console.log("CHAT_ID", chatId);
      console.log("USER_ID", user.id);
      if (me !== user.id) {
        console.warn("MESSAGES_INSERT session.user.id !== getUser().id", { session: me, jwt: user.id });
      }

      if (editingMessage) {
        const trimmed = body.text?.trim() ?? "";
        if (!trimmed) return;
        flushTyping();
        const ts = new Date().toISOString();
        const { error } = await supabase
          .from("messages")
          .update({ text: trimmed, edited_at: ts })
          .eq("id", editingMessage.id);
        if (error) {
          console.error("edit message", error);
          Alert.alert("Ошибка", error.message);
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, text: trimmed, edited_at: ts } : m))
        );
        setEditingMessage(null);
        setText("");
        textRef.current = "";
        return;
      }

      const trimmed = body.text?.trim() ?? "";
      if (!trimmed && !body.image_url && !body.voice_url) return;

      flushTyping();

      const tempId = `temp-${Date.now()}`;
      const replyToId = replyingTo?.id ?? null;

      await ensureDmChatMembership(chatId);

      const optimistic: MessageRow = {
        id: tempId,
        chat_id: chatId,
        sender_id: user.id,
        text: trimmed,
        image_url: body.image_url ?? null,
        voice_url: body.voice_url ?? null,
        created_at: new Date().toISOString(),
        status: "sending",
        reply_to: replyToId,
      };
      forceScrollAfterSendRef.current = true;
      setMessages((prev) => [...prev, optimistic]);

      const insertRow: Record<string, unknown> = {
        chat_id: chatId,
        sender_id: user.id,
        text: trimmed,
        status: "sent",
      };
      if (body.image_url) insertRow.image_url = body.image_url;
      if (body.voice_url) insertRow.voice_url = body.voice_url;
      if (replyToId) insertRow.reply_to = replyToId;

      console.log("MESSAGES_INSERT payload", insertRow);

      let first = await supabase.from("messages").insert(insertRow).select();
      console.log("DATA", first.data);
      console.log("ERROR", first.error);
      logRlsIfBlocked(first.error);

      let insertError: PostgrestError | null = first.error;
      let insertedRows = first.data;

      if (insertError?.code === "42501") {
        console.warn("MESSAGES_INSERT RLS 42501 — ensure_dm_chat_membership + retry insert");
        await ensureDmChatMembership(chatId);
        const second = await supabase.from("messages").insert(insertRow).select();
        console.log("DATA", second.data);
        console.log("ERROR", second.error);
        logRlsIfBlocked(second.error);
        insertError = second.error;
        insertedRows = second.data;
      }

      if (insertError) {
        console.error(insertError);
        Alert.alert("Ошибка", insertError.message);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const row = insertedRows?.[0] as MessageRow | undefined;
      if (row) {
        const merged = { ...row, status: row.status || "sent" };
        setMessages((prev) => prev.map((m) => (m.id === tempId ? merged : m)));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }

      setText("");
      textRef.current = "";
      setPendingImageUri(null);
      setReplyingTo(null);
    } catch (e) {
      console.error("SEND ERROR", e);
    } finally {
      setSending(false);
    }
  }

  const handleSend = () => {
    if (sendGestureLockRef.current) return;
    sendGestureLockRef.current = true;
    setTimeout(() => {
      sendGestureLockRef.current = false;
    }, 400);
    if (pendingImageUri && me) {
      void confirmSendPendingImage();
      return;
    }
    void sendMessage({ text: textRef.current });
  };

  async function confirmSendPendingImage() {
    if (!me || !pendingImageUri) return;
    try {
      setSending(true);
      const url = await uploadChatImage(me, pendingImageUri);
      setPendingImageUri(null);
      await sendMessage({ text: "", image_url: url });
    } catch (e: unknown) {
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Не удалось отправить фото");
    } finally {
      setSending(false);
    }
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Нужен доступ к галерее");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    setPendingImageUri(res.assets[0].uri);
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Доступ", "Нужен доступ к камере");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    setPendingImageUri(res.assets[0].uri);
  }

  async function startRecording() {
    if (Platform.OS === "web" || !me || !chatId) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Доступ", "Нужен доступ к микрофону");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      recordStartedAtRef.current = Date.now();
      setRecordingUi(true);
    } catch (e) {
      console.error(e);
      Alert.alert("Ошибка", e instanceof Error ? e.message : "Запись");
    }
  }

  async function stopRecordingAndSend() {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecordingUi(false);
    if (!rec || !me || !chatId) return;
    const elapsed = Date.now() - recordStartedAtRef.current;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) return;
      if (elapsed < 600) return;
      setSending(true);
      const url = await uploadChatVoice(me, uri);
      await sendMessage({ text: "", voice_url: url });
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }

  const onChangeText = (t: string) => {
    textRef.current = t;
    setText(t);
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    if (typingIdleRef.current) clearTimeout(typingIdleRef.current);

    typingDebounceRef.current = setTimeout(() => {
      upsertTyping();
    }, 300);

    typingIdleRef.current = setTimeout(() => {
      flushTyping();
    }, 2000);
  };

  const onlineLabel = otherUserId
    ? isOtherOnline(otherLastSeen)
      ? "онлайн"
      : "был недавно"
    : "";

  const headerTitle = isGroup ? groupTitle.trim() || "Группа" : otherName || "Чат";
  const canSendText = text.trim().length > 0;
  const showSend = canSendText || !!pendingImageUri;
  const showMic = !showSend && !pendingImageUri && Platform.OS !== "web";

  const pinnedPreview = pinnedMessageId ? byId.get(pinnedMessageId) : undefined;
  const pinnedBarText = pinnedBarSnippet(pinnedPreview);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} pointerEvents="auto">
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(router)} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.h1} numberOfLines={1}>
            {headerTitle}
          </Text>
          {!isGroup && otherUserId ? (
            <Text style={styles.subOnline}>{onlineLabel}</Text>
          ) : null}
        </View>
        <View style={{ width: 28 }} />
      </View>

      {pinnedMessageId ? (
        <Pressable onPress={scrollToPinned} style={styles.pinnedBar}>
          <Ionicons name="pin" size={16} color={colors.violet} />
          <Text style={styles.pinnedText} numberOfLines={2}>
            {pinnedBarText}
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.violet} />
      ) : (
        <View style={styles.listWrap} pointerEvents="box-none">
          <FlatList
            ref={listRef}
            data={messages}
            extraData={messages}
            keyExtractor={(item) => item.id}
            initialNumToRender={20}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            scrollEventThrottle={16}
            onScroll={handleListScroll}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.15,
                });
              }, 120);
            }}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
            const mine = item.sender_id === me;
            const st = item.status || "sent";
            const deleted = !!item.deleted;
            const replySrc = item.reply_to ? byId.get(item.reply_to) : undefined;
            return (
              <Pressable
                onLongPress={() => openMessageMenu(item)}
                delayLongPress={350}
                style={[styles.bubbleWrap, mine && styles.bubbleWrapMe]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                  {item.reply_to ? (
                    <View style={styles.replyPreview}>
                      <View style={styles.replyBar} />
                      <Text style={styles.replyPreviewText} numberOfLines={2}>
                        {replySnippet(replySrc, item.reply_to)}
                      </Text>
                    </View>
                  ) : null}
                  {deleted ? (
                    <Text style={styles.deletedText}>Сообщение удалено</Text>
                  ) : (
                    <>
                      {item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          style={styles.img}
                          contentFit="cover"
                        />
                      ) : null}
                      {item.voice_url ? <VoiceBubble uri={item.voice_url} /> : null}
                      {item.text ? (
                        <Text style={[styles.msg, mine && styles.msgMe]}>
                          {item.text}
                          {item.edited_at ? <Text style={styles.editedHint}> (ред.)</Text> : null}
                        </Text>
                      ) : null}
                    </>
                  )}
                  {mine && !deleted ? (
                    <Text style={[styles.tick, st === "seen" && styles.tickSeen]}>
                      {st === "sending" ? "…" : st === "sent" ? "✔" : st === "delivered" ? "✔✔" : "✔✔"}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          />
          {showScrollButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Вниз"
              onPress={() => {
                isAtBottomRef.current = true;
                setShowScrollButton(false);
                listRef.current?.scrollToEnd({ animated: true });
              }}
              style={[styles.scrollFab, shadow.soft]}
            >
              <Ionicons name="chevron-down" size={24} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
        pointerEvents="auto"
      >
        {replyingTo ? (
          <View style={styles.replyBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBannerLabel}>Ответ на</Text>
              <Text numberOfLines={1} style={styles.replyBannerText}>
                {replySnippet(replyingTo, replyingTo.id)}
              </Text>
            </View>
            <Pressable onPress={() => setReplyingTo(null)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        {editingMessage ? (
          <View style={styles.replyBanner}>
            <Text style={styles.replyBannerLabel}>Редактирование</Text>
            <Pressable onPress={() => { setEditingMessage(null); setText(""); textRef.current = ""; }} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        {pendingImageUri ? (
          <View style={styles.previewBar}>
            <Image source={{ uri: pendingImageUri }} style={styles.previewImg} contentFit="cover" />
            <View style={styles.previewActions}>
              <Pressable onPress={() => setPendingImageUri(null)} hitSlop={10}>
                <Text style={styles.previewCancel}>Отмена</Text>
              </Pressable>
              <Text style={styles.previewHint}>Нажмите «отправить» справа</Text>
            </View>
          </View>
        ) : null}
        {typingOther ? (
          <Text style={styles.typingHint} pointerEvents="none">
            печатает…
          </Text>
        ) : null}
        {recordingUi ? (
          <Text style={styles.recordingHint} pointerEvents="none">
            Отпустите для отправки…
          </Text>
        ) : null}
        <View style={styles.inputRow} pointerEvents="auto">
          <Pressable onPress={pickFromGallery} style={styles.iconBtn} disabled={sending}>
            <Ionicons name="image-outline" size={24} color={colors.violet} />
          </Pressable>
          <Pressable onPress={pickFromCamera} style={styles.iconBtn} disabled={sending}>
            <Ionicons name="camera-outline" size={24} color={colors.violet} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Сообщение…"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={onChangeText}
            multiline
            pointerEvents="auto"
          />
          {showMic ? (
            <Pressable
              onPressIn={() => void startRecording()}
              onPressOut={() => void stopRecordingAndSend()}
              style={[styles.send, styles.micBtn, sending && { opacity: 0.5 }]}
              disabled={sending}
              delayLongPress={0}
            >
              <Ionicons name="mic" size={24} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              {...(Platform.OS === "web"
                ? ({
                    onClick: (e: { preventDefault?: () => void; stopPropagation?: () => void }) => {
                      e?.preventDefault?.();
                      e?.stopPropagation?.();
                      handleSend();
                    },
                  } as Record<string, unknown>)
                : {})}
              style={[styles.send, sending && { opacity: 0.5 }]}
              hitSlop={8}
              pointerEvents="auto"
              {...(Platform.OS === "web" ? ({ accessibilityRole: "button" } as const) : {})}
            >
              <Ionicons name="send" size={22} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerMid: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  h1: { fontSize: 18, fontWeight: "700", color: colors.ink },
  subOnline: { marginTop: 2, fontSize: 12, color: colors.muted },
  pinnedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F5F3FF",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pinnedText: { flex: 1, fontSize: 13, color: colors.ink },
  listWrap: { flex: 1, position: "relative" },
  list: { padding: 16, paddingBottom: 8 },
  scrollFab: {
    position: "absolute",
    right: 16,
    bottom: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  bubbleWrap: { alignItems: "flex-start", marginBottom: 10 },
  bubbleWrapMe: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "70%",
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubbleMe: { backgroundColor: "#EDE9FE", borderColor: "#DDD6FE" },
  bubbleThem: { backgroundColor: colors.surface },
  replyPreview: { flexDirection: "row", gap: 8, marginBottom: 8, opacity: 0.9 },
  replyBar: { width: 3, borderRadius: 2, backgroundColor: colors.violet },
  replyPreviewText: { flex: 1, fontSize: 13, color: colors.muted },
  deletedText: { fontSize: 15, color: colors.muted, fontStyle: "italic" },
  msg: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  msgMe: { color: colors.navy },
  editedHint: { fontSize: 12, color: colors.muted, fontStyle: "italic" },
  tick: { marginTop: 4, fontSize: 12, color: colors.muted, alignSelf: "flex-end" },
  tickSeen: { color: "#2563eb" },
  img: {
    width: BUBBLE_IMG_MAX,
    maxWidth: "100%",
    height: BUBBLE_IMG_MAX * 0.75,
    borderRadius: radius.md,
    marginBottom: 8,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    minWidth: 200,
  },
  voiceLabel: { fontSize: 15, color: colors.ink },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EDE9FE",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 8,
  },
  replyBannerLabel: { fontSize: 11, color: colors.muted, textTransform: "uppercase" },
  replyBannerText: { fontSize: 14, color: colors.ink },
  typingHint: { paddingHorizontal: 16, paddingBottom: 4, fontSize: 13, color: colors.muted, fontStyle: "italic" },
  recordingHint: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontSize: 13,
    color: colors.violet,
    fontWeight: "600",
  },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  previewImg: { width: 72, height: 72, borderRadius: radius.md },
  previewActions: { flex: 1, gap: 4 },
  previewCancel: { fontSize: 15, color: "#b91c1c", fontWeight: "600" },
  previewHint: { fontSize: 12, color: colors.muted },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  iconBtn: { padding: 8 },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: "#F7F5FB",
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtn: { backgroundColor: "#7c3aed" },
});
