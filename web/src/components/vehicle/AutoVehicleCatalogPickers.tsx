"use client";

import type { AutoParamsShape } from "@/lib/listingVehicleForm";
import {
  fetchVehicleCatalogBodyClasses,
  fetchVehicleCatalogBrands,
  fetchVehicleCatalogCountries,
  fetchVehicleCatalogModels,
  type VehicleCatalogBrand,
  type VehicleCatalogBodyClass,
  type VehicleCatalogCountry,
  type VehicleCatalogModel,
  vehicleCatalogHaystack,
} from "@/lib/vehicleCatalog";
import { SearchablePickerSheet, type SearchablePickerOption } from "@/components/vehicle/SearchablePickerSheet";
import { useCallback, useEffect, useMemo, useState } from "react";

type SheetKind = "body_class" | "country" | "brand" | "model";

const ROW_BASE =
  "pressable mt-2 flex min-h-[60px] w-full flex-col justify-center rounded-[18px] border px-5 py-4 text-left transition-[transform,border-color,background-color,opacity] duration-200 disabled:pointer-events-none";

function rowClass(active: boolean, enabled: boolean): string {
  if (!enabled) {
    return `${ROW_BASE} cursor-not-allowed border-line/55 bg-elevated/65 opacity-[0.44] saturate-[0.65]`;
  }
  return `${ROW_BASE} ${
    active
      ? "border-accent/[0.32] bg-gradient-to-br from-accent/[0.08] via-transparent to-transparent"
      : "border-line/[0.9] bg-elevated hover:border-line hover:bg-elev-2/[0.42]"
  }`;
}

function pickValue(opts: {
  loading?: boolean;
  resolved: string | null;
  staleLabel?: string;
  staleId?: string;
}): { text: string; muted: boolean } {
  const { loading, resolved, staleLabel, staleId } = opts;
  if (loading) return { text: "…", muted: true };
  if (resolved?.trim()) return { text: resolved.trim(), muted: false };
  if (staleId?.trim() && staleLabel?.trim()) return { text: staleLabel.trim(), muted: false };
  return { text: "—", muted: true };
}

function countryLabelRu(c?: VehicleCatalogCountry | null): string {
  if (!c) return "";
  const emoji = String(c.flag_emoji ?? "").trim();
  const name = String(c.name_ru ?? "").trim();
  return [emoji, name].filter(Boolean).join(" ");
}

function modelsCacheKey(bodyClassId: string, brandId: string): string {
  return `${bodyClassId.trim()}:${brandId.trim()}`;
}

type Props = {
  value: AutoParamsShape;
  onPatch: (patch: Partial<AutoParamsShape>) => void;
  disabled?: boolean;
};

