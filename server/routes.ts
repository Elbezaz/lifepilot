import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { updateSettingsSchema, type PublicSettings } from "@shared/schema";
import { searchCity, getForecast, weatherLabel, WeatherError, type FetchLike } from "./modules/weather";
import { recommend } from "./modules/outfit";
import { sendNtfy, NTFY_SERVER } from "./modules/notify";
import { todayForecast, runTick, getLastTick, startScheduler, appUrl } from "./modules/daily";
import { dueNow, isValidTimeZone, localParts } from "./modules/time";
import { login, logout, requireAuth, requireCron, authRequired, isAuthenticated } from "./auth";
import { logger } from "./logger";

const failingFetch: FetchLike = async () => { throw new TypeError("simulated outage"); };

function publicSettings(): PublicSettings {
  const s = storage.getSettings();
  return {
    city: s.city, region: s.region, latitude: s.latitude, longitude: s.longitude, timezone: s.timezone,
    preferences: s.prefs, notifyEnabled: s.notifyEnabled, notifyTime: s.notifyTime, ntfyTopic: s.ntfyTopic, ntfyServer: NTFY_SERVER,
  };
}

function weatherErrorBody(e: any) {
  const code = e instanceof WeatherError ? e.code : "network";
  return { code, message: e?.message || "Service météo indisponible" };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // --- Public ---
  app.get("/api/health", (_req, res) => res.json({ ok: true, db: !!storage.ping(), time: new Date().toISOString() }));
  app.get("/api/auth", (req, res) => res.json({ required: authRequired(), authenticated: isAuthenticated(req) }));
  app.post("/api/login", login);
  app.post("/api/logout", logout);
  app.post("/api/cron/tick", requireCron, async (_req, res) => res.json(await runTick("github-actions")));

  // --- Protégé par le code d'accès ---
  app.use("/api", requireAuth);

  app.get("/api/settings", (_req, res) => res.json(publicSettings()));

  app.put("/api/settings", (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", issues: parsed.error.issues.map((i) => i.message) });
    if (parsed.data.timezone && !isValidTimeZone(parsed.data.timezone)) return res.status(400).json({ message: "Fuseau horaire inconnu" });
    if (parsed.data.preferences && parsed.data.preferences.dayStart >= parsed.data.preferences.dayEnd)
      return res.status(400).json({ message: "L'heure de départ doit précéder l'heure de retour" });
    storage.updateSettings(parsed.data);
    logger.info("settings", `réglages mis à jour (${Object.keys(parsed.data).join(", ")})`);
    res.json(publicSettings());
  });

  app.get("/api/cities", async (req, res) => {
    try { res.json(await searchCity(String(req.query.q || ""))); }
    catch (e: any) { res.status(503).json(weatherErrorBody(e)); }
  });

  // Géolocalisation : Open-Meteo n'a pas de géocodage inverse ; on récupère le fuseau via la prévision.
  app.get("/api/locate", async (req, res) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ message: "Coordonnées invalides" });
    try {
      const f = await getForecast(lat, lon, localParts(new Date(), "UTC").day);
      res.json({ timezone: f.timezone });
    } catch (e: any) { res.status(503).json(weatherErrorBody(e)); }
  });

  app.get("/api/today", async (req, res) => {
    const s = storage.getSettings();
    if (!s.city) return res.status(404).json({ code: "not_found", message: "Choisissez une ville dans les préférences." });
    try {
      const simulate = req.query.simulate === "down";
      const r = simulate ? await getForecast(s.latitude!, s.longitude!, localParts(new Date(), s.timezone).day, failingFetch).then((f) => ({ forecast: f, source: "live" as const, warning: undefined }))
                         : await todayForecast();
      const rec = recommend(r.forecast, s.prefs, s.city);
      const nowHour = localParts(new Date(), s.timezone).hour;
      res.json({
        city: s.city, region: s.region, timezone: s.timezone, date: r.forecast.date,
        source: r.source, warning: r.warning, fetchedAt: r.forecast.fetchedAt,
        sunrise: r.forecast.sunrise, sunset: r.forecast.sunset, uvMax: r.forecast.uvMax,
        now: ((h) => ({ ...h, label: weatherLabel(h.weatherCode) }))(r.forecast.hours.find((h) => Number(h.time.slice(11, 13)) === nowHour) ?? r.forecast.hours[0]),
        hours: r.forecast.hours.map((h) => ({ ...h, label: weatherLabel(h.weatherCode) })),
        recommendation: rec,
      });
    } catch (e: any) {
      logger.warn("api", `météo indisponible : ${e.message}`);
      res.status(503).json(weatherErrorBody(e));
    }
  });

  app.post("/api/notify/test", async (_req, res) => {
    const s = storage.getSettings();
    let title = "LifePilot · test", body = "Les notifications fonctionnent.";
    try {
      if (s.city) { const r = recommend((await todayForecast()).forecast, s.prefs, s.city); ({ title, body } = r.notification); title = "[Test] " + title; }
    } catch { body = "Test : notifications OK, mais la météo est indisponible pour le moment."; }
    try { const r = await sendNtfy(s.ntfyTopic, { title, body, click: appUrl() }); res.json({ ok: true, id: r.id }); }
    catch (e: any) { res.status(502).json({ message: e.message }); }
  });

  app.get("/api/status", (_req, res) => {
    const s = storage.getSettings();
    const d = dueNow(new Date(), s.timezone, s.notifyTime);
    res.json({
      localTime: d.local, localDay: d.day, timezone: s.timezone,
      todayDelivery: storage.getDelivery(d.day) ?? null,
      deliveries: storage.listDeliveries(10),
      lastTick: getLastTick(),
      cronConfigured: !!process.env.CRON_SECRET,
      logs: logger.recent(30),
    });
  });

  app.post("/api/topic/regenerate", (_req, res) => { storage.regenerateTopic(); res.json(publicSettings()); });
  app.delete("/api/data", (_req, res) => { storage.wipe(); logger.info("settings", "toutes les données ont été effacées"); res.json(publicSettings()); });

  if (process.env.DISABLE_SCHEDULER !== "1") startScheduler();
  return httpServer;
}
