"use client";

import { AuthLoadingScreen } from "@/components/AuthLoadingScreen";
import { useAuth } from "@/context/auth-context";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { fetchListingById, getCitiesFromDb } from "@/lib/listings";
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
import { ListingMiscCategoryFieldsForEdit } from "@/components/listing/ListingMiscCategoryFieldsForEdit";
import { ListingRealEstateFields } from "@/components/listing/ListingRealEstateFields";
import { categoryLabel } from "@/lib/categories";
import {
  EMPTY_CATEGORY_EDIT_PARAMS,
  buildParamsRecordForCategoryEdit,
  buildRealEstateColumnExtras,
  clearRealEstateColumnsPatch,
  clearVehicleColumnsPatch,
  hydrateCategoryEditParams,
  listingIntentFromRow,
  mergeDescriptionWithCategorySpecs,
  validateCategoryEditForm,
  type CategoryEditParams,
} from "@/lib/listingCategoryEdit";
import {
  normalizeAllowedListingCity,
} from "@/lib/russianCities";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AutoParamsShape, MotoParamsShape } from "@/lib/listingVehicleForm";
import {
  buildAutoParamsRecord,
  buildAutoSpecsSection,
  buildMotoParamsRecord,
  buildMotoSpecsSection,
  hydrateAutoParamsShape,
  hydrateMotoParamsShape,
  mergeDescriptionWithSpecsSection,
  toIntOrNull,
  validateEngineHp,
  validateEngineVolumeAuto,
  validateEngineVolumeMoto,
} from "@/lib/listingVehicleForm";
import {
  AUTO_ENGINE_VOLUME_OPTIONS,
  ENGINE_HP_OPTIONS,
  MOTO_ENGINE_VOLUME_OPTIONS,
  VehicleEngineCombo,
} from "@/components/listing/VehicleEngineCombo";

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

