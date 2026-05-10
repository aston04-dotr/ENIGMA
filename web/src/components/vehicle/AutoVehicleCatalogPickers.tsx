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
import { VehicleBrandGlyph } from "@/components/vehicle/VehicleBrandGlyph";
import { useCallback, useEffect, useMemo, useState } from "react";

type SheetKind = "body_class" | "country" | "brand" | "model";

const ROW_BASE =
  "pressable mt-2 flex min-h-[56px] w-full flex-col justify-center rounded-card border px-4 py-3.5 text-left transition-[transform,border-color,background-color,box-shadow] duration-[200ms] active:scale-[0.993] disabled:opacity-45 disabled:pointer-events-none";

function rowClass(active: boolean): string {
  return `${ROW_BASE} ${
    active
      ? "border-accent/40 bg-gradient-to-br from-accent/[0.11] via-accent/[0.06] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      : "border-line bg-elevated hover:border-line/90 hover:bg-elev-2/45"
  }`;
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
      leading: <VehicleBrandGlyph logoKey={b.logo_key} slugFallback={b.slug} />,
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

  let catalogHint =
    bodyUnreachable || geoCatalogUnreachable ? (
      <p className="rounded-[18px] border border-amber-500/35 bg-amber-500/[0.07] px-3 py-2.5 text-[12.5px] leading-relaxed text-fg">
        Не удалось загрузить справочник авто из базы. Убедитесь, что на Supabase применены миграции каталога
        (минимум до 068). После синхронизации выбор класса, страны, марки и модели появится автоматически.
      </p>
    ) : null;

  return (
    <div className="space-y-1">
      {catalogHint}

      <button
        type="button"
        disabled={disabled || catalogUnreachable || bodyLoad}
        onClick={() => setSheetOpen("body_class")}
        className={rowClass(Boolean(resolvedBody))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Тип авто / кузов *
        </span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {resolvedBody
            ? String(resolvedBody.name_ru ?? "").trim()
            : bodyLoad
              ? "Загрузка классов…"
              : "Выберите перед маркой"}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled || catalogUnreachable || !value.carBodyClassId.trim() || countryLoading}
        onClick={() => setSheetOpen("country")}
        className={rowClass(Boolean(resolvedCountry))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Страна производителя *
        </span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {!value.carBodyClassId.trim()
            ? "Сначала выберите тип кузова"
            : resolvedCountry
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
        <span className="mt-1 flex min-h-[22px] items-center gap-2.5 text-[15px] font-semibold leading-snug text-fg">
          {!value.carCountryId.trim() ? (
            "Сначала выберите страну"
          ) : resolvedBrand ? (
            <>
              <VehicleBrandGlyph logoKey={resolvedBrand.logo_key} slugFallback={resolvedBrand.slug} />
              <span className="min-w-0 break-words">
                {String(resolvedBrand.name_ru ?? "").trim() || value.brand.trim()}
              </span>
            </>
          ) : value.carBrandId.trim() ? (
            value.brand.trim() || "Марка"
          ) : (
            "Выбрать из списка"
          )}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled || catalogUnreachable || !value.carBrandId.trim() || !value.carBodyClassId.trim()}
        onClick={() => void prefetchModelsThenOpenSheet()}
        className={rowClass(Boolean(value.carModelId.trim()))}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Модель *</span>
        <span className="mt-1 text-[15px] font-semibold leading-snug text-fg">
          {!value.carBodyClassId.trim()
            ? "Сначала укажите тип кузова"
            : !value.carBrandId.trim()
              ? "Сначала выберите марку"
              : value.carModelId.trim()
                ? resolvedModel
                  ? String(resolvedModel.name_ru ?? "").trim() || value.model.trim()
                  : value.model.trim() || "Модель"
                : "Выбрать из списка"}
        </span>
      </button>

      <SearchablePickerSheet
        open={sheetOpen === "body_class"}
        title="Тип кузова / класс"
        subtitle="Сначала задаём контекст, затем марка и модель — меньше «плоских» каталогов"
        searchPlaceholder="SUV, седан, спорт…"
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
        title="Страна производителя"
        subtitle={resolvedBody ? String(resolvedBody.name_ru ?? "").trim() : undefined}
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
        subtitle={
          [value.carBodyClass.trim(), value.brand.trim()].filter(Boolean).join(" · ") || undefined
        }
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
