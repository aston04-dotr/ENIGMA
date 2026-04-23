export type CrossTabEvent =
  | {
      type: "chat:refresh";
      reason?: string;
      chatId?: string | null;
      at?: number;
    }
  | {
      type: "chat:read";
      chatId: string;
      at?: number;
    }
  | {
      type: "chat:message-sent";
      chatId: string;
      at?: number;
    }
  | {
      type: "chat:message-received";
      chatId: string;
      at?: number;
    }
  | {
      type: "auth:signed-out";
      at?: number;
    };

type Listener = (event: CrossTabEvent) => void;

const STORAGE_KEY = "enigma:cross-tab";
const CHANNEL_NAME = "enigma-cross-tab";

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

function safeNow(): number {
  return Date.now();
}

function normalizeEvent(event: CrossTabEvent): CrossTabEvent {
  return {
    ...event,
    at: typeof event.at === "number" ? event.at : safeNow(),
  };
}

function parseStorageEventValue(value: string | null): CrossTabEvent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CrossTabEvent;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return null;
    }
    return normalizeEvent(parsed);
  } catch {
    return null;
  }
}

export function createCrossTabChannel() {
  const listeners = new Set<Listener>();
  const tabId = Math.random().toString(36).slice(2);
  const bc =
    canUseWindow() && "BroadcastChannel" in window
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;

  function emit(event: CrossTabEvent) {
    const normalized = normalizeEvent(event);
    for (const listener of listeners) {
      try {
        listener(normalized);
      } catch (error) {
        console.error("[crossTab] listener error", error);
      }
    }
  }

  function post(event: CrossTabEvent) {
    if (!canUseWindow()) return;

    const normalized = normalizeEvent(event);
    const payload = JSON.stringify({
      ...normalized,
      __tabId: tabId,
    });

    if (bc) {
      bc.postMessage(normalized);
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, payload);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("[crossTab] storage post failed", error);
    }
  }

  function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function onBroadcastMessage(message: MessageEvent<unknown>) {
    const data = message.data;
    if (!data || typeof data !== "object") return;
    const event = data as CrossTabEvent;
    if (typeof event.type !== "string") return;
    emit(normalizeEvent(event));
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return;
    const parsed = parseStorageEventValue(event.newValue);
    if (!parsed) return;

    try {
      const raw = JSON.parse(event.newValue ?? "{}") as { __tabId?: string };
      if (raw.__tabId && raw.__tabId === tabId) return;
    } catch {
      // ignore
    }

    emit(parsed);
  }

  if (bc) {
    bc.addEventListener("message", onBroadcastMessage);
  }

  if (canUseWindow()) {
    window.addEventListener("storage", onStorage);
  }

  function destroy() {
    listeners.clear();
    if (bc) {
      bc.removeEventListener("message", onBroadcastMessage);
      bc.close();
    }
    if (canUseWindow()) {
      window.removeEventListener("storage", onStorage);
    }
  }

  return {
    post,
    subscribe,
    destroy,
  };
}
