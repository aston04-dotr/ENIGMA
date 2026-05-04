"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CategoryEditParams } from "@/lib/listingCategoryEdit";

const KIDS_SIZE_OPTIONS = [
  "50",
  "56",
  "62",
  "68",
  "74",
  "80",
  "86",
  "92",
  "98",
  "104",
  "110",
  "116",
  "122",
  "128",
  "134",
  "140",
  "146",
  "152",
  "158",
  "164",
] as const;

const FASHION_CLOTHING_SIZE_OPTIONS = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
] as const;

const KIDS_SHOE_SIZE_OPTIONS = Array.from({ length: 14 }, (_, idx) => String(35 + idx));

type KidsKind = "clothing" | "shoes" | "toy" | "transport_other";

function getKidsItemKind(raw: string): KidsKind | null {
  const t = raw.trim().toLowerCase();
  if (t === "одежда") return "clothing";
  if (t === "обувь") return "shoes";
  if (t === "игрушка") return "toy";
  if (t === "транспорт" || t === "другое") return "transport_other";
  return null;
}

function kidsShowsSize(kind: KidsKind | null): boolean {
  return kind === "clothing" || kind === "shoes";
}

type Props = {
  category: string;
  categoryParams: CategoryEditParams;
  setCategoryParams: Dispatch<SetStateAction<CategoryEditParams>>;
  inputClass: string;
  disabled?: boolean;
};

