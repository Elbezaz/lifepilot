import type { PublicSettings, Delivery } from "@shared/schema";
import type { Recommendation } from "@shared/prefs";
export type { PublicSettings, Delivery, Recommendation };

export interface Hour {
  time: string; temperature: number; apparent: number; precipProbability: number; precipitation: number;
  windSpeed: number; windGusts: number; weatherCode: number; label: string;
}
export interface Today {
  city: string; region: string | null; timezone: string; date: string; source: "live" | "cache"; warning?: string;
  fetchedAt: string; sunrise?: string; sunset?: string; uvMax?: number; now: Hour; hours: Hour[]; recommendation: Recommendation;
}
export interface Status {
  localTime: string; localDay: string; timezone: string; todayDelivery: Delivery | null; deliveries: Delivery[];
  lastTick: { at: string; source: string; result: any } | null; cronConfigured: boolean;
  logs: { at: string; level: string; scope: string; message: string }[];
}
export interface Place { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone: string }
