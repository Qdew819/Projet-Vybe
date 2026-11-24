"use client";

import { useLayoutEffect, type RefObject } from "react";

// Ferme une fenêtre <dialog> ouverte avec showModal() quand son composant disparaît (caché ou démonté).
//
// Pourquoi : Next 16 (cacheComponents) ne démonte plus la page qu'on quitte, il la cache avec <Activity>
// (display: none). Un <dialog> modal resté ouvert reste alors dans la « couche du dessus » du navigateur, invisible,
// et rend TOUT le reste du document inerte : la nouvelle page s'affiche mais ne répond plus aux clics.
// C'est ce qui arrivait en choisissant « Publication » ou « Événement » dans la feuille « + » : le lien change de
// page sans fermer la feuille.
//
// Quand Activity cache le composant (ou quand il est démonté), React lance le nettoyage des effets : on y ferme
// la fenêtre. useLayoutEffect : le nettoyage a lieu avant que la page soit cachée.
export function useCloseDialogOnHide(ref: RefObject<HTMLDialogElement | null>) {
  useLayoutEffect(() => {
    return () => {
      // Lecture volontaire au moment du nettoyage : c'est la fenêtre affichée à cet instant qu'il faut fermer
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const dialog = ref.current;
      if (dialog?.open) dialog.close();
    };
  }, [ref]);
}