export function AutoVehicleCatalogPickers({ value, onPatch, disabled = false }: Props) {
  const [bodyClasses, setBodyClasses] = useState<VehicleCatalogBodyClass[]>([]);
  const [bodyLoad, setBodyLoad] = useState(false);

  const [countries, setCountries] = useState<VehicleCatalogCountry[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [brandLists, setBrandLists] = useState<Record<string, VehicleCatalogBrand[]>>({});
  const [modelLists, setModelLists] = useState<Record<string, VehicleCatalogModel[]>>({});

  const [brandFetchLoading, setBrandFetchLoading] = useState(false);
  const [modelFetchLoading, setModelFetchLoading] = useState(false);

  const [sheetOpen, setSheetOpen] = useState<SheetKind | null>(null);

  useEffect(() => {
    let dead = false;
    setBodyLoad(true);
    void fetchVehicleCatalogBodyClasses().then((rows) => {
      if (!dead) {
        setBodyClasses(rows);
        setBodyLoad(false);
      }
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    let dead = false;
    setCountryLoading(true);
    void fetchVehicleCatalogCountries().then((rows) => {
      if (!dead) {
        setCountries(rows);
        setCountryLoading(false);
      }
    });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    setModelLists({});
  }, [value.carBodyClassId]);

  const resolvedBody =
    bodyClasses.find((x) => x.id === value.carBodyClassId.trim()) ?? null;
  const resolvedCountry = countries.find((c) => c.id === value.carCountryId.trim()) ?? null;

  const brandsForPick = brandLists[value.carCountryId.trim()] ?? [];
  const resolvedBrand =
    brandsForPick.find((b) => b.id === value.carBrandId.trim()) ?? null;

  const mKey = modelsCacheKey(value.carBodyClassId, value.carBrandId);
  const modelsForPick = modelLists[mKey] ?? [];
  const resolvedModel =
    modelsForPick.find((m) => m.id === value.carModelId.trim()) ?? null;

  useEffect(() => {
    const cid = value.carCountryId.trim();
    if (!cid || brandLists[cid]) return;
    let dead = false;
    setBrandFetchLoading(true);
    void fetchVehicleCatalogBrands(cid).then((rows) => {
      if (!dead) {
        setBrandLists((prev) => ({ ...prev, [cid]: rows }));
        setBrandFetchLoading(false);
      }
    });
    return () => {
      dead = true;
    };
  }, [value.carCountryId, brandLists]);

  useEffect(() => {
    const bid = value.carBrandId.trim();
    const bod = value.carBodyClassId.trim();
    const key = modelsCacheKey(bod, bid);
    if (!bid || !bod || modelLists[key]) return;
    let dead = false;
    setModelFetchLoading(true);
    void fetchVehicleCatalogModels(bid, bod).then((rows) => {
      if (!dead) {
        setModelLists((prev) => ({ ...prev, [key]: rows }));
        setModelFetchLoading(false);
      }
    });
    return () => {
      dead = true;
    };
  }, [value.carBrandId, value.carBodyClassId, modelLists]);

  const prefetchBrandsThenOpenSheet = useCallback(async () => {
    const cid = value.carCountryId.trim();
    if (!cid.trim()) return;
    if (!brandLists[cid]) {
      setBrandFetchLoading(true);
      const rows = await fetchVehicleCatalogBrands(cid);
      setBrandLists((prev) => ({ ...prev, [cid]: rows }));
      setBrandFetchLoading(false);
    }
    setSheetOpen("brand");
  }, [value.carCountryId, brandLists]);

  const prefetchModelsThenOpenSheet = useCallback(async () => {
    const bid = value.carBrandId.trim();
    const bod = value.carBodyClassId.trim();
    if (!bid.trim() || !bod.trim()) return;
    const key = modelsCacheKey(bod, bid);
    if (!modelLists[key]) {
      setModelFetchLoading(true);
      const rows = await fetchVehicleCatalogModels(bid, bod);
      setModelLists((prev) => ({ ...prev, [key]: rows }));
      setModelFetchLoading(false);
    }
    setSheetOpen("model");
  }, [value.carBrandId, value.carBodyClassId, modelLists]);

  const bodyOptions: SearchablePickerOption[] = useMemo(
    () =>
      bodyClasses.map((c) => ({
        id: c.id,
        label: String(c.name_ru ?? "").trim(),
        description:
          String(c.name_en ?? "").trim() && String(c.name_en ?? "").trim() !== String(c.name_ru ?? "").trim()
            ? String(c.name_en ?? "").trim()
            : undefined,
        searchHaystack: vehicleCatalogHaystack([c.name_ru, c.name_en], []),
      })),
    [bodyClasses],
  );

  const countryOptions: SearchablePickerOption[] = useMemo(
    () =>
      countries.map((c) => ({
        id: c.id,
        label: `${String(c.flag_emoji ?? "").trim()} ${String(c.name_ru ?? "").trim()}`.trim(),
        description:
          String(c.name_en ?? "").trim() && String(c.name_en ?? "").trim() !== String(c.name_ru ?? "").trim()
            ? String(c.name_en ?? "").trim()
            : undefined,
        searchHaystack: vehicleCatalogHaystack([c.name_ru, c.name_en], c.aliases),
      })),
    [countries],
  );

  const brandOptions: SearchablePickerOption[] = useMemo(() => {
    const rows = brandsForPick;
    return rows.map((b) => ({
      id: b.id,
      label: String(b.name_ru ?? "").trim(),
      description: String(b.name_en ?? "").trim() || undefined,
      searchHaystack: vehicleCatalogHaystack([b.name_ru, b.name_en], b.aliases),
    }));
  }, [brandsForPick]);

  const modelOptions: SearchablePickerOption[] = useMemo(() => {
    const rows = modelsForPick;
    return rows.map((m) => ({
      id: m.id,
      label: String(m.name_ru ?? "").trim(),
      description: String(m.name_en ?? "").trim() || undefined,
      searchHaystack: vehicleCatalogHaystack([m.name_ru, m.name_en], m.aliases),
    }));
  }, [modelsForPick]);

  const bodyUnreachable = !bodyLoad && bodyClasses.length === 0;
  const geoCatalogUnreachable = !countryLoading && countries.length === 0;
  const catalogUnreachable = bodyUnreachable || geoCatalogUnreachable;

  const step1Blocked = disabled || catalogUnreachable || bodyLoad;
  const step2Blocked = disabled || catalogUnreachable || !value.carBodyClassId.trim() || countryLoading;
  const step3Blocked = disabled || catalogUnreachable || !value.carCountryId.trim();
  const step4Blocked =
    disabled || catalogUnreachable || !value.carBrandId.trim() || !value.carBodyClassId.trim();

  const catalogHint =
    bodyUnreachable || geoCatalogUnreachable ? (
      <p className="rounded-[18px] border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[13px] leading-snug text-fg">
        Не удалось загрузить справочник. Проверьте миграции каталога на Supabase.
      </p>
    ) : null;

  const bodyVal = pickValue({
    loading: bodyLoad && !resolvedBody,
    resolved: resolvedBody ? String(resolvedBody.name_ru ?? "").trim() : "",
  });

  const countryVal = pickValue({
    loading: countryLoading && !resolvedCountry && !step2Blocked,
    resolved: resolvedCountry ? countryLabelRu(resolvedCountry) : "",
  });

  const brandVal = pickValue({
    resolved: resolvedBrand ? String(resolvedBrand.name_ru ?? "").trim() : "",
    staleLabel: value.brand,
    staleId: value.carBrandId,
  });

  const modelVal = pickValue({
    resolved: resolvedModel ? String(resolvedModel.name_ru ?? "").trim() : "",
    staleLabel: value.model,
    staleId: value.carModelId,
  });

  return (
    <div className="space-y-2.5">
      {catalogHint}

      <button
        type="button"
        disabled={step1Blocked}
        onClick={() => setSheetOpen("body_class")}
        className={rowClass(Boolean(resolvedBody), !step1Blocked)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/95">
          Тип авто / кузов
        </span>
        <span
          className={`mt-1.5 block text-[16px] font-medium leading-snug tracking-[-0.02em] ${
            bodyVal.muted ? "text-muted/[0.65]" : "text-fg"
          }`}
        >
          {bodyVal.text}
        </span>
      </button>

      <button
        type="button"
        disabled={step2Blocked}
        onClick={() => setSheetOpen("country")}
        className={rowClass(Boolean(resolvedCountry), !step2Blocked)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/95">
          Страна
        </span>
        <span
          className={`mt-1.5 block text-[16px] font-medium leading-snug tracking-[-0.02em] ${
            step2Blocked || countryVal.muted ? "text-muted/[0.65]" : "text-fg"
          }`}
        >
          {step2Blocked ? "—" : countryVal.text}
        </span>
      </button>

      <button
        type="button"
        disabled={step3Blocked}
        onClick={() => void prefetchBrandsThenOpenSheet()}
        className={rowClass(Boolean(value.carBrandId.trim()), !step3Blocked)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/95">
          Марка
        </span>
        <span
          className={`mt-1.5 block min-h-[22px] break-words text-[16px] font-medium leading-snug tracking-[-0.02em] ${
            step3Blocked || brandVal.muted ? "text-muted/[0.65]" : "text-fg"
          }`}
        >
          {step3Blocked ? "—" : brandVal.text}
        </span>
      </button>

      <button
        type="button"
        disabled={step4Blocked}
        onClick={() => void prefetchModelsThenOpenSheet()}
        className={rowClass(Boolean(value.carModelId.trim()), !step4Blocked)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/95">
          Модель
        </span>
        <span
          className={`mt-1.5 block min-h-[22px] break-words text-[16px] font-medium leading-snug tracking-[-0.02em] ${
            step4Blocked || modelVal.muted ? "text-muted/[0.65]" : "text-fg"
          }`}
        >
          {step4Blocked ? "—" : modelVal.text}
        </span>
      </button>

      <SearchablePickerSheet
        open={sheetOpen === "body_class"}
        title="Тип авто / кузов"
        searchPlaceholder="Поиск…"
        options={bodyOptions}
        loading={bodyLoad && bodyClasses.length === 0}
        onClose={() => setSheetOpen(null)}
        onSelect={(id) => {
          const row = bodyClasses.find((x) => x.id === id);
          const lab = row ? String(row.name_ru ?? "").trim() : "";
          onPatch({
            carBodyClassId: id,
            carBodyClass: lab || value.carBodyClass,
            carCountryId: "",
            carBrandId: "",
            carModelId: "",
            brand: "",
            model: "",
          });
        }}
      />

      <SearchablePickerSheet
        open={sheetOpen === "country"}
        title="Страна"
        subtitle={resolvedBody ? String(resolvedBody.name_ru ?? "").trim() : undefined}
        searchPlaceholder="Поиск…"
        options={countryOptions}
        loading={countryLoading && countries.length === 0}
        onClose={() => setSheetOpen(null)}
        onSelect={(id) => {
          onPatch({
            carCountryId: id,
            carBrandId: "",
            carModelId: "",
            brand: "",
            model: "",
          });
        }}
      />

      <SearchablePickerSheet
        open={sheetOpen === "brand"}
        title="Марка"
        subtitle={resolvedCountry ? countryLabelRu(resolvedCountry) : undefined}
        searchPlaceholder="Поиск…"
        options={brandOptions}
        loading={brandFetchLoading && brandsForPick.length === 0}
        onClose={() => setSheetOpen(null)}
        onSelect={(id) => {
          const row = brandsForPick.find((b) => b.id === id);
          const nameRu = row ? String(row.name_ru ?? "").trim() : "";
          onPatch({
            carBrandId: id,
            carModelId: "",
            model: "",
            brand: nameRu || value.brand,
          });
        }}
      />

      <SearchablePickerSheet
        open={sheetOpen === "model"}
        title="Модель"
        subtitle={value.brand.trim() || undefined}
        searchPlaceholder="Поиск…"
        options={modelOptions}
        loading={modelFetchLoading && modelsForPick.length === 0}
        onClose={() => setSheetOpen(null)}
        onSelect={(id) => {
          const row = modelsForPick.find((m) => m.id === id);
          const nameRu = row ? String(row.name_ru ?? "").trim() : "";
          onPatch({
            carModelId: id,
            model: nameRu || value.model,
          });
        }}
      />
    </div>
  );
}
