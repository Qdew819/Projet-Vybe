"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Avatar from "./Avatar";
import CameraCapture from "./CameraCapture";
import { useT } from "../lib/i18n";
import { AVATAR_ACCEPT, PRESET_AVATARS } from "../lib/avatar";

type View = "menu" | "camera" | "avatars";

// Photo de profil ronde. « Changer la photo » ouvre une fenêtre avec trois choix :
// photothèque, caméra dans l'application, ou avatar prêt à l'emploi.
export default function AvatarPicker({
  src,
  initial,
  busy,
  onPickPhoto,
  onPickPreset,
  onRemove,
  size = 112,
}: {
  src: string | null;
  initial: string;
  busy: boolean;
  size?: number; // diamètre de la photo en pixels
  onPickPhoto: (photo: Blob) => void;
  onPickPreset: (src: string) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("menu");
  const badge = Math.round(size * 0.36); // taille du badge caméra, proportionnelle à la photo

  function open() {
    setView("menu");
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function chooseFromLibrary() {
    close();
    libraryRef.current?.click();
  }

  function takePhoto() {
    // Caméra dans l'application si le navigateur le permet (site sécurisé), sinon l'appareil photo du téléphone
    // (mediaDevices n'existe pas sur une adresse non sécurisée, même si TypeScript le croit toujours présent)
    if (typeof navigator.mediaDevices?.getUserMedia === "function") {
      setView("camera");
    } else {
      close();
      cameraInputRef.current?.click();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // On vide le champ pour pouvoir choisir à nouveau la même photo
    e.target.value = "";
    if (file) onPickPhoto(file);
  }

  const titles: Record<View, string> = {
    menu: t("avatarPicker.title"),
    camera: t("avatarPicker.camera"),
    avatars: t("avatarPicker.avatars"),
  };

  const optionClass =
    "flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left text-base font-bold transition-colors hover:border-accent-ink focus-visible:border-accent-ink focus-visible:outline-none";
  const iconClass = "h-6 w-6 shrink-0 text-accent-ink";

  return (
    <div className="shrink-0">
      {/* Toute la photo est cliquable ; le petit badge caméra en bas à droite montre qu'on peut la changer */}
      <button
        type="button"
        disabled={busy}
        onClick={open}
        aria-haspopup="dialog"
        aria-label={t("settings.avatarChange")}
        title={t("settings.avatarChange")}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink disabled:opacity-60"
      >
        <Avatar src={src} initial={initial} alt={t("settings.avatarAlt")} size={size} />
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-[3px] border-background bg-accent text-on-accent transition-transform group-hover:scale-110"
          style={{ width: badge, height: badge }}
        >
          <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
      </button>
      {/* Annoncé aux lecteurs d'écran pendant la préparation de la photo */}
      <p aria-live="polite" className="sr-only">
        {busy ? t("settings.avatarPreparing") : ""}
      </p>

      {/* Photothèque : choix d'une photo existante */}
      <input ref={libraryRef} type="file" accept={AVATAR_ACCEPT} className="sr-only" tabIndex={-1} onChange={handleFile} />
      {/* Repli quand la caméra dans l'application n'est pas possible : ouvre l'appareil photo du téléphone */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        capture="user"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFile}
      />

      <dialog
        ref={dialogRef}
        aria-labelledby="avatar-dialog-title"
        onClose={() => setView("menu")}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-line bg-background p-6 text-foreground backdrop:bg-black/70"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="avatar-dialog-title" className="text-xl font-black italic tracking-tight">
            {titles[view]}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t("avatarPicker.close")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {view === "menu" && (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={chooseFromLibrary} className={optionClass}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-4.5-4.5L6 21" />
              </svg>
              {t("avatarPicker.library")}
            </button>
            <button type="button" onClick={takePhoto} className={optionClass}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {t("avatarPicker.camera")}
            </button>
            <button type="button" onClick={() => setView("avatars")} className={optionClass}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
              </svg>
              {t("avatarPicker.avatars")}
            </button>
            {src && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onRemove();
                }}
                className="mt-1 w-full rounded-2xl py-3 text-sm font-bold text-danger hover:underline"
              >
                {t("settings.avatarRemove")}
              </button>
            )}
          </div>
        )}

        {/* La caméra n'est allumée que pendant que cette vue est affichée */}
        {view === "camera" && (
          <CameraCapture
            onCapture={(photo) => {
              close();
              onPickPhoto(photo);
            }}
            onCancel={() => setView("menu")}
          />
        )}

        {view === "avatars" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-4 gap-3">
              {PRESET_AVATARS.map((avatar) => {
                const selected = avatar.src === src;
                return (
                  <button
                    key={avatar.src}
                    type="button"
                    aria-label={t(avatar.label)}
                    aria-pressed={selected}
                    title={t(avatar.label)}
                    onClick={() => {
                      close();
                      onPickPreset(avatar.src);
                    }}
                    className={`relative aspect-square overflow-hidden rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                      selected ? "border-accent-ink" : "border-transparent hover:border-line"
                    }`}
                  >
                    <Image src={avatar.src} alt="" fill sizes="80px" unoptimized className="object-cover" />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setView("menu")}
              className="w-full rounded-2xl border border-line py-3 text-sm font-bold"
            >
              {t("common.back")}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
