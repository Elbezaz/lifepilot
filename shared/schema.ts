// Données stockées (RGPD : minimum nécessaire, une seule ligne de réglages).
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { preferencesSchema } from "./prefs";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // toujours 1 (mono-utilisateur)
  city: text("city"),
  region: text("region"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  preferences: text("preferences").notNull(), // JSON (Preferences)
  notifyEnabled: integer("notify_enabled", { mode: "boolean" }).notNull().default(false),
  notifyTime: text("notify_time").notNull().default("07:00"), // HH:MM heure locale de la ville
  ntfyTopic: text("ntfy_topic").notNull(),
});

// Journal des envois : 1 ligne par jour local → empêche les doublons.
export const deliveries = sqliteTable("deliveries", {
  day: text("day").primaryKey(), // YYYY-MM-DD (fuseau de la ville)
  status: text("status").notNull(), // pending | sent | failed | fallback
  attempts: integer("attempts").notNull().default(0),
  sentAt: text("sent_at"),
  detail: text("detail"),
});

// Dernière prévision réussie (sert de secours si Open-Meteo tombe).
export const weatherCache = sqliteTable("weather_cache", {
  key: text("key").primaryKey(), // "lat,lon,jour"
  json: text("json").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM");
export const updateSettingsSchema = z
  .object({
    city: z.string().min(1).max(120),
    region: z.string().max(160).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timezone: z.string().min(1).max(64),
    preferences: preferencesSchema,
    notifyEnabled: z.boolean(),
    notifyTime: hhmm,
  })
  .partial()
  .strict();
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

export interface PublicSettings {
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  preferences: z.infer<typeof preferencesSchema>;
  notifyEnabled: boolean;
  notifyTime: string;
  ntfyTopic: string;
  ntfyServer: string;
}
