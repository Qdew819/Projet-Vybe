"use client";

import Image from "next/image";
import Link from "next/link";
import LanguageToggle from "../components/LanguageToggle";
import { useT, type MessageKey } from "../lib/i18n";

const features: { label: MessageKey; icon: React.ReactNode }[] = [
  {
    label: "welcome.friends",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M17 14.5c3 0 5 1.5 5 4.5" />
      </>
    ),
  },
  {
    label: "welcome.events",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    label: "welcome.videos",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5l6 3.5-6 3.5z" />
      </>
    ),
  },
  {
    label: "welcome.follow",
    icon: (
      <>
        <path d="M8 4h8v6a4 4 0 0 1-8 0V4z" />
        <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 14v4M8 21h8" />
      </>
    ),
  },
];

export default function Welcome() {
  const t = useT();
  return (
    <main className="bg-black text-white">
      <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-hidden">
        {/* Image de fond avec le logo VYBE */}
        <Image src="/accueil-vybe.jpg" alt="VYBE" fill priority sizes="448px" className="object-cover object-center" />

        {/* Voile sombre en bas pour garder les boutons lisibles */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 70%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        {/* Choix de la langue avant d'avoir un compte */}
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle tone="dark" />
        </div>

        <div className="relative z-10 flex min-h-dvh flex-col items-center px-6 pb-10 pt-[39dvh]">
          <p className="text-center text-sm font-bold tracking-wide">
            {t("welcome.sloganStart")} <span className="text-[#39ff14]">{t("welcome.sloganAccent")}</span> {t("welcome.sloganEnd")}
          </p>
          <p className="mt-1 text-center text-xs text-neutral-300">{t("welcome.tagline")}</p>

          <ul className="mt-6 grid w-full grid-cols-4 gap-2">
            {features.map((f) => (
              <li
                key={f.label}
                className="flex flex-col items-center gap-2 rounded-xl border border-[#39ff14]/70 bg-black/50 px-1 py-3 text-center text-[11px] leading-tight text-neutral-200 backdrop-blur-sm"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-8 w-8 text-[#39ff14]"
                >
                  {f.icon}
                </svg>
                {t(f.label)}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex w-full flex-col gap-3 pt-10">
            <Link href="/connexion" className="rounded-2xl bg-[#39ff14] py-4 text-center text-base font-bold text-black">
              {t("welcome.login")}
            </Link>
            <Link
              href="/inscription"
              className="rounded-2xl border border-[#39ff14] bg-black/40 py-4 text-center text-base font-bold text-[#39ff14] backdrop-blur-sm"
            >
              {t("welcome.signup")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}