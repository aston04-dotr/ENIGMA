"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { useAuth } from "@/context/auth-context";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { fetchListingById } from "@/lib/listings";
import { getMaxListingPhotos } from "@/lib/runtimeConfig";
import {
  removeListingImagesFromStorage,
  uploadListingPhotoWeb,
} from "@/lib/storageUploadWeb";
import { supabase } from "@/lib/supabase";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Toast component
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === "success" ? "bg-[#22c55e]" : type === "error" ? "bg-danger" : "bg-accent";
  
  return (
    <div className={`fixed top-4 left-4 right-4 z-50 ${bgColor} text-white px-4 py-3 rounded-xl shadow-lg animate-fade-in`}>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

const inputClass =
  "w-full min-h-[52px] rounded-card border border-line bg-elevated px-4 text-fg placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/35 transition-all duration-200";
const MAX_LISTING_PHOTOS = getMaxListingPhotos();

type PendingImageFile = {
  id: string;
  file: File;
  previewUrl: string;
};

const EXISTING_PREFIX = "existing:";
const PENDING_PREFIX = "pending:";

function makeExistingKey(url: string): string {
  return `${EXISTING_PREFIX}${encodeURIComponent(url)}`;
}

function makePendingKey(id: string): string {
  return `${PENDING_PREFIX}${id}`;
}

function keyToExistingUrl(key: string): string | null {
  if (!key.startsWith(EXISTING_PREFIX)) return null;
  const encoded = key.slice(EXISTING_PREFIX.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function keyToPendingId(key: string): string | null {
  if (!key.startsWith(PENDING_PREFIX)) return null;
  const id = key.slice(PENDING_PREFIX.length).trim();
  return id || null;
}

function SortableThumb({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: Boolean(disabled) });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragging ? "z-20 opacity-90" : ""}
    >
      {children}
    </div>
  );
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const { session, authResolved, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImageFile[]>([]);
  const [imageOrder, setImageOrder] = useState<string[]>([]);
  const [deletingImageUrls, setDeletingImageUrls] = useState<Set<string>>(() => new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
  );
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalData, setOriginalData] = useState<{
    title: string;
    description: string;
    price: number;
    imageUrls: string[];
  } | null>(null);

  useEffect(() => {
    if (!authResolved || authLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!id) return;
    
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchListingById(String(id));
        if (cancelled) return;
        
        if (!res.row) {
          setErr(res.loadError ?? "Объявление не найдено");
          setLoading(false);
          return;
        }
        
        // Verify ownership
        if (res.row.user_id !== session.user.id) {
          setErr("Вы можете редактировать только свои объявления");
          setLoading(false);
          return;
        }
        
        setTitle(res.row.title);
        setDescription(res.row.description);
        setPrice(String(res.row.price));
        const urls = (res.row.images ?? [])
          .map((img) => String(img?.url ?? "").trim())
          .filter(Boolean);
        setExistingImageUrls(urls);
        setImageOrder(urls.map(makeExistingKey));
        setOriginalData({
          title: res.row.title,
          description: res.row.description,
          price: res.row.price,
          imageUrls: urls,
        });
      } catch (e) {
        console.error("FETCH ERROR", e);
        setErr("Не удалось загрузить объявление");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    
    return () => { cancelled = true; };
  }, [id, session, authResolved, authLoading, router]);

  useEffect(() => {
    return () => {
      for (const item of pendingImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, [pendingImages]);

  async function removeExistingImage(url: string) {
    if (!id || !session?.user?.id) return;
    const trimmed = String(url ?? "").trim();
    if (!trimmed) return;

    setDeletingImageUrls((prev) => {
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });

    try {
      await removeListingImagesFromStorage([trimmed]);

      const { error: dbError } = await supabase
        .from("images")
        .delete()
        .eq("listing_id", id)
        .eq("url", trimmed);
      if (dbError) throw dbError;

      setExistingImageUrls((prev) => prev.filter((x) => x !== trimmed));
      setImageOrder((prev) => prev.filter((k) => k !== makeExistingKey(trimmed)));
      setOriginalData((prev) => {
        if (!prev) return prev;
        return { ...prev, imageUrls: prev.imageUrls.filter((x) => x !== trimmed) };
      });
    } catch (removeError) {
      console.error("EDIT LISTING IMAGE REMOVE ERROR", removeError);
      setToast({ message: "Не удалось удалить фото", type: "error" });
    } finally {
      setDeletingImageUrls((prev) => {
        const next = new Set(prev);
        next.delete(trimmed);
        return next;
      });
    }
  }

  function addPendingFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).filter((f) =>
      String(f?.type ?? "").toLowerCase().startsWith("image/"),
    );
    if (selected.length === 0) return;

    const freeSlots =
      MAX_LISTING_PHOTOS - existingImageUrls.length - pendingImages.length;
    if (freeSlots <= 0) {
      setToast({
        message: `Максимум ${MAX_LISTING_PHOTOS} фото`,
        type: "info",
      });
      return;
    }

    const toAdd = selected.slice(0, freeSlots).map((file) => ({
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    if (toAdd.length < selected.length) {
      setToast({
        message: `Лишние фото пропущены (лимит ${MAX_LISTING_PHOTOS})`,
        type: "info",
      });
    }

    setPendingImages((prev) => [...prev, ...toAdd]);
    setImageOrder((prev) => [...prev, ...toAdd.map((item) => makePendingKey(item.id))]);
  }

  function removePendingImage(idToRemove: string) {
    const keyToRemove = makePendingKey(idToRemove);
    setImageOrder((prev) => prev.filter((k) => k !== keyToRemove));
    setPendingImages((prev) => {
      const target = prev.find((x) => x.id === idToRemove);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((x) => x.id !== idToRemove);
    });
  }

  const pendingMap = useMemo(() => {
    const map = new Map<string, PendingImageFile>();
    for (const item of pendingImages) map.set(item.id, item);
    return map;
  }, [pendingImages]);

  const orderedThumbnails = useMemo(() => {
    return imageOrder
      .map((key) => {
        const existingUrl = keyToExistingUrl(key);
        if (existingUrl) {
          if (!existingImageUrls.includes(existingUrl)) return null;
          return { key, kind: "existing" as const, url: existingUrl };
        }
        const pendingId = keyToPendingId(key);
        if (!pendingId) return null;
        const pending = pendingMap.get(pendingId);
        if (!pending) return null;
        return { key, kind: "pending" as const, id: pendingId, url: pending.previewUrl };
      })
      .filter(Boolean) as Array<
      | { key: string; kind: "existing"; url: string }
      | { key: string; kind: "pending"; id: string; url: string }
    >;
  }, [existingImageUrls, imageOrder, pendingMap]);

  function handleImageDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImageOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function save() {
    if (!session?.user || !id) return;
    
    const titleTrim = title.trim();
    const descriptionTrim = description.trim();
    const priceNum = Number(price);
    
    if (!titleTrim) {
      setToast({ message: "Введите название", type: "error" });
      return;
    }
    if (!descriptionTrim) {
      setToast({ message: "Введите описание", type: "error" });
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setToast({ message: "Введите корректную цену", type: "error" });
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("listings")
        .update({
          title: titleTrim,
          description: descriptionTrim,
          price: priceNum,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw error;

      const existingSet = new Set(existingImageUrls);
      const pendingById = new Map(pendingImages.map((item) => [item.id, item]));
      const finalUrls: string[] = [];

      for (let i = 0; i < imageOrder.length; i++) {
        const key = imageOrder[i]!;
        const existingUrl = keyToExistingUrl(key);
        if (existingUrl) {
          if (existingSet.has(existingUrl)) finalUrls.push(existingUrl);
          continue;
        }
        const pendingId = keyToPendingId(key);
        if (!pendingId) continue;
        const pending = pendingById.get(pendingId);
        if (!pending) continue;
        const uploaded = await uploadListingPhotoWeb(
          session.user.id,
          id,
          pending.file,
          i,
        );
        finalUrls.push(uploaded);
      }

      const { error: deleteImagesError } = await supabase
        .from("images")
        .delete()
        .eq("listing_id", id);
      if (deleteImagesError) throw deleteImagesError;

      if (finalUrls.length > 0) {
        const rows = finalUrls.map((url, sortOrder) => ({
          listing_id: id,
          url,
          sort_order: sortOrder,
        }));
        const { error: insertImagesError } = await supabase
          .from("images")
          .insert(rows);
        if (insertImagesError) throw insertImagesError;
      }

      for (const item of pendingImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
      setPendingImages([]);
      setExistingImageUrls(finalUrls);
      setImageOrder(finalUrls.map(makeExistingKey));

      setOriginalData({
        title: titleTrim,
        description: descriptionTrim,
        price: priceNum,
        imageUrls: finalUrls,
      });
      setToast({ message: "✓ Объявление обновлено", type: "success" });
    } catch (saveError) {
      console.error("UPDATE ERROR", saveError);
      setToast({ message: "Не удалось сохранить изменения", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function executeDeleteListing() {
    const uid = session?.user?.id;
    if (!uid || !id) return;
    const listingId = String(id).trim();
    if (!listingId) return;

    setDeleteBusy(true);
    try {
      const { data: listingImages, error: listingImagesError } = await supabase
        .from("images")
        .select("url")
        .eq("listing_id", listingId);
      if (listingImagesError) {
        console.warn("EDIT LISTING IMAGES LOAD ERROR", listingImagesError);
      }
      const imageUrls = Array.isArray(listingImages)
        ? listingImages
            .map((row) => String((row as { url?: unknown })?.url ?? "").trim())
            .filter(Boolean)
        : [];

      const { error } = await supabase
        .from("listings")
        .delete()
        .eq("id", listingId)
        .eq("user_id", uid);

      if (error) throw error;

      try {
        await removeListingImagesFromStorage(imageUrls);
      } catch (storageError) {
        console.warn("EDIT LISTING STORAGE DELETE ERROR", storageError);
      }

      setDeleteConfirmOpen(false);
      setToast({ message: "Объявление удалено", type: "success" });
      window.setTimeout(() => {
        router.replace("/profile");
      }, 450);
    } catch (deleteError) {
      console.error("DELETE LISTING ERROR", deleteError);
      setToast({ message: "Не удалось удалить объявление", type: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }

  const hasImageChanges = useMemo(() => {
    if (!originalData) return false;
    if (pendingImages.length > 0) return true;
    const existingInOrder = imageOrder
      .map((k) => keyToExistingUrl(k))
      .filter((url): url is string => Boolean(url));
    if (existingInOrder.length !== originalData.imageUrls.length) return true;
    return existingInOrder.some((url, idx) => url !== originalData.imageUrls[idx]);
  }, [imageOrder, originalData, pendingImages.length]);

  const hasChanges = originalData && (
    title.trim() !== originalData.title ||
    description.trim() !== originalData.description ||
    Number(price) !== originalData.price ||
    hasImageChanges
  );
  const isDirty = Boolean(hasChanges);
  const { safePush, safeBack } = useUnsavedChangesGuard(isDirty, { enabled: true });

  if (authLoading || !authResolved) {
    return <AuthLoadingScreen />;
  }
  
  if (loading) {
    return (
      <main className="safe-pt px-5 pb-8 pt-8">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-skeleton rounded bg-elev-2" />
          <div className="h-12 w-full animate-skeleton rounded bg-elev-2" />
          <div className="h-32 w-full animate-skeleton rounded bg-elev-2" />
          <div className="h-12 w-full animate-skeleton rounded bg-elev-2" />
        </div>
      </main>
    );
  }
  
  if (err) {
    return (
      <main className="safe-pt px-5 pb-8 pt-8">
        <p className="text-danger">{err}</p>
        <button
          onClick={() => safePush(router, "/profile")}
          className="mt-4 text-accent hover:text-accent-hover"
        >
          ← Вернуться в профиль
        </button>
      </main>
    );
  }

  return (
    <main className="safe-pt px-5 pb-8 pt-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack(router)}
          className="text-muted hover:text-fg transition-colors"
        >
          ←
        </button>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Редактировать</h1>
      </div>
      {isDirty ? (
        <div className="mb-2 text-xs text-orange-500">Есть несохранённые изменения</div>
      ) : null}
      
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Фото</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              addPendingFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            className="w-full min-h-[48px] rounded-card border border-line bg-elevated px-4 py-2 text-sm font-medium text-fg transition-all duration-200 hover:bg-elev-2 disabled:opacity-50"
          >
            Добавить фото
          </button>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleImageDragEnd}
          >
            <SortableContext items={orderedThumbnails.map((item) => item.key)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {orderedThumbnails.map((item) => {
                  const isExisting = item.kind === "existing";
                  const isDeleting = isExisting ? deletingImageUrls.has(item.url) : false;
                  const pendingId = item.kind === "pending" ? item.id : null;
                  return (
                    <SortableThumb key={item.key} id={item.key} disabled={saving || isDeleting}>
                      <div
                        className={`relative overflow-hidden rounded-card border border-line bg-elevated touch-none ${
                          isDeleting ? "opacity-70" : "opacity-100"
                        }`}
                      >
                        <img
                          src={item.url}
                          alt=""
                          className={`h-24 w-full object-cover ${
                            isDeleting ? "blur-[1px]" : ""
                          }`}
                        />
                        <button
                          type="button"
                          disabled={saving || isDeleting}
                          onClick={() => {
                            if (isExisting) {
                              void removeExistingImage(item.url);
                              return;
                            }
                            if (pendingId) removePendingImage(pendingId);
                          }}
                          className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-bold text-white disabled:opacity-50"
                          aria-label="Удалить фото"
                        >
                          {isDeleting ? "…" : "×"}
                        </button>
                      </div>
                    </SortableThumb>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Название</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="Например: iPhone 14 Pro"
            disabled={saving}
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClass} min-h-[120px] py-3 resize-none`}
            placeholder="Опишите товар подробнее..."
            rows={4}
            disabled={saving}
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Цена (₽)</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
            placeholder="0"
            type="number"
            inputMode="numeric"
            disabled={saving}
          />
        </div>
        
        <button
          type="button"
          disabled={saving || !hasChanges}
          onClick={() => void save()}
          className="w-full min-h-[56px] rounded-card bg-accent py-4 text-[17px] font-semibold text-white transition-all duration-200 hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20 mt-4"
        >
          {saving ? "Сохранение…" : hasChanges ? "Сохранить изменения" : "Нет изменений"}
        </button>
        
        <button
          type="button"
          onClick={() => safePush(router, `/listing/${id}`)}
          className="w-full min-h-[48px] rounded-card border border-line py-3 text-[15px] font-medium text-muted transition-all duration-200 hover:bg-elevated"
        >
          Отмена
        </button>

        <button
          type="button"
          disabled={saving || deleteBusy}
          onClick={() => setDeleteConfirmOpen(true)}
          className="w-full min-h-[48px] rounded-card border border-[#FF3B30]/30 bg-[#FF3B30]/[0.08] py-3 text-[15px] font-medium text-[#FF3B30] transition-all duration-200 hover:bg-[#FF3B30]/[0.14] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Удалить объявление
        </button>
      </div>

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 px-4 pb-8 pt-12 sm:items-center sm:p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="listing-delete-title"
          aria-describedby="listing-delete-desc"
        >
          <div className="w-full max-w-[360px] rounded-2xl border border-line bg-elevated p-5 shadow-2xl">
            <h2 id="listing-delete-title" className="text-[17px] font-semibold leading-snug text-fg">
              Удаление
            </h2>
            <p id="listing-delete-desc" className="mt-3 text-[15px] leading-relaxed text-muted">
              Вы уверены, что хотите безвозвратно удалить это объявление?
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirmOpen(false)}
                className="min-h-[48px] rounded-xl border border-line bg-elev-2 px-3 text-[15px] font-semibold text-fg transition-colors hover:bg-elevated disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void executeDeleteListing()}
                className="min-h-[48px] rounded-xl bg-[#FF3B30] px-3 text-[15px] font-semibold text-white transition-colors hover:bg-[#e6352b] disabled:opacity-50"
              >
                {deleteBusy ? "…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
