"use client";

/**
 * Global auth breaker — avoids circular imports between supabase.ts and recovery logic.
 */

let circuitOpen = false;
let hardResetInFlight = false;
const faultTimestamps: number[] = [];
const FAULT_WINDOW_MS = 5_000;

export function isAuthCircuitOpen(): boolean {
  return circuitOpen;
}

export function openAuthCircuit(): void {
  circuitOpen = true;
}

export function closeAuthCircuit(): void {
  circuitOpen = false;
}

export function isHardAuthResetInFlight(): boolean {
  return hardResetInFlight;
}

export function setHardAuthResetInFlight(v: boolean): void {
  hardResetInFlight = v;
}

/** Returns true when this fault is the 2+ in the last 5s (rolling window). */
export function recordAuthFaultAndIsRepeat(): boolean {
  const now = Date.now();
  while (faultTimestamps.length > 0 && now - faultTimestamps[0]! > FAULT_WINDOW_MS) {
    faultTimestamps.shift();
  }
  faultTimestamps.push(now);
  return faultTimestamps.length >= 2;
}

export function resetAuthFaultWindow(): void {
  faultTimestamps.length = 0;
}