export function ListingMiscCategoryFieldsForEdit({
  category,
  categoryParams,
  setCategoryParams,
  inputClass,
  disabled,
}: Props) {
  const kidsKindUi = getKidsItemKind(categoryParams.kids.itemType);

  function updateCategoryParam<K extends keyof CategoryEditParams, F extends keyof CategoryEditParams[K]>(
    cat: K,
    field: F,
    value: CategoryEditParams[K][F],
  ) {
    setCategoryParams((prev) => ({
      ...prev,
      [cat]: {
        ...(prev[cat] as object),
        [field]: value,
      },
    }));
  }

  if (category === "electronics") {
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры электроники
        </label>
        <input
          value={categoryParams.electronics.brand}
          onChange={(e) => updateCategoryParam("electronics", "brand", e.target.value)}
          placeholder="Бренд *"
          className={inputClass}
          disabled={disabled}
        />
        <input
          value={categoryParams.electronics.model}
          onChange={(e) => updateCategoryParam("electronics", "model", e.target.value)}
          placeholder="Модель *"
          className={inputClass}
          disabled={disabled}
        />
        <select
          value={categoryParams.electronics.condition}
          onChange={(e) => updateCategoryParam("electronics", "condition", e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Состояние *</option>
          <option value="Новое">Новое</option>
          <option value="Б/у">Б/у</option>
        </select>
      </div>
    );
  }

  if (category === "fashion") {
    const fp = categoryParams.fashion;
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры одежды/обуви
        </label>
        <select
          value={fp.itemType}
          onChange={(e) => {
            const nextType = e.target.value;
            updateCategoryParam("fashion", "itemType", nextType);
            updateCategoryParam("fashion", "size", "");
            updateCategoryParam("fashion", "sizeOther", "");
          }}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Тип * (одежда/обувь)</option>
          <option value="Одежда">Одежда</option>
          <option value="Обувь">Обувь</option>
        </select>
        <select
          value={fp.itemType ? fp.size || "" : ""}
          onChange={(e) => updateCategoryParam("fashion", "size", e.target.value)}
          className={`${inputClass} ${fp.itemType ? (fp.size ? "text-fg" : "text-muted") : "text-muted"} disabled:cursor-not-allowed disabled:opacity-[0.65]`}
          disabled={!fp.itemType || disabled}
        >
          {!fp.itemType ? (
            <option value="">Сначала выберите тип</option>
          ) : (
            <>
              <option value="" className="text-muted">
                Выберите размер
              </option>
              {fp.itemType === "Одежда"
                ? FASHION_CLOTHING_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))
                : null}
              {fp.itemType === "Обувь"
                ? Array.from({ length: 14 }, (_, idx) => String(35 + idx)).map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))
                : null}
              <option value="__other__" className="text-fg">
                Другой
              </option>
            </>
          )}
        </select>
        {fp.size === "__other__" ? (
          <input
            value={fp.sizeOther}
            onChange={(e) => updateCategoryParam("fashion", "sizeOther", e.target.value)}
            placeholder="Укажите размер"
            className={inputClass}
            disabled={disabled}
          />
        ) : null}
        <select
          value={fp.condition}
          onChange={(e) => updateCategoryParam("fashion", "condition", e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Состояние *</option>
          <option value="Новое">Новое</option>
          <option value="Б/у">Б/у</option>
        </select>
      </div>
    );
  }

  if (category === "services") {
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры услуги
        </label>
        <input
          value={categoryParams.services.serviceType}
          onChange={(e) => updateCategoryParam("services", "serviceType", e.target.value)}
          placeholder="Тип услуги *"
          className={inputClass}
          disabled={disabled}
        />
        <select
          value={categoryParams.services.priceType}
          onChange={(e) => updateCategoryParam("services", "priceType", e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Цена *</option>
          <option value="За час">За час</option>
          <option value="За услугу">За услугу</option>
        </select>
      </div>
    );
  }

  if (category === "kids") {
    const kp = categoryParams.kids;
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры категории Детям
        </label>
        <input
          value={kp.itemType}
          onChange={(e) => {
            const v = e.target.value;
            setCategoryParams((prev) => ({
              ...prev,
              kids: {
                ...prev.kids,
                itemType: v,
                size: "",
                sizeOther: "",
              },
            }));
          }}
          placeholder="Тип товара * (Одежда, Обувь, Игрушка, Транспорт, Другое)"
          className={inputClass}
          disabled={disabled}
        />
        <input
          value={kp.age}
          onChange={(e) => updateCategoryParam("kids", "age", e.target.value)}
          placeholder={kidsKindUi === "toy" ? "Возраст *" : "Возраст"}
          className={inputClass}
          disabled={disabled}
        />
        {kidsShowsSize(kidsKindUi) ? (
          <>
            <select
              value={kp.size || ""}
              onChange={(e) => updateCategoryParam("kids", "size", e.target.value)}
              className={`${inputClass} ${kp.size ? "text-fg" : "text-muted"}`}
              disabled={disabled}
            >
              <option value="" className="text-muted">
                Выберите размер *
              </option>
              {kidsKindUi === "shoes"
                ? KIDS_SHOE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size} className="text-fg">
                      {size}
                    </option>
                  ))
                : KIDS_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size} className="text-fg">
                      {size}
                    </option>
                  ))}
              <option value="__other__" className="text-fg">
                Другой
              </option>
            </select>
            {kp.size === "__other__" ? (
              <input
                value={kp.sizeOther}
                onChange={(e) => updateCategoryParam("kids", "sizeOther", e.target.value)}
                placeholder={kidsKindUi === "shoes" ? "Укажите размер (число)" : "Укажите размер"}
                className={inputClass}
                inputMode={kidsKindUi === "shoes" ? "numeric" : undefined}
                disabled={disabled}
              />
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  if (category === "sport") {
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры категории Спорт
        </label>
        <input
          value={categoryParams.sport.itemType}
          onChange={(e) => updateCategoryParam("sport", "itemType", e.target.value)}
          placeholder="Тип товара *"
          className={inputClass}
          disabled={disabled}
        />
        <select
          value={categoryParams.sport.condition}
          onChange={(e) => updateCategoryParam("sport", "condition", e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Состояние *</option>
          <option value="Новое">Новое</option>
          <option value="Б/у">Б/у</option>
        </select>
      </div>
    );
  }

  if (category === "home") {
    return (
      <div className="space-y-3">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Параметры категории Дом и сад
        </label>
        <input
          value={categoryParams.home.itemType}
          onChange={(e) => updateCategoryParam("home", "itemType", e.target.value)}
          placeholder="Тип товара *"
          className={inputClass}
          disabled={disabled}
        />
        <select
          value={categoryParams.home.condition}
          onChange={(e) => updateCategoryParam("home", "condition", e.target.value)}
          className={inputClass}
          disabled={disabled}
        >
          <option value="">Состояние *</option>
          <option value="Новое">Новое</option>
          <option value="Б/у">Б/у</option>
        </select>
      </div>
    );
  }

  return null;
}
