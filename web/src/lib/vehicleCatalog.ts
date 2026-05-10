"use client";

import type { Database } from "@/lib/supabase.types";
import { supabase } from "@/lib/supabase";

export type VehicleCatalogCountry =
  Database["public"]["Tables"]["car_catalog_countries"]["Row"];
export type VehicleCatalogBodyClass =
  Database["public"]["Tables"]["car_catalog_body_classes"]["Row"];
export type VehicleCatalogBrand =
  Database["public"]["Tables"]["car_catalog_brands"]["Row"];
export type VehicleCatalogModel =
  Database["public"]["Tables"]["car_catalog_models"]["Row"];

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
}

/** Текст для поиска по RU/EN + aliases. */
export function vehicleCatalogHaystack(parts: string[], aliases: unknown): string {
  const a = asStringArray(aliases);
  return [...parts, ...a].join(" ").toLowerCase();
}

export function matchesVehicleCatalogQuery(haystackLower: string, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return haystackLower.includes(t);
}

export async function fetchVehicleCatalogCountries(): Promise<VehicleCatalogCountry[]> {
  const { data, error } = await supabase
    .from("car_catalog_countries")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_ru", { ascending: true });

  if (error) {
    console.error("[vehicleCatalog] countries", error);
    return [];
  }
  return data ?? [];
}

export async function fetchVehicleCatalogBodyClasses(): Promise<VehicleCatalogBodyClass[]> {
  const { data, error } = await supabase
    .from("car_catalog_body_classes")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name_ru", { ascending: true });

  if (error) {
    console.error("[vehicleCatalog] body classes", error);
    return [];
  }
  return data ?? [];
}

export async function fetchVehicleCatalogBrands(
  countryId: string,
): Promise<VehicleCatalogBrand[]> {
  if (!countryId.trim()) return [];
  const { data, error } = await supabase
    .from("car_catalog_brands")
    .select("*")
    .eq("is_active", true)
    .eq("country_id", countryId)
    .order("sort_order", { ascending: true })
    .order("name_ru", { ascending: true });

  if (error) {
    console.error("[vehicleCatalog] brands", error);
    return [];
  }
  return data ?? [];
}

export async function fetchVehicleCatalogModels(
  brandId: string,
  bodyClassId?: string,
): Promise<VehicleCatalogModel[]> {
  if (!brandId.trim()) return [];

  let q = supabase
    .from("car_catalog_models")
    .select("*")
    .eq("is_active", true)
    .eq("brand_id", brandId);

  const cid = bodyClassId?.trim();
  if (cid) {
    q = q.or(`body_class_id.eq.${cid},body_class_id.is.null`);
  }

  q = q.order("sort_order", { ascending: true }).order("name_ru", { ascending: true });

  const { data, error } = await q;

  if (error) {
    console.error("[vehicleCatalog] models", error);
    return [];
  }
  return data ?? [];
}
