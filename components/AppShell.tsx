"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import BottomNav, { type NavTab } from "./BottomNav";
import CreateSheet from "./CreateSheet";

// Ouvre la feuille « Créer » depuis le contenu de la page (ex. raccourci « Publier » de l'accueil)
const OpenCreateSheetContext = createContext<() => void>(() => {});

export function useOpenCreateSheet() {
  return useContext(OpenCreateSheetContext);
}

// Enveloppe des pages à onglets : contenu centré (500 px max) et barre d'onglets en bas.
// Le padding du bas laisse la place à la barre (et à la zone de sécurité des iPhone) : rien n'est caché dessous.
// Le padding horizontal reste à la charge de la page (la bannière du profil va d'un bord à l'autre).
export default function AppShell({ active, children }: { active: NavTab; children: ReactNode }) {
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = useCallback(() => setCreateOpen(true), []);

  return (
    <OpenCreateSheetContext value={openCreate}>
      <main className="bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
      <BottomNav active={active} onCreate={openCreate} createOpen={createOpen} />
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </OpenCreateSheetContext>
  );
}