function miscSliceForDirty(cat: string, cp: CategoryEditParams): string {
  if (cat === "realestate") return JSON.stringify(cp.realestate);
  if (cat === "electronics") return JSON.stringify(cp.electronics);
  if (cat === "fashion") return JSON.stringify(cp.fashion);
  if (cat === "services") return JSON.stringify(cp.services);
  if (cat === "kids") return JSON.stringify(cp.kids);
  if (cat === "sport") return JSON.stringify(cp.sport);
  if (cat === "home") return JSON.stringify(cp.home);
  if (cat === "furniture") return JSON.stringify(cp.furniture);
  return "";
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
  const [listingCategory, setListingCategory] = useState("");
  const [categoryParams, setCategoryParams] = useState<CategoryEditParams>(() =>
    structuredClone(EMPTY_CATEGORY_EDIT_PARAMS),
  );
  const [editCity, setEditCity] = useState("");
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [listingIntent, setListingIntent] = useState<"sale" | "rent">("sale");
  const [autoParams, setAutoParams] = useState<AutoParamsShape | null>(null);
  const [motoParams, setMotoParams] = useState<MotoParamsShape | null>(null);
  const originalAutoJsonRef = useRef("");
  const originalMotoJsonRef = useRef("");
  const originalExtrasRef = useRef({
    city: "",
    intent: "sale" as "sale" | "rent",
    miscJson: "",
  });
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

        const cat = String(res.row.category ?? "").trim();
        setListingCategory(cat);
        const cp = hydrateCategoryEditParams(res.row);
        setCategoryParams(cp);
        const nc = normalizeAllowedListingCity(res.row.city) ?? "";
        setEditCity(nc);
        const intent = listingIntentFromRow(res.row);
        setListingIntent(intent);
        originalExtrasRef.current = {
          city: nc,
          intent,
          miscJson: miscSliceForDirty(cat, cp),
        };
        if (cat === "auto") {
          const h = hydrateAutoParamsShape(res.row);
          setAutoParams(h);
          originalAutoJsonRef.current = JSON.stringify(h);
          setMotoParams(null);
          originalMotoJsonRef.current = "";
        } else if (cat === "moto") {
          const h = hydrateMotoParamsShape(res.row);
          setMotoParams(h);
          originalMotoJsonRef.current = JSON.stringify(h);
          setAutoParams(null);
          originalAutoJsonRef.current = "";
        } else {
          setAutoParams(null);
          setMotoParams(null);
          originalAutoJsonRef.current = "";
          originalMotoJsonRef.current = "";
        }
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
    let cancelled = false;
    void (async () => {
      const dbCities = await getCitiesFromDb();
      if (cancelled) return;
      setCityOptions(dbCities);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    let descriptionTrim = description.trim();
    const priceNum = Number(price);
    const normalizedPrice = toIntOrNull(price.trim());

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

    const normalizedCitySave = normalizeAllowedListingCity(editCity);
    if (!normalizedCitySave) {
      setToast({ message: "Выберите город", type: "error" });
      return;
    }

    if (listingCategory === "auto") {
      if (!autoParams) {
        setToast({ message: "Не удалось прочитать параметры авто", type: "error" });
        return;
      }
      const hpErr = validateEngineHp(autoParams.enginePowerHp);
      if (hpErr) {
        setToast({ message: hpErr, type: "error" });
        return;
      }
      const volErr = validateEngineVolumeAuto(autoParams.engineVolumeL);
      if (volErr) {
        setToast({ message: volErr, type: "error" });
        return;
      }
      if (
        !autoParams.brand.trim() ||
        !autoParams.model.trim() ||
        !autoParams.year.trim() ||
        !autoParams.mileage.trim()
      ) {
        setToast({ message: "Заполните марку, модель, год и пробег", type: "error" });
        return;
      }
      descriptionTrim = mergeDescriptionWithSpecsSection(
        descriptionTrim,
        buildAutoSpecsSection(autoParams),
      );
    } else if (listingCategory === "moto") {
      if (!motoParams) {
        setToast({ message: "Не удалось прочитать параметры мотоцикла", type: "error" });
        return;
      }
      const hpErr = validateEngineHp(motoParams.enginePowerHp);
      if (hpErr) {
        setToast({ message: hpErr, type: "error" });
        return;
      }
      const volErr = validateEngineVolumeMoto(motoParams.engineVolumeL);
      if (volErr) {
        setToast({ message: volErr, type: "error" });
        return;
      }
      if (!motoParams.bikeType.trim() || !motoParams.engineKind.trim() || !motoParams.mileageKm.trim()) {
        setToast({ message: "Заполните тип, двигатель и пробег", type: "error" });
        return;
      }
      descriptionTrim = mergeDescriptionWithSpecsSection(
        descriptionTrim,
        buildMotoSpecsSection(motoParams),
      );
    } else {
      const catErr = validateCategoryEditForm(listingCategory, categoryParams, listingIntent);
      if (catErr) {
        setToast({ message: catErr, type: "error" });
        return;
      }
      descriptionTrim = mergeDescriptionWithCategorySpecs(
        descriptionTrim,
        listingCategory,
        categoryParams,
        listingIntent,
      );
    }

    setSaving(true);
    try {
      const listingPatch: Record<string, unknown> = {
        title: titleTrim,
        description: descriptionTrim,
        price: priceNum,
        updated_at: new Date().toISOString(),
        city: normalizedCitySave,
        deal_type: listingIntent,
      };

      if (listingCategory === "auto" && autoParams) {
        listingPatch.params = buildAutoParamsRecord(autoParams, normalizedPrice);
        listingPatch.engine_power = autoParams.enginePowerHp.trim() || null;
        listingPatch.engine_volume = autoParams.engineVolumeL.trim() || null;
        listingPatch.moto_type = null;
        listingPatch.moto_engine = null;
        listingPatch.moto_mileage = null;
        listingPatch.moto_customs_cleared = null;
        listingPatch.moto_owners_pts = null;
        Object.assign(listingPatch, clearRealEstateColumnsPatch());
      } else if (listingCategory === "moto" && motoParams) {
        listingPatch.params = buildMotoParamsRecord(motoParams, normalizedPrice);
        listingPatch.engine_power = motoParams.enginePowerHp.trim() || null;
        listingPatch.engine_volume = motoParams.engineVolumeL.trim() || null;
        listingPatch.moto_type = motoParams.bikeType.trim() || null;
        listingPatch.moto_engine = motoParams.engineKind.trim() || null;
        listingPatch.moto_mileage = motoParams.mileageKm.trim() || null;
        listingPatch.moto_customs_cleared = motoParams.customsCleared.trim() || null;
        listingPatch.moto_owners_pts = motoParams.ownersPts.trim() || null;
        Object.assign(listingPatch, clearRealEstateColumnsPatch());
      } else {
        const params = buildParamsRecordForCategoryEdit(
          listingCategory,
          categoryParams,
          listingIntent,
          price,
        );
        listingPatch.params = params ?? {};
        Object.assign(listingPatch, clearVehicleColumnsPatch());
        if (listingCategory === "realestate") {
          Object.assign(
            listingPatch,
            buildRealEstateColumnExtras(categoryParams.realestate, listingIntent),
          );
        } else {
          Object.assign(listingPatch, clearRealEstateColumnsPatch());
        }
      }

      const { error } = await supabase
        .from("listings")
        .update(listingPatch as never)
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

      setDescription(descriptionTrim);
      setOriginalData({
        title: titleTrim,
        description: descriptionTrim,
        price: priceNum,
        imageUrls: finalUrls,
      });
      if (listingCategory === "auto" && autoParams) {
        originalAutoJsonRef.current = JSON.stringify(autoParams);
      }
      if (listingCategory === "moto" && motoParams) {
        originalMotoJsonRef.current = JSON.stringify(motoParams);
      }
      originalExtrasRef.current = {
        city: normalizedCitySave,
        intent: listingIntent,
        miscJson: miscSliceForDirty(listingCategory, categoryParams),
      };
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

  const vehicleParamsDirty = useMemo(() => {
    if (listingCategory === "auto" && autoParams) {
      return JSON.stringify(autoParams) !== originalAutoJsonRef.current;
    }
    if (listingCategory === "moto" && motoParams) {
      return JSON.stringify(motoParams) !== originalMotoJsonRef.current;
    }
    return false;
  }, [listingCategory, autoParams, motoParams]);

  const extrasDirty = useMemo(() => {
    if (!originalData) return false;
    if (
      editCity.trim() !== originalExtrasRef.current.city ||
      listingIntent !== originalExtrasRef.current.intent
    ) {
      return true;
    }
    if (listingCategory === "auto" || listingCategory === "moto") return false;
    return (
      miscSliceForDirty(listingCategory, categoryParams) !== originalExtrasRef.current.miscJson
    );
  }, [originalData, editCity, listingIntent, listingCategory, categoryParams]);

  const hasChanges = Boolean(
    originalData &&
      (title.trim() !== originalData.title ||
        description.trim() !== originalData.description ||
        Number(price) !== originalData.price ||
        hasImageChanges ||
        vehicleParamsDirty ||
        extrasDirty),
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Категория</label>
          <div className="min-h-[52px] rounded-card border border-line bg-elev-2/40 px-4 py-3 text-sm text-fg">
            {listingCategory ? categoryLabel(listingCategory) : "—"}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted">Город</label>
          <select
            value={editCity}
            onChange={(e) => setEditCity(e.target.value)}
            className={inputClass}
            disabled={saving}
          >
            <option value="">Выберите город</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-muted">Тип сделки</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setListingIntent("sale")}
              className={`min-h-[48px] flex-1 rounded-card border px-3 text-sm font-semibold transition-colors ${
                listingIntent === "sale"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-elevated text-fg hover:bg-elev-2"
              }`}
            >
              Продажа
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setListingIntent("rent")}
              className={`min-h-[48px] flex-1 rounded-card border px-3 text-sm font-semibold transition-colors ${
                listingIntent === "rent"
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-elevated text-fg hover:bg-elev-2"
              }`}
            >
              Аренда
            </button>
          </div>
        </div>

        {listingCategory === "auto" && autoParams ? (
          <div className="space-y-3 rounded-card border border-line bg-elev-2/40 p-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры авто</label>
            <input
              value={autoParams.brand}
              onChange={(e) => setAutoParams((p) => (p ? { ...p, brand: e.target.value } : p))}
              placeholder="Марка *"
              className={inputClass}
              disabled={saving}
            />
            <input
              value={autoParams.model}
              onChange={(e) => setAutoParams((p) => (p ? { ...p, model: e.target.value } : p))}
              placeholder="Модель *"
              className={inputClass}
              disabled={saving}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={autoParams.year}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, year: e.target.value } : p))}
                inputMode="numeric"
                placeholder="Год выпуска *"
                className={inputClass}
                disabled={saving}
              />
              <input
                value={autoParams.mileage}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, mileage: e.target.value } : p))}
                inputMode="numeric"
                placeholder="Пробег (км) *"
                className={inputClass}
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={autoParams.owners}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, owners: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Владельцев</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3+</option>
              </select>
              <select
                value={autoParams.fuel}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, fuel: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Тип топлива</option>
                <option value="Бензин">Бензин</option>
                <option value="Дизель">Дизель</option>
                <option value="Гибрид">Гибрид</option>
                <option value="Электро">Электро</option>
                <option value="Газ">Газ</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={autoParams.transmission}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, transmission: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Коробка передач</option>
                <option value="Механика">Механика</option>
                <option value="Автомат">Автомат</option>
                <option value="Робот">Робот</option>
                <option value="Вариатор">Вариатор</option>
              </select>
              <select
                value={autoParams.drive}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, drive: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Привод</option>
                <option value="Передний">Передний</option>
                <option value="Задний">Задний</option>
                <option value="Полный">Полный</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <VehicleEngineCombo
                label="Мощность (л.с.)"
                unit="hp"
                value={autoParams.enginePowerHp}
                onChange={(next) => setAutoParams((p) => (p ? { ...p, enginePowerHp: next } : p))}
                options={ENGINE_HP_OPTIONS}
                placeholder="Выберите или введите, л.с."
              />
              <VehicleEngineCombo
                label="Объем (л)"
                unit="liters"
                value={autoParams.engineVolumeL}
                onChange={(next) => setAutoParams((p) => (p ? { ...p, engineVolumeL: next } : p))}
                options={AUTO_ENGINE_VOLUME_OPTIONS}
                placeholder="Выберите или введите, л"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={autoParams.customsCleared}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, customsCleared: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Растаможен</option>
                <option value="Да">Да</option>
                <option value="Нет">Нет</option>
              </select>
              <select
                value={autoParams.damaged}
                onChange={(e) => setAutoParams((p) => (p ? { ...p, damaged: e.target.value } : p))}
                className={inputClass}
                disabled={saving}
              >
                <option value="">Битый</option>
                <option value="Да">Да</option>
                <option value="Нет">Нет</option>
              </select>
            </div>
          </div>
        ) : null}

        {listingCategory === "moto" && motoParams ? (
          <div className="space-y-3 rounded-card border border-line bg-elev-2/40 p-4">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">Параметры мотоцикла</label>
            <select
              value={motoParams.bikeType}
              onChange={(e) => setMotoParams((p) => (p ? { ...p, bikeType: e.target.value } : p))}
              className={inputClass}
              disabled={saving}
            >
              <option value="">Тип *</option>
              <option value="Спортивный">Спортивный</option>
              <option value="Чоппер">Чоппер</option>
              <option value="Эндуро">Эндуро</option>
              <option value="Скутер">Скутер</option>
              <option value="Квадроцикл">Квадроцикл</option>
            </select>
            <select
              value={motoParams.engineKind}
              onChange={(e) => setMotoParams((p) => (p ? { ...p, engineKind: e.target.value } : p))}
              className={inputClass}
              disabled={saving}
            >
              <option value="">Двигатель *</option>
              <option value="Бензиновый">Бензиновый</option>
              <option value="Электрический">Электрический</option>
            </select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <VehicleEngineCombo
                label="Объем (л)"
                unit="liters"
                value={motoParams.engineVolumeL}
                onChange={(next) => setMotoParams((p) => (p ? { ...p, engineVolumeL: next } : p))}
                options={MOTO_ENGINE_VOLUME_OPTIONS}
                placeholder="До 2.5 л, свой ввод"
              />
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Пробег (км)</label>
                <input
                  value={motoParams.mileageKm}
                  onChange={(e) => setMotoParams((p) => (p ? { ...p, mileageKm: e.target.value } : p))}
                  placeholder="Пробег *"
                  className={inputClass}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <VehicleEngineCombo
                label="Мощность (л.с.)"
                unit="hp"
                value={motoParams.enginePowerHp}
                onChange={(next) => setMotoParams((p) => (p ? { ...p, enginePowerHp: next } : p))}
                options={ENGINE_HP_OPTIONS}
                placeholder="Выберите или введите, л.с."
              />
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">Владельцев по ПТС</label>
                <select
                  value={motoParams.ownersPts}
                  onChange={(e) => setMotoParams((p) => (p ? { ...p, ownersPts: e.target.value } : p))}
                  className={inputClass}
                  disabled={saving}
                >
                  <option value="">Владельцев по ПТС</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3+">3+</option>
                </select>
              </div>
            </div>
            <select
              value={motoParams.customsCleared}
              onChange={(e) => setMotoParams((p) => (p ? { ...p, customsCleared: e.target.value } : p))}
              className={inputClass}
              disabled={saving}
            >
              <option value="">Растаможен</option>
              <option value="Да">Да</option>
              <option value="Нет">Нет</option>
            </select>
          </div>
        ) : null}

        {listingCategory === "realestate" ? (
          <div className="rounded-card border border-line bg-elev-2/40 p-4">
            <ListingRealEstateFields
              value={categoryParams.realestate}
              onChange={(next) =>
                setCategoryParams((prev) => ({ ...prev, realestate: next }))
              }
              listingIntent={listingIntent}
              disabled={saving}
              inputClass={inputClass}
            />
          </div>
        ) : null}

        <ListingMiscCategoryFieldsForEdit
          category={listingCategory}
          categoryParams={categoryParams}
          setCategoryParams={setCategoryParams}
          inputClass={inputClass}
          disabled={saving}
        />

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
