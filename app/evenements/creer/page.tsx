"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Combobox, { type ComboboxOption } from "../../../components/Combobox";
import ConfirmDialog from "../../../components/ConfirmDialog";
import LocationPicker from "../../../components/LocationPicker";
import Switch from "../../../components/Switch";
import { cityLabelWithoutCountry, type CityValue } from "../../../lib/cities";
import {
  EVENT_ADDRESS_MAX,
  EVENT_CAPACITY_DEFAULT,
  EVENT_CAPACITY_MAX,
  EVENT_CAPACITY_MIN,
  EVENT_COVER_ACCEPT,
  EVENT_COVER_MAX_INPUT_BYTES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
  EVENT_TITLE_MIN,
  EVENT_VENUE_MAX,
  EVENT_VENUE_MIN,
  combineDateTime,
  compressEventCover,
  eventSaveErrorKey,
  isAcceptedEventCover,
  todayInputValue,
  uploadEventCover,
  type EventMinAge,
} from "../../../lib/events";
import { useT, type MessageKey } from "../../../lib/i18n";
import { normalizeSearch } from "../../../lib/sports";
import { createClient } from "../../../lib/supabase/client";
import {
  LEVEL_LABEL,
  SPORT_LEVELS,
  isLevel,
  loadMySports,
  useSportsCatalog,
  type CatalogSport,
  type SportLevel,
} from "../../../lib/userSports";

type Field = "name" | "sport" | "date" | "venue" | "capacity" | "city";
type Errors = Partial<Record<Field, MessageKey>>;

// Champ à mettre en avant (focus) pour chaque erreur, dans l'ordre du formulaire
const FIELD_TARGET: Record<Field, string> = {
  name: "nom",
  sport: "sport-groupe",
  date: "date",
  venue: "lieu",
  capacity: "places",
  city: "ville-input", // champ de recherche du LocationPicker (Combobox id="ville")
};
const FIELD_ORDER: Field[] = ["name", "sport", "date", "venue", "capacity", "city"];

// Pastilles proposées quand la personne n'a pas encore de sports dans son profil (comme la maquette)
const DEFAULT_CHIP_SLUGS = ["hockey", "basketball", "soccer"];
const MAX_CHIPS = 3;
const SPORT_SEARCH_RESULTS = 8;

const fieldClass =
  "w-full rounded-xl border bg-surface px-4 py-3 text-base text-foreground placeholder:text-subtle outline-none focus:border-accent-ink disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-bold";

const iconProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export default function CreerEvenement() {
  const router = useRouter();
  const t = useT();
  const { state: catalogState, retry: retryCatalog } = useSportsCatalog();

  const [userId, setUserId] = useState("");
  const [ready, setReady] = useState(false);
  const [mySportIds, setMySportIds] = useState<number[]>([]);

  // Formulaire
  const [name, setName] = useState("");
  const [sportSlug, setSportSlug] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState("");
  const [capacity, setCapacity] = useState<number | null>(EVENT_CAPACITY_DEFAULT); // null = illimité
  const [capacityText, setCapacityText] = useState(String(EVENT_CAPACITY_DEFAULT));
  const [level, setLevel] = useState<SportLevel | null>(null); // null = tous les niveaux
  const [description, setDescription] = useState("");
  const [openToAll, setOpenToAll] = useState(true); // visibility
  const [approval, setApproval] = useState(false); // join_mode
  const [notify, setNotify] = useState(true); // notify_on_join
  const [address, setAddress] = useState("");
  const [city, setCity] = useState<CityValue | null>(null);
  const [minAge, setMinAge] = useState<EventMinAge>(16);

  // Photo de couverture (déjà compressée)
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");

  // Recherche « Autres » sports
  const [searchOpen, setSearchOpen] = useState(false);
  const [sportQuery, setSportQuery] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Flèche en haut à gauche : confirmation avant d'abandonner l'événement en cours
  const [discardOpen, setDiscardOpen] = useState(false);

  // Connexion, sports du profil et ville du profil (pour préremplir)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/connexion");
        return;
      }
      const uid = data.user.id;
      setUserId(uid);

      const [sportsResult, locationResult] = await Promise.all([
        loadMySports(supabase, uid).then(
          (choices) => ({ data: choices, error: null }),
          (err: unknown) => ({ data: null, error: err })
        ),
        supabase.from("user_locations").select("city_id").eq("user_id", uid).maybeSingle(),
      ]);

      if (sportsResult.error || !sportsResult.data) {
        console.error("Lecture des sports impossible :", sportsResult.error);
      } else {
        setMySportIds(sportsResult.data.map((choice) => choice.sportId));
      }

      if (locationResult.error) {
        console.error(`Lecture de la ville impossible : ${locationResult.error.message} (code ${locationResult.error.code})`);
      } else if (typeof locationResult.data?.city_id === "number") {
        const { data: cityRow, error: cityError } = await supabase
          .from("cities")
          .select("label, country_code")
          .eq("id", locationResult.data.city_id)
          .maybeSingle();
        if (cityError) {
          console.error(`Lecture de la ville impossible : ${cityError.message} (code ${cityError.code})`);
        } else if (cityRow) {
          setCity({
            cityId: locationResult.data.city_id,
            label: String(cityRow.label),
            countryCode: String(cityRow.country_code),
          });
        }
      }
      // Le sélecteur de ville est affiché seulement maintenant : il part du pays de la ville du profil
      setReady(true);
    });
  }, [router]);

  // Libère l'aperçu de la photo quand il change ou quand on quitte la page
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const catalog = useMemo(() => (catalogState.status === "ready" ? catalogState.sports : []), [catalogState]);

  // Pastilles : mes sports (3 premiers), sinon Hockey, Basketball, Soccer ; le sport choisi est toujours visible
  const chips = useMemo(() => {
    const byId = new Map(catalog.map((sport) => [sport.id, sport]));
    const bySlug = new Map(catalog.map((sport) => [sport.slug, sport]));
    const mine = mySportIds.flatMap((id) => byId.get(id) ?? []);
    const base = (mine.length > 0 ? mine : DEFAULT_CHIP_SLUGS.flatMap((slug) => bySlug.get(slug) ?? [])).slice(0, MAX_CHIPS);
    const chosen = sportSlug ? bySlug.get(sportSlug) : undefined;
    return chosen && !base.some((sport) => sport.slug === chosen.slug) ? [chosen, ...base] : base;
  }, [catalog, mySportIds, sportSlug]);

  const sportOptions: ComboboxOption[] = useMemo(() => {
    const query = normalizeSearch(sportQuery);
    if (!query) return [];
    return catalog
      .filter((sport) => sport.search.includes(query))
      .slice(0, SPORT_SEARCH_RESULTS)
      .map((sport) => ({ id: sport.slug, label: `${sport.emoji} ${sport.name}` }));
  }, [catalog, sportQuery]);

  function clearError(field: Field) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError("");
  }

  function chooseSport(sport: CatalogSport | string) {
    setSportSlug(typeof sport === "string" ? sport : sport.slug);
    setSearchOpen(false);
    setSportQuery("");
    clearError("sport");
  }

  function setCapacityValue(value: number) {
    const clamped = Math.min(EVENT_CAPACITY_MAX, Math.max(EVENT_CAPACITY_MIN, value));
    setCapacity(clamped);
    setCapacityText(String(clamped));
    clearError("capacity");
  }

  async function pickCover(file: File | undefined) {
    if (!file) return;
    setCoverError("");
    setFormError("");
    if (!isAcceptedEventCover(file) || file.size > EVENT_COVER_MAX_INPUT_BYTES) {
      setCoverError(t("eventForm.photoTypeError"));
      return;
    }
    setCoverBusy(true);
    try {
      const blob = await compressEventCover(file);
      setCover(blob);
      setCoverPreview(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Préparation de la photo impossible :", err);
      setCoverError(t("eventForm.photoProcessError"));
    } finally {
      setCoverBusy(false);
    }
  }

  function removeCover() {
    setCover(null);
    setCoverPreview(null);
    setCoverError("");
  }

  function validate(): { errors: Errors; startsAt: Date | null } {
    const found: Errors = {};
    const title = name.trim();
    if (title.length < EVENT_TITLE_MIN || title.length > EVENT_TITLE_MAX) found.name = "eventForm.errorName";
    if (!sportSlug) found.sport = "eventForm.errorSport";
    const startsAt = combineDateTime(date, time);
    if (!startsAt) found.date = "eventForm.errorDate";
    else if (startsAt.getTime() <= Date.now()) found.date = "eventForm.errorPast";
    const place = venue.trim();
    if (place.length < EVENT_VENUE_MIN || place.length > EVENT_VENUE_MAX) found.venue = "eventForm.errorVenue";
    if (capacity !== null && (capacity < EVENT_CAPACITY_MIN || capacity > EVENT_CAPACITY_MAX)) {
      found.capacity = "eventForm.errorCapacity";
    }
    if (!city) found.city = "eventForm.errorCity";
    return { errors: found, startsAt };
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || coverBusy || !userId) return;

    const { errors: found, startsAt } = validate();
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first || !startsAt || !city || !sportSlug) {
      setFormError(t("eventForm.errorFix"));
      if (first) document.getElementById(FIELD_TARGET[first])?.focus();
      return;
    }

    setSubmitting(true);
    setFormError("");
    const supabase = createClient();

    let coverUrl: string | null = null;
    if (cover) {
      try {
        coverUrl = await uploadEventCover(supabase, userId, cover);
      } catch (err) {
        console.error("Envoi de la photo impossible :", err);
        setFormError(t("eventForm.errorCover"));
        setSubmitting(false);
        return;
      }
    }

    const countryCode = city.countryCode ?? "";
    const { data: created, error } = await supabase
      .from("events")
      .insert({
        organizer_id: userId,
        title: name.trim(),
        description: description.trim() || null,
        sport: sportSlug,
        starts_at: startsAt.toISOString(),
        venue_name: venue.trim(),
        city: cityLabelWithoutCountry(city.label, countryCode),
        country: countryCode || null,
        capacity,
        min_age: minAge,
        join_mode: approval ? "approval" : "open",
        visibility: openToAll ? "public" : "followers",
        cover_url: coverUrl,
        level,
        notify_on_join: notify,
      })
      .select("id")
      .single();

    if (error || !created) {
      if (error) {
        console.error(
          `Création de l'événement impossible : ${error.message} (code ${error.code})` +
            (error.details ? ` — ${error.details}` : "") +
            (error.hint ? ` — ${error.hint}` : "")
        );
      }
      const key = error ? eventSaveErrorKey(error) : "eventForm.errorGeneric";
      if (key === "eventForm.errorPast") {
        setErrors({ date: key });
        document.getElementById(FIELD_TARGET.date)?.focus();
      }
      setFormError(t(key));
      setSubmitting(false);
      return;
    }

    // Adresse exacte (privée) dans sa propre table. L'événement existe déjà : un échec ne le bloque pas,
    // la page de l'événement l'annonce (sinon un nouvel essai créerait un doublon).
    let addressSaved = true;
    const exact = address.trim();
    if (exact) {
      const { error: addressError } = await supabase.from("event_locations").insert({ event_id: created.id, address: exact });
      if (addressError) {
        addressSaved = false;
        console.error(`Enregistrement de l'adresse impossible : ${addressError.message} (code ${addressError.code})`);
      }
    }

    router.push(`/evenements/${created.id}?cree=${addressSaved ? "1" : "sans-adresse"}`);
  }

  if (!ready) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">{t("common.loading")}</main>
    );
  }

  const today = todayInputValue();
  const descriptionId = "description-compte";

  return (
    <main className="bg-background text-foreground">
      <form noValidate onSubmit={submit} className="mx-auto flex min-h-dvh w-full max-w-[500px] flex-col px-4 pb-10 pt-4">
        {/* En-tête : retour à gauche, titre centré */}
        <header className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center">
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            disabled={submitting}
            aria-haspopup="dialog"
            aria-label={t("eventForm.discard")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h1 className="text-center text-lg font-bold">{t("eventForm.title")}</h1>
        </header>

        {/* Photo de couverture */}
        <div className="mt-5">
          <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-accent-ink/50 bg-surface">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), pas d'optimisation possible
              <img src={coverPreview} alt="" className="aspect-video w-full object-cover" />
            ) : (
              <div aria-hidden="true" className="aspect-video w-full bg-[url('/accueil-vybe.jpg')] bg-cover bg-center opacity-25" />
            )}
            <label
              htmlFor="couverture"
              className={`absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 text-center focus-within:outline-2 focus-within:-outline-offset-4 focus-within:outline-accent-ink ${
                coverPreview ? "bg-black/0 hover:bg-black/30" : ""
              }`}
            >
              <input
                id="couverture"
                type="file"
                accept={EVENT_COVER_ACCEPT}
                disabled={coverBusy || submitting}
                onChange={(e) => {
                  void pickCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="sr-only"
              />
              {coverPreview ? (
                <span className="sr-only">{t("eventForm.changePhoto")}</span>
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-background/70 text-foreground">
                    <svg {...iconProps} className="h-6 w-6" strokeWidth={2}>
                      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  </span>
                  <span className="text-sm font-bold">{coverBusy ? t("eventForm.photoPreparing") : t("eventForm.addPhoto")}</span>
                  <span className="text-xs text-muted">{t("eventForm.photoOptional")}</span>
                </>
              )}
            </label>
            {coverPreview && (
              <button
                type="button"
                onClick={removeCover}
                disabled={submitting}
                aria-label={t("eventForm.removePhoto")}
                className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white"
              >
                <svg {...iconProps} className="h-5 w-5" strokeWidth={2.5}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
          <p aria-live="polite" className="mt-1.5 text-xs text-danger">
            {coverError}
          </p>
        </div>

        {/* Nom */}
        <div className="mt-3">
          <label htmlFor="nom" className={labelClass}>
            {t("eventForm.name")} <Required label={t("eventForm.required")} />
          </label>
          <input
            id="nom"
            type="text"
            maxLength={EVENT_TITLE_MAX}
            placeholder={t("eventForm.namePlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError("name");
            }}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "nom-erreur" : undefined}
            className={`${fieldClass} ${errors.name ? "border-danger" : "border-accent-ink/40"}`}
          />
          <FieldError id="nom-erreur" message={errors.name && t(errors.name)} />
        </div>

        {/* Sport : pastilles + « Autres » */}
        <fieldset className="mt-5" aria-describedby={errors.sport ? "sport-erreur" : undefined}>
          <legend className={labelClass}>
            {t("eventForm.sport")} <Required label={t("eventForm.required")} />
          </legend>
          {catalogState.status === "error" ? (
            <p className="flex items-center gap-3 text-sm text-danger">
              {t("eventForm.sportsError")}
              <button type="button" onClick={retryCatalog} className="font-bold text-accent-ink underline">
                {t("eventForm.retry")}
              </button>
            </p>
          ) : (
            <div id="sport-groupe" tabIndex={-1} className="-mx-4 overflow-x-auto px-4 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ul className="flex w-max gap-2 py-0.5">
                {catalogState.status === "loading"
                  ? [0, 1, 2, 3].map((n) => (
                      <li key={n} aria-hidden="true" className="h-11 w-28 animate-pulse rounded-full bg-surface" />
                    ))
                  : chips.map((sport) => (
                      <li key={sport.slug}>
                        <Chip selected={sport.slug === sportSlug} onClick={() => chooseSport(sport)}>
                          <span aria-hidden="true">{sport.emoji}</span>
                          {sport.name}
                        </Chip>
                      </li>
                    ))}
                {catalogState.status === "ready" && (
                  <li>
                    <Chip selected={searchOpen} onClick={() => setSearchOpen((open) => !open)} expanded={searchOpen}>
                      <span aria-hidden="true" className="tracking-tighter">
                        •••
                      </span>
                      {t("eventForm.otherSports")}
                    </Chip>
                  </li>
                )}
              </ul>
            </div>
          )}
          {searchOpen && (
            <div className="mt-3">
              <Combobox
                id="sport-recherche"
                label={t("eventForm.sportSearch")}
                placeholder={t("eventForm.sportSearchPlaceholder")}
                inputValue={sportQuery}
                onInputChange={setSportQuery}
                options={sportOptions}
                selected={null}
                onSelect={(option) => chooseSport(option.id)}
                onClear={() => setSportQuery("")}
                status={sportQuery.trim() ? "ready" : "idle"}
                emptyMessage={t("eventForm.noSport")}
              />
            </div>
          )}
          <FieldError id="sport-erreur" message={errors.sport && t(errors.sport)} />
        </fieldset>

        {/* Date et heure | Lieu */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <fieldset aria-describedby={errors.date ? "date-erreur" : undefined}>
            <legend className={labelClass}>
              {t("eventForm.dateTime")} <Required label={t("eventForm.required")} />
            </legend>
            <div className="flex flex-col gap-2">
              <label htmlFor="date" className="sr-only">
                {t("eventForm.date")}
              </label>
              <input
                id="date"
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  clearError("date");
                }}
                aria-invalid={errors.date ? true : undefined}
                className={`${fieldClass} px-3 text-sm ${errors.date ? "border-danger" : "border-accent-ink/40"}`}
              />
              <label htmlFor="heure" className="sr-only">
                {t("eventForm.time")}
              </label>
              <input
                id="heure"
                type="time"
                step={300}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  clearError("date");
                }}
                aria-invalid={errors.date ? true : undefined}
                className={`${fieldClass} px-3 text-sm ${errors.date ? "border-danger" : "border-accent-ink/40"}`}
              />
            </div>
            <FieldError id="date-erreur" message={errors.date && t(errors.date)} />
          </fieldset>

          <div>
            <label htmlFor="lieu" className={labelClass}>
              {t("eventForm.venue")} <Required label={t("eventForm.required")} />
            </label>
            <div className="relative">
              <svg {...iconProps} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-ink" strokeWidth={2.2}>
                <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <input
                id="lieu"
                type="text"
                maxLength={EVENT_VENUE_MAX}
                placeholder={t("eventForm.venuePlaceholder")}
                value={venue}
                onChange={(e) => {
                  setVenue(e.target.value);
                  clearError("venue");
                }}
                aria-invalid={errors.venue ? true : undefined}
                aria-describedby={errors.venue ? "lieu-erreur" : undefined}
                className={`${fieldClass} pl-9 text-sm ${errors.venue ? "border-danger" : "border-accent-ink/40"}`}
              />
            </div>
            <FieldError id="lieu-erreur" message={errors.venue && t(errors.venue)} />
          </div>
        </div>

        {/* Nombre de participants | Niveau de jeu */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="places" className={labelClass}>
              {t("eventForm.participants")}
            </label>
            <div className="flex items-center gap-1.5">
              <StepButton
                label={t("eventForm.decrease")}
                disabled={capacity === null || capacity <= EVENT_CAPACITY_MIN}
                onClick={() => capacity !== null && setCapacityValue(capacity - 1)}
              >
                <path d="M5 12h14" />
              </StepButton>
              <input
                id="places"
                type="text"
                inputMode="numeric"
                disabled={capacity === null}
                value={capacity === null ? "∞" : capacityText}
                onChange={(e) => {
                  const text = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setCapacityText(text);
                  setCapacity(text ? Number(text) : EVENT_CAPACITY_MIN - 1);
                  clearError("capacity");
                }}
                onBlur={() => capacity !== null && capacity >= EVENT_CAPACITY_MIN && setCapacityValue(capacity)}
                aria-invalid={errors.capacity ? true : undefined}
                aria-describedby={errors.capacity ? "places-erreur" : undefined}
                className={`${fieldClass} min-w-0 px-1 text-center font-bold ${errors.capacity ? "border-danger" : "border-accent-ink/40"}`}
              />
              <StepButton
                label={t("eventForm.increase")}
                disabled={capacity === null || capacity >= EVENT_CAPACITY_MAX}
                onClick={() => capacity !== null && setCapacityValue(capacity + 1)}
              >
                <path d="M12 5v14M5 12h14" />
              </StepButton>
            </div>
            <button
              type="button"
              aria-pressed={capacity === null}
              onClick={() => {
                if (capacity === null) setCapacityValue(EVENT_CAPACITY_DEFAULT);
                else {
                  setCapacity(null);
                  clearError("capacity");
                }
              }}
              className={`mt-2 min-h-9 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                capacity === null ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:border-accent-ink"
              }`}
            >
              {t("eventForm.unlimited")}
            </button>
            <FieldError id="places-erreur" message={errors.capacity && t(errors.capacity)} />
          </div>

          <div>
            <label htmlFor="niveau" className={labelClass}>
              {t("eventForm.level")}
            </label>
            <div className="relative">
              <select
                id="niveau"
                value={level ?? ""}
                onChange={(e) => setLevel(isLevel(e.target.value) ? e.target.value : null)}
                className={`${fieldClass} appearance-none border-accent-ink/40 py-[0.6875rem] pr-9 text-sm`}
              >
                <option value="">{t("eventForm.allLevels")}</option>
                {SPORT_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {t(LEVEL_LABEL[value])}
                  </option>
                ))}
              </select>
              <svg {...iconProps} className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={2.5}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <label htmlFor="description" className={labelClass}>
            {t("eventForm.description")}
          </label>
          <textarea
            id="description"
            rows={4}
            maxLength={EVENT_DESCRIPTION_MAX}
            placeholder={t("eventForm.descriptionPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-describedby={descriptionId}
            className={`${fieldClass} resize-none border-accent-ink/40 text-sm`}
          />
          <p id={descriptionId} className="mt-1 text-right text-xs text-muted">
            {description.length}/{EVENT_DESCRIPTION_MAX}
          </p>
        </div>

        {/* Options supplémentaires */}
        <section aria-labelledby="titre-options" className="mt-4">
          <h2 id="titre-options" className={labelClass}>
            {t("eventForm.options")}
          </h2>
          <div className="flex flex-col gap-2">
            <Switch
              id="ouvert-a-tous"
              label={t("eventForm.openToAll")}
              hint={openToAll ? t("eventForm.openToAllOn") : t("eventForm.openToAllOff")}
              checked={openToAll}
              onChange={setOpenToAll}
            />
            <Switch
              id="sur-invitation"
              label={t("eventForm.private")}
              hint={approval ? t("eventForm.privateOn") : t("eventForm.privateOff")}
              checked={approval}
              onChange={setApproval}
            />
            <Switch id="prevenir" label={t("eventForm.notify")} hint={t("eventForm.notifyHint")} checked={notify} onChange={setNotify} />
          </div>
        </section>

        {/* Autres détails (absents de la maquette) : adresse privée, ville et pays, âge minimum */}
        <section aria-labelledby="titre-details" className="mt-6">
          <h2 id="titre-details" className={labelClass}>
            {t("eventForm.details")}
          </h2>

          <div className="flex flex-col gap-5 rounded-2xl border border-line p-4">
            <div>
              <label htmlFor="adresse" className={labelClass}>
                {t("eventForm.address")}
              </label>
              <input
                id="adresse"
                type="text"
                maxLength={EVENT_ADDRESS_MAX}
                autoComplete="street-address"
                placeholder={t("eventForm.addressPlaceholder")}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-describedby="adresse-aide"
                className={`${fieldClass} border-accent-ink/40 text-sm`}
              />
              <p id="adresse-aide" className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <svg {...iconProps} className="h-3.5 w-3.5 shrink-0 text-accent-ink" strokeWidth={2.2}>
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                {t("eventForm.addressHint")}
              </p>
            </div>

            <div>
              <p className={labelClass}>
                {t("eventForm.location")} <Required label={t("eventForm.required")} />
              </p>
              <LocationPicker
                value={city}
                onChange={(value) => {
                  setCity(value);
                  clearError("city");
                }}
              />
              <FieldError id="ville-erreur" message={errors.city && t(errors.city)} />
            </div>

            <fieldset>
              <legend className={labelClass}>{t("eventForm.minAge")}</legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {([16, 18] as const).map((age) => (
                  <button
                    key={age}
                    type="button"
                    role="radio"
                    aria-checked={minAge === age}
                    onClick={() => setMinAge(age)}
                    className={`min-h-11 rounded-xl border-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                      minAge === age ? "border-accent bg-accent text-on-accent" : "border-line hover:border-accent-ink"
                    }`}
                  >
                    {age === 16 ? t("eventForm.age16") : t("eventForm.age18")}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <p aria-live="polite" className="mt-5 min-h-5 text-sm text-danger">
          {formError}
        </p>

        <button
          type="submit"
          disabled={submitting || coverBusy}
          aria-busy={submitting}
          className="mt-2 w-full rounded-2xl bg-accent py-4 text-base font-bold text-on-accent shadow-[0_0_22px_rgba(57,255,20,0.35)] disabled:opacity-60"
        >
          {submitting ? t("eventForm.submitting") : t("eventForm.submit")}
        </button>

        <ConfirmDialog
          open={discardOpen}
          title={t("eventForm.discardTitle")}
          description={t("eventForm.discardText")}
          confirmLabel={t("eventForm.discardConfirm")}
          danger
          onConfirm={() => {
            setDiscardOpen(false);
            router.push("/evenements");
          }}
          onClose={() => setDiscardOpen(false)}
        />
      </form>
    </main>
  );
}

function Required({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="text-accent-ink">
        *
      </span>
      <span className="sr-only">({label})</span>
    </>
  );
}

function FieldError({ id, message }: { id: string; message?: string | false }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-danger">
      {message}
    </p>
  );
}

// Pastille de sport (ronde, contour vert quand elle est choisie, comme la maquette)
function Chip({
  selected,
  onClick,
  expanded,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={expanded === undefined ? selected : undefined}
      aria-expanded={expanded}
      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
        selected ? "border-accent-ink bg-accent-ink/10 text-accent-ink" : "border-line bg-surface hover:border-accent-ink"
      }`}
    >
      {selected && expanded === undefined && (
        <svg {...iconProps} className="h-4 w-4" strokeWidth={3}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {children}
    </button>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-accent-ink transition-colors hover:border-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-40"
    >
      <svg {...iconProps} className="h-5 w-5" strokeWidth={2.6}>
        {children}
      </svg>
    </button>
  );
}
