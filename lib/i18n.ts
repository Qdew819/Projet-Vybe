"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, getSavedLanguage, subscribeLanguage, type Language } from "./language";

// Tous les textes de l'application, en français (langue de référence)
const fr = {
  "common.loading": "Chargement…",
  "common.back": "Retour",
  "common.continue": "Continuer",
  "common.saving": "Enregistrement…",

  "field.firstName": "Prénom",
  "field.firstNamePlaceholder": "Ton prénom",
  "field.lastName": "Nom de famille",
  "field.lastNamePlaceholder": "Ton nom de famille",
  "field.email": "Courriel",
  "field.emailPlaceholder": "toi@exemple.com",
  "field.password": "Mot de passe",
  "field.passwordPlaceholder": "Ton mot de passe",
  "field.newPasswordPlaceholder": "8 caractères minimum",

  "social.google": "Continuer avec Google",
  "social.apple": "Continuer avec Apple",
  "social.googleError": "Impossible de lancer la connexion avec Google. Réessaie dans un instant.",
  "social.appleSoon": "La connexion avec Apple sera activée plus tard.",
  "social.orEmail": "ou avec ton courriel",

  "welcome.sloganStart": "REGROUPE.",
  "welcome.sloganAccent": "JOUE.",
  "welcome.sloganEnd": "PARTAGE.",
  "welcome.tagline": "La communauté sportive tout-en-un",
  "welcome.friends": "Trouve des amis",
  "welcome.events": "Participe à des événements",
  "welcome.videos": "Regarde des vidéos de sport",
  "welcome.follow": "Suis ton sport",
  "welcome.login": "Se connecter",
  "welcome.signup": "Créer un compte",

  "login.title": "Content de te revoir",
  "login.subtitle": "Connecte-toi pour retrouver ta communauté.",
  "login.submit": "Se connecter",
  "login.loading": "Connexion…",
  "login.errorNotConfirmed": "Confirme d’abord ton adresse : clique sur le lien reçu par courriel.",
  "login.errorInvalid": "Courriel ou mot de passe incorrect.",
  "login.noAccount": "Pas encore de compte?",
  "login.createOne": "Crée-en un",

  "signup.title": "Rejoins Vybe",
  "signup.subtitle": "Crée ton compte et trouve ta prochaine game.",
  "signup.terms":
    "J’ai 16 ans ou plus et j’accepte les conditions d’utilisation et la politique de confidentialité.",
  "signup.submit": "Créer mon compte",
  "signup.loading": "Création en cours…",
  "signup.errorExists": "Un compte existe déjà avec ce courriel. Essaie de te connecter.",
  "signup.errorGeneric":
    "Impossible de créer le compte pour l’instant. Vérifie ton courriel et ton mot de passe, puis réessaie.",
  "signup.checkEmail":
    "Compte créé! Va dans ta boîte courriel et clique sur le lien pour confirmer ton adresse, puis reviens te connecter.",
  "signup.hasAccount": "Déjà un compte?",
  "signup.login": "Connecte-toi",

  "prefs.titleStart": "Tes",
  "prefs.titleAccent": "préférences",
  "prefs.subtitle": "Tu pourras les changer plus tard.",
  "prefs.language": "Langue",
  "prefs.display": "Affichage",
  "prefs.soon": "Bientôt",
  "prefs.languageHint": "Textes en français",
  "prefs.saveError": "Impossible d’enregistrer tes préférences pour l’instant. Réessaie dans un instant.",

  "theme.light": "Clair",
  "theme.lightHint": "Fond pâle",
  "theme.dark": "Sombre",
  "theme.darkHint": "Fond noir",
  "theme.auto": "Auto",
  "theme.autoHint": "Comme ton appareil",

  "profile.titleStart": "Ton",
  "profile.titleAccent": "profil",
  "profile.subtitle": "Quelques infos pour que la communauté apprenne à te connaître.",
  "profile.birthDate": "Date de naissance",
  "profile.birthDateHint": "Elle n’est pas affichée sur ton profil.",
  "profile.bio": "Biographie",
  "profile.bioPlaceholder": "Ton sport, ton niveau, ce que tu cherches…",
  "profile.accountType": "Type de compte",
  "profile.accountQuestion": "Qui peut voir ton profil ?",
  "profile.public": "Public",
  "profile.publicHint": "Tout le monde sur Vybe peut voir tes publications et tes événements.",
  "profile.private": "Privé",
  "profile.privateHint": "Seules les personnes que tu acceptes peuvent voir tes publications et tes événements.",
  "profile.accountNote": "Tu pourras changer ce choix plus tard dans tes paramètres.",
  "profile.errorBirthDate": "Indique une date de naissance valide.",
  "profile.errorTooYoung": "Tu dois avoir 16 ans ou plus pour utiliser Vybe.",
  "profile.saveError": "Impossible d’enregistrer ton profil pour l’instant. Réessaie dans un instant.",

  "home.hello": "Salut",
  "home.subtitle": "Tu es connecté. Les événements arrivent bientôt.",
  "home.signOut": "Se déconnecter",
};

