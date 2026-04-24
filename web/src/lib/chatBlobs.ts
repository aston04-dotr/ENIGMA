/**
 * Реестр blob:URL для чата — revoke, авто-очистка, без утечек.
 */
const FAILED_BLOB_TTL_MS = 8 * 60 * 1000;

function revokeOne(url: string, tracked: Set<string>) {
  if (url && url.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  }
  tracked.delete(url);
}

export class ChatPendingBlobRegistry {
  readonly urls = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  add(url: string) {
    if (url && url.startsWith("blob:")) {
      this.urls.add(url);
    }
  }

  remove(url: string) {
    revokeOne(url, this.urls);
  }

  clearTimer(messageId: string) {
    const t = this.timers.get(messageId);
    if (t !== undefined) {
      clearTimeout(t);
      this.timers.delete(messageId);
    }
  }

  /** После imageUploadFailed: если нет ретрая, убрать блоб и уведомить. */
  scheduleFailedBlobExpiry(
    messageId: string,
    blobUrl: string,
    onExpire: () => void,
  ) {
    this.clearTimer(messageId);
    const t = setTimeout(() => {
      this.timers.delete(messageId);
      this.remove(blobUrl);
      onExpire();
    }, FAILED_BLOB_TTL_MS);
    this.timers.set(messageId, t);
  }

  revokeAll() {
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
    for (const u of this.urls) {
      if (u.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* noop */
        }
      }
    }
    this.urls.clear();
  }
}
