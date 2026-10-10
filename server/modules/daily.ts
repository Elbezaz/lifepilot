// Orchestration : météo du jour (avec cache de secours) → recommandation → notification planifiée.
import { storage } from "../storage";
import { getForecast, WeatherError, type DayForecast, type FetchLike } from "./weather";
import { recommend } from "./outfit";
import { sendNtfy } from "./notify";
import { dueNow, localParts } from "./time";
import { logger } from "../logger";

const FRESH_MS = 30 * 60 * 1000; // au-delà : on redemande à Open-Meteo
const STALE_MAX_MS = 3 * 60 * 60 * 1000; // secours : cache accepté jusqu'à 3 h
export const FALLBACK_AFTER_MIN = 120; // après 2 h d'échec météo : message de repli

export interface ForecastResult { forecast: DayForecast; source: "live" | "cache"; warning?: string }

export async function todayForecast(fetchImpl?: FetchLike, now = new Date()): Promise<ForecastResult> {
  const s = storage.getSettings();
  if (s.latitude == null || s.longitude == null) throw new WeatherError("not_found", "Aucune ville choisie");
  const day = localParts(now, s.timezone).day;
  const key = `${s.latitude},${s.longitude},${day}`;
  const cached = storage.getWeather(key);
  const age = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;
  if (cached && age < FRESH_MS) return { forecast: JSON.parse(cached.json), source: "cache" };
  try {
    const f = { ...(await getForecast(s.latitude, s.longitude, day, fetchImpl)), fetchedAt: now.toISOString() };
    storage.putWeather(key, JSON.stringify(f), f.fetchedAt);
    return { forecast: f, source: "live" };
  } catch (e: any) {
    if (cached && age < STALE_MAX_MS) {
      logger.warn("weather", `panne Open-Meteo, utilisation du cache (${Math.round(age / 60000)} min)`);
      return { forecast: JSON.parse(cached.json), source: "cache", warning: `Service météo indisponible : données de ${new Date(cached.fetchedAt).toLocaleTimeString("fr-FR", { timeZone: s.timezone, hour: "2-digit", minute: "2-digit" })} affichées.` };
    }
    throw e;
  }
}

// Adresse de l'app pour le lien de la notification : APP_URL, sinon l'origine HTTPS vue lors de la dernière visite.
let seenOrigin: string | undefined;
export function rememberOrigin(origin?: string) {
  if (origin && /^https:\/\/[a-z0-9.-]+$/i.test(origin)) seenOrigin = origin;
}
export function appUrl() {
  return process.env.APP_URL || seenOrigin || undefined;
}

export type TickResult =
  | { action: "skip"; reason: string; local?: string }
  | { action: "sent" | "fallback"; day: string; local: string }
  | { action: "waiting" | "failed"; reason: string; day: string };

/** Appelé chaque minute (interne) et toutes les 10 min (GitHub Actions). Idempotent. */
export async function tick(now = new Date(), fetchImpl?: FetchLike, sendImpl = sendNtfy): Promise<TickResult> {
  const s = storage.getSettings();
  if (!s.notifyEnabled) return { action: "skip", reason: "notifications désactivées" };
  if (!s.city) return { action: "skip", reason: "aucune ville" };
  const d = dueNow(now, s.timezone, s.notifyTime);
  if (!d.due) return { action: "skip", reason: "pas l'heure", local: d.local };
  const already = storage.getDelivery(d.day);
  if (already && already.status !== "failed") return { action: "skip", reason: `déjà traité (${already.status})`, local: d.local };

  let title: string, body: string, kind: "sent" | "fallback";
  try {
    const { forecast } = await todayForecast(fetchImpl, now);
    const r = recommend(forecast, s.prefs, s.city);
    ({ title, body } = r.notification);
    kind = "sent";
  } catch (e: any) {
    if (d.late < FALLBACK_AFTER_MIN) {
      logger.warn("scheduler", `météo indisponible (${e.message}), nouvel essai au prochain réveil`);
      return { action: "waiting", reason: e.message, day: d.day };
    }
    title = `${s.city} · météo indisponible`;
    body = "Impossible de récupérer la météo ce matin : aucun conseil fiable ne peut être donné. Regardez le ciel avant de sortir.";
    kind = "fallback";
  }
  if (!storage.claimDelivery(d.day)) return { action: "skip", reason: "déjà en cours", local: d.local };
  try {
    await sendImpl(s.ntfyTopic, { title, body, click: appUrl(), tags: kind === "sent" ? ["shirt"] : ["warning"] });
    storage.finishDelivery(d.day, kind, `${d.local} · ${title}`);
    logger.info("scheduler", `envoi ${kind} du ${d.day} à ${d.local} (${s.timezone})`);
    return { action: kind, day: d.day, local: d.local };
  } catch (e: any) {
    storage.finishDelivery(d.day, "failed", e.message);
    return { action: "failed", reason: e.message, day: d.day };
  }
}

let lastTick: { at: string; result: TickResult; source: string } | null = null;
let lastExternal: string | null = null; // dernier réveil par GitHub Actions
export const getLastTick = () => lastTick;
export const getLastExternalTick = () => lastExternal;
export async function runTick(source: string) {
  try {
    const result = await tick();
    lastTick = { at: new Date().toISOString(), result, source };
    if (source === "github-actions") lastExternal = lastTick.at;
    return result;
  } catch (e: any) {
    logger.error("scheduler", e.message);
    const result: TickResult = { action: "skip", reason: "erreur interne" };
    lastTick = { at: new Date().toISOString(), result, source };
    return result;
  }
}

export function startScheduler() {
  const t = setInterval(() => void runTick("interne"), 60 * 1000);
  t.unref();
  void runTick("démarrage");
  logger.info("scheduler", "planificateur interne démarré (toutes les minutes)");
}
