"use client";

import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { joinEvent, leaveEvent, participationOf, type EventRow, type ParticipantStatus } from "../lib/events";
import { useT, type MessageKey } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";

// Textes de la confirmation de désinscription, selon mon statut
const LEAVE_TEXTS: Record<ParticipantStatus, { title: MessageKey; text: MessageKey; confirm: MessageKey; stay: MessageKey }> = {
  going: { title: "leave.goingTitle", text: "leave.goingText", confirm: "leave.goingConfirm", stay: "leave.goingStay" },
  pending: { title: "leave.pendingTitle", text: "leave.pendingText", confirm: "leave.pendingConfirm", stay: "leave.pendingStay" },
  waitlist: { title: "leave.waitlistTitle", text: "leave.waitlistText", confirm: "leave.waitlistConfirm", stay: "leave.waitlistStay" },
};

export function leaveTexts(status: ParticipantStatus) {
  return LEAVE_TEXTS[status];
}

// Inscription et désinscription depuis les cartes d'événement (accueil et page Événements).
// Garde mes statuts et le nombre d'inscrits de chaque événement ; la page les remplit après son chargement.
// leaveDialog est la fenêtre « Te désinscrire ? » à placer une fois dans la page.
export function useEventParticipation({
  userId,
  onMessage,
  onJoined,
}: {
  userId: string;
  onMessage: (text: string) => void;
  onJoined?: (event: EventRow) => void;
}) {
  const t = useT();
  const [statuses, setStatuses] = useState<Map<string, ParticipantStatus>>(new Map());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<{ event: EventRow; status: ParticipantStatus } | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  async function join(event: EventRow) {
    // L'organisateur n'a pas de bouton d'inscription (sa carte affiche « Organisateur »)
    if (busyId || participationOf(event, userId, null) === "organizer") return;
    const expected: ParticipantStatus = event.join_mode === "approval" ? "pending" : "going";
    const previousStatus = statuses.get(event.id);
    const previousCount = counts.get(event.id) ?? 0;
    setBusyId(event.id);
    // Mise à jour optimiste
    setStatuses((current) => new Map(current).set(event.id, expected));
    if (expected === "going") setCounts((current) => new Map(current).set(event.id, previousCount + 1));
    const result = await joinEvent(createClient(), event.id, userId);
    if (!result.ok) {
      setStatuses((current) => {
        const next = new Map(current);
        if (previousStatus) next.set(event.id, previousStatus);
        else next.delete(event.id);
        return next;
      });
      setCounts((current) => new Map(current).set(event.id, previousCount));
      onMessage(t(result.errorKey));
    } else {
      const { status, count } = result;
      if (status) setStatuses((current) => new Map(current).set(event.id, status));
      if (count !== null) setCounts((current) => new Map(current).set(event.id, count));
      onMessage(t(result.messageKey));
      onJoined?.(event);
    }
    setBusyId(null);
  }

  // Clic sur « Inscrit ✓ », « En attente » ou « Liste d'attente » : on demande confirmation
  function askLeave(event: EventRow) {
    // L'organisateur ne peut pas quitter son propre événement (refusé par la base) : on l'explique
    if (participationOf(event, userId, null) === "organizer") {
      onMessage(t("leave.organizerError"));
      return;
    }
    const status = statuses.get(event.id);
    if (!status) return;
    setLeaveError("");
    setLeaving({ event, status });
  }

  async function confirmLeave() {
    if (!leaving) return;
    const { event, status } = leaving;
    setLeaveBusy(true);
    const result = await leaveEvent(createClient(), event, userId);
    setLeaveBusy(false);
    if (!result.ok) {
      if (result.errorKey === "leave.organizerError") {
        setLeaving(null);
        onMessage(t(result.errorKey));
      } else {
        setLeaveError(t(result.errorKey));
      }
      return;
    }
    setStatuses((current) => {
      const next = new Map(current);
      next.delete(event.id);
      return next;
    });
    setCounts((current) => {
      const before = current.get(event.id) ?? 0;
      const after = result.count ?? (status === "going" ? Math.max(0, before - 1) : before);
      return new Map(current).set(event.id, after);
    });
    setLeaving(null);
    onMessage(t(status === "pending" ? "event.requestCancelled" : "event.left"));
  }

  const texts = leaving ? LEAVE_TEXTS[leaving.status] : LEAVE_TEXTS.going;
  const leaveDialog = (
    <ConfirmDialog
      open={leaving !== null}
      title={t(texts.title)}
      description={t(texts.text).replace("{title}", leaving?.event.title ?? "")}
      confirmLabel={t(texts.confirm)}
      cancelLabel={t(texts.stay)}
      danger
      busy={leaveBusy}
      error={leaveError}
      onConfirm={() => void confirmLeave()}
      onClose={() => {
        if (!leaveBusy) setLeaving(null);
      }}
    />
  );

  return { statuses, setStatuses, counts, setCounts, busyId, join, askLeave, leaveDialog };
}