export type MessageKey = keyof typeof fr;
type Messages = Record<MessageKey, string>;

// Même clés en anglais : TypeScript signale toute traduction manquante
const en: Messages = {
  "common.loading": "Loading…",
  "common.back": "Back",
  "common.continue": "Continue",
  "common.saving": "Saving…",

  "field.firstName": "First name",
  "field.firstNamePlaceholder": "Your first name",
  "field.lastName": "Last name",
  "field.lastNamePlaceholder": "Your last name",
  "field.email": "Email",
  "field.emailPlaceholder": "you@example.com",
  "field.password": "Password",
  "field.passwordPlaceholder": "Your password",
  "field.newPasswordPlaceholder": "At least 8 characters",

  "social.google": "Continue with Google",
  "social.apple": "Continue with Apple",
  "social.googleError": "Couldn’t start Google sign-in. Try again in a moment.",
  "social.appleSoon": "Sign in with Apple is coming later.",
  "social.orEmail": "or with your email",

  "welcome.sloganStart": "TEAM UP.",
  "welcome.sloganAccent": "PLAY.",
  "welcome.sloganEnd": "SHARE.",
  "welcome.tagline": "The all-in-one sports community",
  "welcome.friends": "Find friends",
  "welcome.events": "Join events",
  "welcome.videos": "Watch sports videos",
  "welcome.follow": "Follow your sport",
  "welcome.login": "Log in",
  "welcome.signup": "Create an account",

  "login.title": "Good to see you again",
  "login.subtitle": "Log in to get back to your community.",
  "login.submit": "Log in",
  "login.loading": "Logging in…",
  "login.errorNotConfirmed": "Confirm your email first: click the link we sent you.",
  "login.errorInvalid": "Incorrect email or password.",
  "login.noAccount": "No account yet?",
  "login.createOne": "Create one",

  "signup.title": "Join Vybe",
  "signup.subtitle": "Create your account and find your next game.",
  "signup.terms": "I’m 16 or older and I accept the terms of use and the privacy policy.",
  "signup.submit": "Create my account",
  "signup.loading": "Creating account…",
  "signup.errorExists": "An account already exists with this email. Try logging in.",
  "signup.errorGeneric": "Couldn’t create the account right now. Check your email and password, then try again.",
  "signup.checkEmail": "Account created! Check your inbox and click the link to confirm your email, then come back to log in.",
  "signup.hasAccount": "Already have an account?",
  "signup.login": "Log in",

  "prefs.titleStart": "Your",
  "prefs.titleAccent": "preferences",
  "prefs.subtitle": "You can change them later.",
  "prefs.language": "Language",
  "prefs.display": "Display",
  "prefs.soon": "Coming soon",
  "prefs.languageHint": "Texts in English",
  "prefs.saveError": "Couldn’t save your preferences right now. Try again in a moment.",

  "theme.light": "Light",
  "theme.lightHint": "Pale background",
  "theme.dark": "Dark",
  "theme.darkHint": "Black background",
  "theme.auto": "Auto",
  "theme.autoHint": "Matches your device",

  "profile.titleStart": "Your",
  "profile.titleAccent": "profile",
  "profile.subtitle": "A few details so the community can get to know you.",
  "profile.birthDate": "Date of birth",
  "profile.birthDateHint": "It isn’t shown on your profile.",
  "profile.bio": "Bio",
  "profile.bioPlaceholder": "Your sport, your level, what you’re looking for…",
  "profile.accountType": "Account type",
  "profile.accountQuestion": "Who can see your profile?",
  "profile.public": "Public",
  "profile.publicHint": "Everyone on Vybe can see your posts and events.",
  "profile.private": "Private",
  "profile.privateHint": "Only people you accept can see your posts and events.",
  "profile.accountNote": "You can change this later in your settings.",
  "profile.errorBirthDate": "Enter a valid date of birth.",
  "profile.errorTooYoung": "You must be 16 or older to use Vybe.",
  "profile.saveError": "Couldn’t save your profile right now. Try again in a moment.",

  "home.hello": "Hi",
  "home.subtitle": "You’re logged in. Events are coming soon.",
  "home.signOut": "Log out",
};

const dictionaries: Record<Language, Messages> = { fr, en };

export function translate(language: Language, key: MessageKey): string {
  return dictionaries[language][key] ?? fr[key];
}

// Langue actuelle. Le serveur affiche le français, puis le navigateur passe à la langue choisie.
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getSavedLanguage, () => DEFAULT_LANGUAGE);
}

// Donne la fonction t("clé") qui renvoie le texte dans la langue actuelle
export function useT() {
  const language = useLanguage();
  return useCallback((key: MessageKey) => translate(language, key), [language]);
}
