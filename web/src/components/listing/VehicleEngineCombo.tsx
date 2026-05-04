"use client";

import CreatableSelect from "react-select/creatable";
import type { SingleValue } from "react-select";

export type VehicleComboOption = { value: string; label: string };

const HP_PRESETS = [
  75, 90, 100, 109, 120, 125, 136, 150, 156, 163, 174, 180, 190, 200, 211, 218, 224, 249, 275,
  300, 340, 400, 450, 510, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1100, 1200, 1250,
  1300, 1400, 1500,
] as const;

const AUTO_L_PRESETS = [
  "1.0",
  "1.2",
  "1.4",
  "1.5",
  "1.6",
  "1.8",
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.4",
  "5.0",
  "5.5",
  "6.0",
  "6.2",
  "6.5",
  "6.7",
  "7.0",
  "7.5",
  "8.0",
] as const;

const MOTO_L_PRESETS = [
  "0.05",
  "0.125",
  "0.25",
  "0.4",
  "0.5",
  "0.65",
  "0.8",
  "1.0",
  "1.2",
  "1.5",
  "1.8",
  "2.0",
  "2.5",
] as const;

export const ENGINE_HP_OPTIONS: VehicleComboOption[] = HP_PRESETS.map((v) => ({
  value: String(v),
  label: `${v} л.с.`,
}));

export const AUTO_ENGINE_VOLUME_OPTIONS: VehicleComboOption[] = AUTO_L_PRESETS.map((v) => ({
  value: v,
  label: `${v} л`,
}));

export const MOTO_ENGINE_VOLUME_OPTIONS: VehicleComboOption[] = MOTO_L_PRESETS.map((v) => ({
  value: v,
  label: `${v} л`,
}));

type UnitKind = "hp" | "liters";

function formatCustomLabel(trimmed: string, unit: UnitKind): string {
  return unit === "hp" ? `${trimmed} л.с.` : `${trimmed} л`;
}

export function VehicleEngineCombo({
  label,
  value,
  onChange,
  options,
  placeholder,
  unit,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly VehicleComboOption[];
  placeholder: string;
  unit: UnitKind;
}) {
  const trimmed = value.trim();
  const selected: VehicleComboOption | null = trimmed
    ? options.some((o) => o.value === trimmed)
      ? options.find((o) => o.value === trimmed)!
      : { value: trimmed, label: formatCustomLabel(trimmed, unit) }
    : null;

  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</label>
      <CreatableSelect<VehicleComboOption, false>
        className="react-select-container"
        classNamePrefix="react-select"
        placeholder={placeholder}
        isClearable
        options={[...options]}
        value={selected}
        formatCreateLabel={(inputValue) => `Добавить «${inputValue}»`}
        onChange={(opt: SingleValue<VehicleComboOption>) => {
          onChange(String(opt?.value ?? "").trim());
        }}
      />
    </div>
  );
}
