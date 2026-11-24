"use client";

import { useState } from "react";
import { MIN_AGE } from "../lib/birthDate";
import { useLanguage, useT } from "../lib/i18n";

const OLDEST = 100; // années proposées : de 16 à 100 ans

const selectClass =
  "w-full appearance-none rounded-xl border bg-surface px-3 py-3 text-base text-foreground outline-none focus:border-accent-ink";

function currentYear(): number {
  return new Date().getFullYear();
}

// Date de naissance en trois listes (jour, mois, année). Renvoie « AAAA-MM-JJ » quand les trois sont choisis,
// sinon une chaîne vide. La vérification (date valide, 16 ans et plus) reste à la charge de la page.
export default function BirthDateField({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useT();
  const language = useLanguage();
  const [initialYear, initialMonth, initialDay] = value ? value.split("-") : ["", "", ""];
  const [day, setDay] = useState(initialDay ?? "");
  const [month, setMonth] = useState(initialMonth ?? "");
  const [year, setYear] = useState(initialYear ?? "");

  const latest = currentYear() - MIN_AGE;
  const years = Array.from({ length: OLDEST - MIN_AGE + 1 }, (_, i) => String(latest - i));
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(language === "en" ? "en-CA" : "fr-CA", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, i, 1)))
  );

  function update(next: { day?: string; month?: string; year?: string }) {
    const d = next.day ?? day;
    const m = next.month ?? month;
    const y = next.year ?? year;
    if (next.day !== undefined) setDay(d);
    if (next.month !== undefined) setMonth(m);
    if (next.year !== undefined) setYear(y);
    onChange(d && m && y ? `${y}-${m}-${d}` : "");
  }

  const border = invalid ? "border-danger" : "border-accent-ink/40";
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
      <label className="sr-only" htmlFor={`${id}-jour`}>
        {t("birth.day")}
      </label>
      <select id={`${id}-jour`} value={day} onChange={(e) => update({ day: e.target.value })} aria-invalid={invalid || undefined} className={`${selectClass} ${border}`}>
        <option value="">{t("birth.day")}</option>
        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
          <option key={d} value={d}>
            {Number(d)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${id}-mois`}>
        {t("birth.month")}
      </label>
      <select id={`${id}-mois`} value={month} onChange={(e) => update({ month: e.target.value })} aria-invalid={invalid || undefined} className={`${selectClass} ${border}`}>
        <option value="">{t("birth.month")}</option>
        {monthNames.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, "0")}>
            {name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${id}-annee`}>
        {t("birth.year")}
      </label>
      <select id={`${id}-annee`} value={year} onChange={(e) => update({ year: e.target.value })} aria-invalid={invalid || undefined} className={`${selectClass} ${border}`}>
        <option value="">{t("birth.year")}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
