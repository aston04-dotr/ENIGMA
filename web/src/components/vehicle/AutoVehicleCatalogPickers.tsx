"use client";

import type { AutoParamsShape } from "@/lib/listingVehicleForm";
import {
  fetchVehicleCatalogBrands,
  fetchVehicleCatalogCountries,
  fetchVehicleCatalogModels,
  type VehicleCatalogBrand,
  type VehicleCatalogCountry,
  type VehicleCatalogModel,
  vehicleCatalogHaystack,
} from "@/lib/vehicleCatalog";
import { SearchablePickerSheet, type SearchablePickerOption } from "@/components/vehicle/SearchablePickerSheet";
import { useCallback, useEffect, useMemo, useState } from "react";

type SheetKind = "country" | "brand" | "model";

const ROW_BASE =
  "pressable mt-2 flex min-h-[52px] w-full flex-col justify-center rounded-card border px-4 py-3 text-left transition-[transform,border-color,background-color] duration-ui active:scale-[0.993] disabled:opacity-45 disabled:pointer-events-none";

function rowClass(active: boolean): string {
  return `${ROW_BASE} ${
    active
      ? "border-accent/40 bg-accent/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      : "border-line bg-elevated hover:bg-elev-2/55"
  }`;
}

function countryLabelRu(c?: VehicleCatalogCountry | null): string {
  if (!c) return "";
  const emoji = String(c.flag_emoji ?? "").trim();
  const name = String(c.name_ru ?? "").trim();
  return [emoji, name].filter(Boolean).join(" ");
}

type Props = {
  value: AutoParamsShape;
  onPatch: (patch: Partial<AutoParamsShape>) => void;
  disabled?: boolean;
};

export function AutoVehicleCatalogPickers({ value, onPatch, disabled = false }: Props) {
  const [countries, setCountries] = useState<VehicleCatalogCountry[]>([]);
  const [countryLoading, setCountryLoading] = useState(false);
  const [brandLists, setBrandLists] = useState<Record<string, VehicleCatalogBrand[]>>({});
  const [modelLists, setModelLists] = useState<Record<string, VehicleCatalogModel[]>>({});
  const [brandFetchLoading, setBrandFetchLoading] = useState(false);
  const [modelFetchLoading, setModelFetchLoading] = useState(false);

  const [sheetOpen, setSheetOpen] = useState<SheetKind | null>(null);

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

  const resolvedCountry = useMemo(
    () => countries.find((c) => c.id === value.carCountryId.trim()) ?? null,
    [countries, value.carCountryId],
  );

  const brandsForPick = brandLists[value.carCountryId.trim()] ?? [];
  const resolvedBrand =
    brandsForPick.find((b) => b.id === value.carBrandId.trim()) ?? null;
  const modelsForPick = modelLists[value.carBrandId.trim()] ?? [];
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
    if (!bid || modelLists[bid]) return;
    let dead = false;
    setModelFetchLoading(true);
    void fetchVehicleCatalogModels(bid).then((rows) => {
      if (!dead) {
        setModelLists((prev) => ({ ...prev, [bid]: rows }));
        setModelFetchLoading(false);
      }
    });
    return () => {
      dead = true;
    };
  }, [value.carBrandId, modelLists]);

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
    if (!bid.trim()) return;
    if (!modelLists[bid]) {
      setModelFetchLoading(true);
      const rows = await fetchVehicleCatalogModels(bid);
      setModelLists((prev) => ({ ...prev, [bid]: rows }));
      setModelFetchLoading(false);
    }
    setSheetOpen("model");
  }, [value.carBrandId, modelLists]);

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

  const catalogUnreachable = !countryLoading && countries.length === 0;

  return (
    <div className="space-y-1">
      {catalogUnreachable ? (
        <p className="rounded-card border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-fg">
          Не удалось загрузить справочник авто из базы (проверьте миграции Supabase 064–065). После их
          применения выбор страны, марки и модели появится автоматически.
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled || catalogUnreachable || countryLoading}
        onClick={() => setSheetOpen("country")}
        className={rowClass(Boolean(resolvedCountry))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Страна производителя *
        </span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {resolvedCountry
            ? countryLabelRu(resolvedCountry)
            : countryLoading
              ? "Загрузка каталога…"
              : "Выбрать из списка"}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled || catalogUnreachable || !value.carCountryId.trim()}
        onClick={() => void prefetchBrandsThenOpenSheet()}
        className={rowClass(Boolean(value.carBrandId.trim()))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Марка *</span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {!value.carCountryId.trim()
            ? "Сначала выберите страну"
            : value.carBrandId.trim()
              ? resolvedBrand
                ? String(resolvedBrand.name_ru ?? "").trim() || value.brand.trim()
                : value.brand.trim() || "Марка"
              : "Выбрать из списка"}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled || catalogUnreachable || !value.carBrandId.trim()}
        onClick={() => void prefetchModelsThenOpenSheet()}
        className={rowClass(Boolean(value.carModelId.trim()))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Модель *</span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {!value.carBrandId.trim()
            ? "Сначала выберите марку"
            : value.carModelId.trim()
              ? resolvedModel
                ? String(resolvedModel.name_ru ?? "").trim() || value.model.trim()
                : value.model.trim() || "Модель"
              : "Выбрать из списка"}
        </span>
      </button>

      <SearchablePickerSheet
        open={sheetOpen === "country"}
        title="Страна производителя"
        subtitle="Где исторически зарегистрирован основной автомобильный бренд"
        searchPlaceholder="Поиск по стране — RU или EN…"
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
        searchPlaceholder="Audi, Toyota, BMW…"
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
        subtitle={value.brand.trim() ? value.brand.trim() : undefined}
        searchPlaceholder="Например: X5, Camry…"
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
