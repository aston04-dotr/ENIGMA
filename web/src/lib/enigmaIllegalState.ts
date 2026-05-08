/**
 * Hard violations of chat/auth/realtime invariants — one JSON line per report (no stack).
 */
export function reportEnigmaIllegalState(
  reason: string,
  detail: Record<string, unknown>,
): void {
  try {
    console.error(
      "[ENIGMA_ILLEGAL_STATE]",
      JSON.stringify({ reason, ...detail }),
    );
  } catch {
    console.error("[ENIGMA_ILLEGAL_STATE]", reason, detail);
  }
}
