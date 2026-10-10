// Récupération météo via Open-Meteo (gratuit, sans clé).
// Doc : https://open-meteo.com/en/docs et https://open-meteo.com/en/docs/geocoding-api
import { logger } from "../logger";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export class WeatherError extends Error {
  constructor(
    public code: "network" | "timeout" | "http" | "invalid" | "incomplete" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "WeatherError";
  }
}

export interface Place {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface HourPoint {
  time: string; // heure locale "YYYY-MM-DDTHH:00"
  temperature: number;
  apparent: number;
  precipProbability: number; // %
  precipitation: number; // mm
  windSpeed: number; // km/h
  windGusts: number; // km/h
  weatherCode: number;
}

export interface DayForecast {
  date: string; // YYYY-MM-DD local
  timezone: string;
  hours: HourPoint[]; // heures valides du jour
  missingHours: number; // heures ignorées car données manquantes
  sunrise?: string;
  sunset?: string;
  uvMax?: number;
  fetchedAt: string; // ISO
}

const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "weather_code",
].join(",");

const TIMEOUT_MS = 8000;

class FatalError extends Error {}

async function fetchJson(url: string, fetchImpl: FetchLike, attempts = 2): Promise<any> {
  let lastErr: WeatherError = new WeatherError("network", "Erreur inconnue");
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal });
      if (res.status >= 400 && res.status < 500) {
        // requête invalide : inutile de réessayer
        throw new FatalError(`Le service météo a refusé la requête (${res.status})`);
      }
      if (!res.ok) {
        lastErr = new WeatherError("http", `Le service météo est en erreur (${res.status})`);
      } else {
        try {
          return await res.json();
        } catch {
          lastErr = new WeatherError("invalid", "Réponse météo illisible");
        }
      }
    } catch (e: any) {
      if (e instanceof FatalError) throw new WeatherError("http", e.message);
      lastErr =
        e?.name === "AbortError"
          ? new WeatherError("timeout", "Le service météo ne répond pas (délai dépassé)")
          : new WeatherError("network", "Connexion impossible au service météo");
    } finally {
      clearTimeout(timer);
    }
    if (i < attempts - 1) logger.warn("weather", `essai ${i + 1} échoué : ${lastErr.message} — nouvel essai`);
  }
  throw lastErr;
}

export async function searchCity(
  name: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<Place[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(q)}&count=6&language=fr&format=json`;
  const data = await fetchJson(url, fetchImpl);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r: any) => typeof r?.latitude === "number" && typeof r?.longitude === "number" && r?.timezone)
    .map((r: any) => ({
      name: String(r.name),
      admin1: r.admin1 ? String(r.admin1) : undefined,
      country: r.country ? String(r.country) : undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: String(r.timezone),
    }));
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Transforme la réponse brute Open-Meteo en prévision du jour local. Exporté pour les tests. */
export function parseForecast(data: any, date?: string): DayForecast {
  const h = data?.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) {
    throw new WeatherError("invalid", "Réponse météo sans données horaires");
  }
  const timezone: string = typeof data.timezone === "string" ? data.timezone : "GMT";
  const day = date ?? String(h.time[0]).slice(0, 10);
  const hours: HourPoint[] = [];
  let missing = 0;
  for (let i = 0; i < h.time.length; i++) {
    const t = String(h.time[i]);
    if (!t.startsWith(day)) continue;
    const temperature = num(h.temperature_2m?.[i]);
    const apparentRaw = num(h.apparent_temperature?.[i]);
    const apparent = apparentRaw ?? temperature; // repli : température réelle
    if (temperature === null || apparent === null) {
      missing++;
      continue;
    }
    hours.push({
      time: t,
      temperature,
      apparent,
      precipProbability: num(h.precipitation_probability?.[i]) ?? 0,
      precipitation: num(h.precipitation?.[i]) ?? 0,
      windSpeed: num(h.wind_speed_10m?.[i]) ?? 0,
      windGusts: num(h.wind_gusts_10m?.[i]) ?? num(h.wind_speed_10m?.[i]) ?? 0,
      weatherCode: num(h.weather_code?.[i]) ?? 0,
    });
  }
  if (hours.length < 6) {
    throw new WeatherError("incomplete", "Données météo trop incomplètes pour un conseil fiable");
  }
  const d = data.daily ?? {};
  const di = Array.isArray(d.time) ? d.time.indexOf(day) : -1;
  return {
    date: day,
    timezone,
    hours,
    missingHours: missing,
    sunrise: di >= 0 ? d.sunrise?.[di] : undefined,
    sunset: di >= 0 ? d.sunset?.[di] : undefined,
    uvMax: di >= 0 ? num(d.uv_index_max?.[di]) ?? undefined : undefined,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getForecast(
  lat: number,
  lon: number,
  date: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<DayForecast> {
  const url =
    `${FORECAST_URL}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=${HOURLY}&daily=sunrise,sunset,uv_index_max` +
    `&timezone=auto&forecast_days=2&wind_speed_unit=kmh`;
  const data = await fetchJson(url, fetchImpl);
  return parseForecast(data, date);
}

/** Libellé français d'un code météo WMO (doc Open-Meteo). */
export function weatherLabel(code: number): string {
  if (code === 0) return "Ciel dégagé";
  if (code <= 2) return "Partiellement nuageux";
  if (code === 3) return "Couvert";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 57) return "Bruine";
  if (code >= 61 && code <= 67) return "Pluie";
  if (code >= 71 && code <= 77) return "Neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code === 85 || code === 86) return "Averses de neige";
  if (code >= 95) return "Orage";
  return "Conditions variables";
}
export const isSnow = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
export const isStorm = (c: number) => c >= 95;
