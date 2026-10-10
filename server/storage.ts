import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { settings, deliveries, weatherCache, type SettingsRow, type Delivery, type UpdateSettings } from "@shared/schema";
import { defaultPreferences, preferencesSchema, type Preferences } from "@shared/prefs";

const sqlite = new Database(process.env.DB_PATH || "data.db");
sqlite.pragma("journal_mode = WAL");
// Création des tables au démarrage (pas d'outil de migration nécessaire pour ce MVP).
sqlite.exec(`
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY, city TEXT, region TEXT, latitude REAL, longitude REAL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris', preferences TEXT NOT NULL,
  notify_enabled INTEGER NOT NULL DEFAULT 0, notify_time TEXT NOT NULL DEFAULT '07:00', ntfy_topic TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (
  day TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS weather_cache (key TEXT PRIMARY KEY, json TEXT NOT NULL, fetched_at TEXT NOT NULL);
`);
export const db = drizzle(sqlite);

const newTopic = () => "lifepilot-" + randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");

export const storage = {
  getSettings(): SettingsRow & { prefs: Preferences } {
    let row = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!row) {
      row = db
        .insert(settings)
        .values({ id: 1, preferences: JSON.stringify(defaultPreferences), ntfyTopic: newTopic() })
        .returning()
        .get();
    }
    const parsed = preferencesSchema.safeParse(JSON.parse(row.preferences || "{}"));
    return { ...row, prefs: parsed.success ? parsed.data : defaultPreferences };
  },

  updateSettings(u: UpdateSettings) {
    this.getSettings();
    const { preferences, latitude, longitude, ...rest } = u;
    const values: Partial<SettingsRow> = { ...rest };
    // Minimisation RGPD : coordonnées arrondies à ~1 km
    if (latitude !== undefined) values.latitude = Math.round(latitude * 100) / 100;
    if (longitude !== undefined) values.longitude = Math.round(longitude * 100) / 100;
    if (preferences) values.preferences = JSON.stringify(preferences);
    if (Object.keys(values).length) db.update(settings).set(values).where(eq(settings.id, 1)).run();
    return this.getSettings();
  },

  regenerateTopic() {
    this.getSettings();
    db.update(settings).set({ ntfyTopic: newTopic() }).where(eq(settings.id, 1)).run();
    return this.getSettings();
  },

  /** Efface toutes les données (droit à l'effacement). */
  wipe() {
    sqlite.exec("DELETE FROM settings; DELETE FROM deliveries; DELETE FROM weather_cache;");
  },

  // --- Journal d'envoi (anti-doublon) ---
  getDelivery(day: string): Delivery | undefined {
    return db.select().from(deliveries).where(eq(deliveries.day, day)).get();
  },
  /** Réserve l'envoi du jour de façon atomique. Renvoie false si déjà envoyé / en cours / trop d'essais. */
  claimDelivery(day: string, maxAttempts = 6): boolean {
    return sqlite.transaction(() => {
      const d = this.getDelivery(day);
      if (!d) {
        db.insert(deliveries).values({ day, status: "pending", attempts: 1 }).run();
        return true;
      }
      if (d.status === "failed" && d.attempts < maxAttempts) {
        db.update(deliveries).set({ status: "pending", attempts: d.attempts + 1 }).where(eq(deliveries.day, day)).run();
        return true;
      }
      return false;
    })();
  },
  finishDelivery(day: string, status: "sent" | "failed" | "fallback", detail: string) {
    db.update(deliveries)
      .set({ status, detail: detail.slice(0, 300), sentAt: status === "failed" ? null : new Date().toISOString() })
      .where(eq(deliveries.day, day))
      .run();
    // ne garder que 30 jours d'historique
    sqlite.exec("DELETE FROM deliveries WHERE day NOT IN (SELECT day FROM deliveries ORDER BY day DESC LIMIT 30)");
  },
  listDeliveries(limit = 10): Delivery[] {
    return db.select().from(deliveries).orderBy(desc(deliveries.day)).limit(limit).all();
  },
  resetDelivery(day: string) {
    db.delete(deliveries).where(eq(deliveries.day, day)).run();
  },

  // --- Cache météo ---
  putWeather(key: string, json: string, fetchedAt = new Date().toISOString()) {
    db.insert(weatherCache)
      .values({ key, json, fetchedAt })
      .onConflictDoUpdate({ target: weatherCache.key, set: { json, fetchedAt } })
      .run();
    sqlite.exec("DELETE FROM weather_cache WHERE key NOT IN (SELECT key FROM weather_cache ORDER BY fetched_at DESC LIMIT 5)");
  },
  getWeather(key: string) {
    return db.select().from(weatherCache).where(eq(weatherCache.key, key)).get();
  },
  ping() {
    return sqlite.prepare("select 1 as ok").get();
  },
};
export { sql };
