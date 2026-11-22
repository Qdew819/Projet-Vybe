"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { AVATAR_SIZE } from "../lib/avatar";

type Status = "starting" | "ready" | "denied" | "error";

// Caméra de l'appareil dans l'application : aperçu en direct (comme un miroir) puis prise de la photo
export default function CameraCapture({
  onCapture,
  onCancel,
}: {
  onCapture: (photo: Blob) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setStatus("ready");
      })
      .catch((err: unknown) => {
        console.error("Caméra indisponible :", err);
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      });

    // On éteint la caméra dès qu'on quitte cette vue
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Même sens que l'aperçu (effet miroir), carré pris au centre
    context.translate(AVATAR_SIZE, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.85);
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative aspect-square w-full max-w-72 overflow-hidden rounded-full border-2 border-accent-ink bg-surface">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label={t("camera.preview")}
          className={`h-full w-full -scale-x-100 object-cover ${status === "ready" ? "" : "invisible"}`}
        />
        {status !== "ready" && (
          <p
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted"
          >
            {status === "starting" && t("camera.starting")}
            {status === "denied" && t("camera.denied")}
            {status === "error" && t("camera.error")}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={capture}
          disabled={status !== "ready"}
          className="w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent disabled:opacity-60"
        >
          {t("camera.take")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-2xl border border-line py-3 text-sm font-bold"
        >
          {t("common.back")}
        </button>
      </div>
    </div>
  );
}
