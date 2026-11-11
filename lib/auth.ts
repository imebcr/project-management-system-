/**
 * Règles de mot de passe affichées à l'écran. Le hachage (Argon2) et la vérification
 * se font côté serveur ; ces règles sont aussi appliquées par le backend.
 */

export const INVITE_TTL_DAYS = 7;

export const passwordRules: { label: string; test: (p: string) => boolean }[] = [
  { label: '6 caractères minimum', test: (p) => p.length >= 6 },
];

export function isStrongPassword(p: string) {
  return passwordRules.every((r) => r.test(p));
}

export function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
