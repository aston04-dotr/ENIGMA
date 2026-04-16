import { redirect } from "next/navigation";

/** Fallback if middleware не отработал: никогда не отдаём 404 на legacy URL. */
export const dynamic = "force-dynamic";

export default function LegacyProfileSetupRedirect() {
  redirect("/");
}
