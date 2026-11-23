"use client";

import AppShell from "../../components/AppShell";
import { useT } from "../../lib/i18n";

// Page provisoire : elle sera remplacée par la vraie liste des événements
export default function Evenements() {
  const t = useT();
  return (
    <AppShell active="evenements">
      <div className="flex flex-1 flex-col px-6 pt-8">
        <h1 className="text-3xl font-black italic tracking-tight">{t("events.title")}</h1>
        <p className="mt-3 text-muted">{t("events.soon")}</p>
      </div>
    </AppShell>
  );
}
