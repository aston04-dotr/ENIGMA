"use client";

import { useMemo, useState } from "react";
import type { RealEstateEditParams } from "@/lib/listingCategoryEdit";
import {
  COMMERCIAL_PROPERTY_LABEL,
  COMMERCIAL_SHOPPING_CENTER_LABEL,
  COMMERCIAL_PREMISES_OPTIONS,
  HOUSE_LABEL,
  LAND_PLOT_LABEL,
  LAND_OWNERSHIP_OPTIONS,
  LAND_PURPOSE_OPTIONS,
  isCommercialShoppingCenter,
  normalizeDecimalInput,
  parseFlexiblePositiveNumber,
  sotkiToHectaresDisplay,
} from "@/lib/listingCategoryEdit";

type Props = {
  value: RealEstateEditParams;
  onChange: (next: RealEstateEditParams) => void;
  listingIntent: "sale" | "rent";
  disabled?: boolean;
  inputClass: string;
};

export function ListingRealEstateFields({
  value: re,
  onChange,
  listingIntent,
  disabled,
  inputClass,
}: Props) {
  const [landPlotHaTyping, setLandPlotHaTyping] = useState<string | null>(null);

  const isLandPlotProp = re.propertyType === LAND_PLOT_LABEL;
  const isCommercialProp = re.propertyType === COMMERCIAL_PROPERTY_LABEL;
  const isHouseProp = re.propertyType === HOUSE_LABEL;
  const needsMainAreaField =
    re.propertyType !== LAND_PLOT_LABEL && re.propertyType !== "";
  const needsPlotAreaField =
    re.propertyType === HOUSE_LABEL || re.propertyType === LAND_PLOT_LABEL;

  const landPlotInputDisplay = useMemo(() => {
    if (!isLandPlotProp) return re.plotArea;
    if (!re.plotAreaUnitHa) return re.plotArea;
    if (landPlotHaTyping != null) return landPlotHaTyping;
    const s = parseFlexiblePositiveNumber(re.plotArea);
    return s != null ? sotkiToHectaresDisplay(s) : "";
  }, [isLandPlotProp, landPlotHaTyping, re.plotArea, re.plotAreaUnitHa]);

  function patch(partial: Partial<RealEstateEditParams>) {
    onChange({ ...re, ...partial });
  }

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Параметры недвижимости
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select
          value={re.propertyType}
          onChange={(e) => {
            const v = e.target.value;
            const base: RealEstateEditParams = { ...re, propertyType: v };

            if (v !== COMMERCIAL_PROPERTY_LABEL) {
              base.commercialPremisesType = "";
              base.commercialPowerKw = "";
            }

            if (v === HOUSE_LABEL || v === LAND_PLOT_LABEL) {
              if (re.propertyType !== HOUSE_LABEL && re.propertyType !== LAND_PLOT_LABEL) {
                base.plotArea = "";
                base.plotAreaUnitHa = false;
              }
            } else {
              base.plotArea = "";
              base.plotAreaUnitHa = false;
            }

            if (v === LAND_PLOT_LABEL) {
              base.area = "";
              base.floor = "";
              base.floorsTotal = "";
              base.rooms = "";
              base.parking = "";
              base.renovation = "";
              if (re.propertyType !== LAND_PLOT_LABEL) {
                base.landType = "";
                base.landOwnershipStatus = "";
                base.plotAreaUnitHa = false;
              }
            }

            if (v !== LAND_PLOT_LABEL && re.propertyType === LAND_PLOT_LABEL) {
              base.landType = "";
              base.landOwnershipStatus = "";
              base.plotAreaUnitHa = false;
            }

            if (v === COMMERCIAL_PROPERTY_LABEL) {
              base.plotArea = "";
              base.plotAreaUnitHa = false;
              base.rooms = "";
            }

            onChange(base);
          }}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Тип *</option>
          <option value="Квартира">Квартира</option>
          <option value={HOUSE_LABEL}>{HOUSE_LABEL}</option>
          <option value={LAND_PLOT_LABEL}>{LAND_PLOT_LABEL}</option>
          <option value={COMMERCIAL_PROPERTY_LABEL}>{COMMERCIAL_PROPERTY_LABEL}</option>
        </select>
        {needsMainAreaField ? (
          <input
            value={re.area}
            onChange={(e) => patch({ area: e.target.value })}
            inputMode="decimal"
            placeholder={
              isHouseProp ? "Площадь дома (м²) *" : "Площадь (м²) *"
            }
            className={inputClass}
            disabled={disabled}
          />
        ) : null}
      </div>
      {needsPlotAreaField ? (
        isLandPlotProp ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={landPlotInputDisplay}
              onChange={(e) => {
                const raw = e.target.value;
                if (!re.plotAreaUnitHa) {
                  patch({
                    plotArea: normalizeDecimalInput(raw).replace(/[^\d.]/g, ""),
                  });
                  return;
                }
                setLandPlotHaTyping(raw);
                const ha = parseFlexiblePositiveNumber(raw);
                patch({
                  plotArea: ha != null ? String(ha * 100) : "",
                });
              }}
              onFocus={() => {
                if (!re.plotAreaUnitHa) return;
                const s = parseFlexiblePositiveNumber(re.plotArea);
                setLandPlotHaTyping(s != null ? sotkiToHectaresDisplay(s) : "");
              }}
              onBlur={() => setLandPlotHaTyping(null)}
              inputMode="decimal"
              placeholder={re.plotAreaUnitHa ? "Площадь, га *" : "Площадь, сот. *"}
              className={`${inputClass} min-w-[160px] flex-1`}
              disabled={disabled}
            />
            <label className="flex shrink-0 cursor-pointer select-none items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={re.plotAreaUnitHa}
                aria-label="Площадь в гектарах"
                disabled={disabled}
                onClick={() => {
                  patch({ plotAreaUnitHa: !re.plotAreaUnitHa });
                  setLandPlotHaTyping(null);
                }}
                className={`relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border transition-colors duration-200 ${
                  re.plotAreaUnitHa
                    ? "border-accent bg-accent"
                    : "border-line bg-elev-2"
                }`}
              >
                <span
                  className={`absolute left-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-200 ${
                    re.plotAreaUnitHa ? "translate-x-[22px]" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                ГА
              </span>
            </label>
          </div>
        ) : (
          <input
            value={re.plotArea}
            onChange={(e) => patch({ plotArea: e.target.value })}
            placeholder="Площадь участка *"
            className={inputClass}
            disabled={disabled}
          />
        )
      ) : null}
      {isLandPlotProp ? (
        <>
          <select
            value={re.landType}
            onChange={(e) => patch({ landType: e.target.value })}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">Вид участка *</option>
            {LAND_PURPOSE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={re.landOwnershipStatus}
            onChange={(e) => patch({ landOwnershipStatus: e.target.value })}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">Статус собственности *</option>
            {LAND_OWNERSHIP_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {isCommercialProp ? (
        <select
          value={re.commercialPremisesType}
          onChange={(e) => {
            const v = e.target.value;
            patch({
              commercialPremisesType: v,
              floor: v === COMMERCIAL_SHOPPING_CENTER_LABEL ? "" : re.floor,
            });
          }}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Тип помещения *</option>
          {COMMERCIAL_PREMISES_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : null}
      {isCommercialProp ? (
        <input
          value={re.commercialPowerKw}
          onChange={(e) => patch({ commercialPowerKw: e.target.value })}
          inputMode="decimal"
          placeholder="Мощность (кВт)"
          className={inputClass}
          disabled={disabled}
        />
      ) : null}
      {!isLandPlotProp ? (
        isCommercialProp && isCommercialShoppingCenter(re) ? (
          <input
            value={re.floorsTotal}
            onChange={(e) => patch({ floorsTotal: e.target.value })}
            inputMode="numeric"
            placeholder="Этажность здания *"
            className={inputClass}
            disabled={disabled}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              value={re.floor}
              onChange={(e) => patch({ floor: e.target.value })}
              inputMode="numeric"
              placeholder="Этаж *"
              className={inputClass}
              disabled={disabled}
            />
            <input
              value={re.floorsTotal}
              onChange={(e) => patch({ floorsTotal: e.target.value })}
              inputMode="numeric"
              placeholder="Этажность здания *"
              className={inputClass}
              disabled={disabled}
            />
          </div>
        )
      ) : null}
      {!isLandPlotProp && !isCommercialProp ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={re.rooms}
            onChange={(e) => patch({ rooms: e.target.value })}
            inputMode="numeric"
            placeholder={
              listingIntent === "rent" ? "Количество комнат *" : "Количество комнат"
            }
            className={inputClass}
            disabled={disabled}
          />
          <select
            value={re.parking}
            onChange={(e) => patch({ parking: e.target.value })}
            className={inputClass}
            disabled={disabled}
          >
            <option value="">Парковка</option>
            <option value="Да">Да</option>
            <option value="Нет">Нет</option>
          </select>
        </div>
      ) : null}
      {!isLandPlotProp && isCommercialProp ? (
        <select
          value={re.parking}
          onChange={(e) => patch({ parking: e.target.value })}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Парковка</option>
          <option value="Да">Да</option>
          <option value="Нет">Нет</option>
        </select>
      ) : null}
      {!isLandPlotProp ? (
        <select
          value={re.renovation}
          onChange={(e) => patch({ renovation: e.target.value })}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Ремонт</option>
          <option value="Нет">Нет</option>
          <option value="Косметический">Косметический</option>
          <option value="Евро">Евро</option>
        </select>
      ) : null}

      <div className="border-t border-line pt-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Коммуникации
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
            <input
              type="checkbox"
              checked={re.commsGas}
              onChange={(e) => patch({ commsGas: e.target.checked })}
              disabled={disabled}
              className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
            />
            Газ
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
            <input
              type="checkbox"
              checked={re.commsWater}
              onChange={(e) => patch({ commsWater: e.target.checked })}
              disabled={disabled}
              className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
            />
            Вода
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
            <input
              type="checkbox"
              checked={re.commsLight}
              onChange={(e) => patch({ commsLight: e.target.checked })}
              disabled={disabled}
              className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
            />
            Электричество
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-fg">
            <input
              type="checkbox"
              checked={re.commsSewage}
              onChange={(e) => patch({ commsSewage: e.target.checked })}
              disabled={disabled}
              className="h-[18px] w-[18px] shrink-0 rounded border-line accent-accent"
            />
            Канализация
          </label>
        </div>
      </div>
    </div>
  );
}
