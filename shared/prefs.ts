// Préférences utilisateur — partagées entre serveur et interface.
import { z } from "zod";

export const preferencesSchema = z.object({
  sensitivity: z.enum(["frileux", "normal", "chaud"]).default("normal"),
  commute: z.enum(["pied", "velo", "transports", "voiture"]).default("transports"),
  dressCode: z.enum(["bureau", "decontracte"]).default("decontracte"),
  dayStart: z.number().int().min(0).max(23).default(8), // heure de départ
  dayEnd: z.number().int().min(1).max(23).default(19), // heure de retour
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: Preferences = preferencesSchema.parse({});

export const LABELS = {
  sensitivity: { frileux: "Frileux·se", normal: "Normal", chaud: "J'ai vite chaud" },
  commute: { pied: "À pied", velo: "À vélo", transports: "Transports en commun", voiture: "En voiture" },
  dressCode: { bureau: "Tenue de bureau", decontracte: "Décontractée" },
} as const;

export type Slot = "couche" | "haut" | "bas" | "chaussures" | "accessoire";
export interface OutfitItem {
  slot: Slot;
  label: string;
  reason: string;
  tags: string[];
}
export interface Recommendation {
  headline: string;
  items: OutfitItem[];
  alerts: string[];
  facts: {
    window: string;
    apparentMin: number;
    apparentMax: number;
    morning: number;
    afternoon: number;
    evening: number;
    rainMaxProb: number;
    rainTotal: number;
    rainPeriods: string[];
    gustMax: number;
    windMax: number;
    effectiveMin: number;
    effectiveMax: number;
  };
  notification: { title: string; body: string };
}
