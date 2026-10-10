import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbPath = join(tmpdir(), `lifepilot-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
process.env.LOG_QUIET = "1";

let storage: typeof import("../server/storage").storage;
let tick: typeof import("../server/modules/daily").tick;
let dueNow: typeof import("../server/modules/time").dueNow;
let localParts: typeof import("../server/modules/time").localParts;

before(async () => {
  rmSync(dbPath, { force: true });
  ({ storage } = await import("../server/storage"));
  ({ tick } = await import("../server/modules/daily"));
  ({ dueNow, localParts } = await import("../server/modules/time"));
});

// Faux Open-Meteo : journée de 24 h, 10→16 °C
const okFetch = async (url: string) => {
  return {
    ok: true, status: 200,
    json: async () => {
      const d = (globalThis as any).__day as string;
      const time = Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`);
      const t = time.map((_, h) => 10 + Math.max(0, 6 * Math.sin(((h - 6) / 18) * Math.PI)));
      return { timezone: "Europe/Paris", hourly: { time, temperature_2m: t, apparent_temperature: t, precipitation_probability: time.map(() => 10), precipitation: time.map(() => 0), wind_speed_10m: time.map(() => 10), wind_gusts_10m: time.map(() => 20), weather_code: time.map(() => 2) } };
    },
  } as any;
};
const downFetch = async () => { throw new TypeError("offline"); };

function setup(tz = "Europe/Paris", time = "07:00") {
  storage.wipe();
  storage.updateSettings({ city: "Paris", region: null, latitude: 48.85, longitude: 2.35, timezone: tz, notifyEnabled: true, notifyTime: time });
}
const sent: string[] = [];
const fakeSend = async (_topic: string, n: { title: string }) => { sent.push(n.title); return { id: "x" }; };
const at = (iso: string) => { const d = new Date(iso); (globalThis as any).__day = localParts(d, storage.getSettings().timezone).day; return d; };

test("Heure locale : passage à l'heure d'été (29/03/2026) et d'hiver (25/10/2026) à Paris", () => {
  // 07:00 à Paris = 06:00 UTC en hiver, 05:00 UTC en été
  assert.equal(dueNow(new Date("2026-03-28T06:00:00Z"), "Europe/Paris", "07:00").local, "07:00");
  assert.equal(dueNow(new Date("2026-03-29T05:00:00Z"), "Europe/Paris", "07:00").local, "07:00");
  assert.equal(dueNow(new Date("2026-10-25T06:00:00Z"), "Europe/Paris", "07:00").local, "07:00");
  // 02:30 n'existe pas le 29/03 : à 01:00 UTC il est 03:00 → envoi dû (rattrapage)
  const spring = dueNow(new Date("2026-03-29T01:00:00Z"), "Europe/Paris", "02:30");
  assert.equal(spring.local, "03:00"); assert.equal(spring.due, true);
  // 02:30 existe deux fois le 25/10 : dû les deux fois, mais le verrou journalier empêche le doublon (test suivant)
  assert.equal(dueNow(new Date("2026-10-25T00:30:00Z"), "Europe/Paris", "02:30").due, true);
  assert.equal(dueNow(new Date("2026-10-25T01:30:00Z"), "Europe/Paris", "02:30").due, true);
});

test("Envoi à l'heure choisie, une seule fois par jour (pas de doublon)", async () => {
  setup(); sent.length = 0;
  assert.equal((await tick(at("2026-11-02T05:59:00Z"), okFetch, fakeSend)).action, "skip"); // 06:59
  assert.equal((await tick(at("2026-11-02T06:00:00Z"), okFetch, fakeSend)).action, "sent"); // 07:00
  assert.equal((await tick(at("2026-11-02T06:01:00Z"), okFetch, fakeSend)).action, "skip");
  assert.equal((await tick(at("2026-11-02T06:40:00Z"), okFetch, fakeSend)).action, "skip");
  assert.equal(sent.length, 1);
  assert.equal((await tick(at("2026-11-03T06:05:00Z"), okFetch, fakeSend)).action, "sent"); // lendemain
  assert.equal(sent.length, 2);
});

test("Heure doublée à l'automne : 1 seul envoi", async () => {
  setup("Europe/Paris", "02:30"); sent.length = 0;
  await tick(at("2026-10-25T00:30:00Z"), okFetch, fakeSend);
  await tick(at("2026-10-25T01:30:00Z"), okFetch, fakeSend);
  assert.equal(sent.length, 1);
});

test("Réveil en retard (GitHub Actions) : rattrapage dans la fenêtre de 3 h, pas au-delà", async () => {
  setup(); sent.length = 0;
  assert.equal((await tick(at("2026-11-04T07:25:00Z"), okFetch, fakeSend)).action, "sent"); // 08:25
  setup(); sent.length = 0;
  assert.equal((await tick(at("2026-11-05T09:30:00Z"), okFetch, fakeSend)).action, "skip"); // 10:30, trop tard
});

test("Autre fuseau (New York) : 07:00 heure de New York", async () => {
  setup("America/New_York"); sent.length = 0;
  assert.equal((await tick(at("2026-11-04T11:59:00Z"), okFetch, fakeSend)).action, "skip"); // 06:59 NY
  assert.equal((await tick(at("2026-11-04T12:00:00Z"), okFetch, fakeSend)).action, "sent"); // 07:00 NY
});

test("Panne météo : attente et nouvel essai, puis message de repli honnête après 2 h", async () => {
  setup(); sent.length = 0;
  assert.equal((await tick(at("2026-11-06T06:00:00Z"), downFetch, fakeSend)).action, "waiting");
  assert.equal((await tick(at("2026-11-06T07:00:00Z"), downFetch, fakeSend)).action, "waiting");
  assert.equal(sent.length, 0);
  assert.equal((await tick(at("2026-11-06T08:05:00Z"), downFetch, fakeSend)).action, "fallback");
  assert.match(sent[0], /météo indisponible/);
  assert.equal((await tick(at("2026-11-06T08:10:00Z"), okFetch, fakeSend)).action, "skip");
});

test("Panne météo avec cache récent (< 3 h) : conseil donné à partir du cache", async () => {
  setup(); sent.length = 0;
  storage.updateSettings({ notifyTime: "08:00" });
  // On remplit le cache à 06:30 locales
  const { todayForecast } = await import("../server/modules/daily");
  await todayForecast(okFetch, at("2026-11-07T05:30:00Z"));
  assert.equal((await tick(at("2026-11-07T07:00:00Z"), downFetch, fakeSend)).action, "sent");
});

test("Échec d'envoi ntfy : marqué en échec puis renvoyé au réveil suivant", async () => {
  setup(); sent.length = 0;
  const failing = async () => { throw new Error("ntfy a répondu 500"); };
  assert.equal((await tick(at("2026-11-08T06:00:00Z"), okFetch, failing as any)).action, "failed");
  assert.equal((await tick(at("2026-11-08T06:10:00Z"), okFetch, fakeSend)).action, "sent");
  assert.equal(sent.length, 1);
});

test("Notifications désactivées : aucun envoi", async () => {
  setup(); sent.length = 0;
  storage.updateSettings({ notifyEnabled: false });
  assert.equal((await tick(at("2026-11-09T06:00:00Z"), okFetch, fakeSend)).action, "skip");
});

test("RGPD : coordonnées arrondies, effacement complet", () => {
  storage.updateSettings({ latitude: 48.856613, longitude: 2.352222 });
  const s = storage.getSettings();
  assert.equal(s.latitude, 48.86); assert.equal(s.longitude, 2.35);
  storage.wipe();
  assert.equal(storage.getSettings().city, null);
});
