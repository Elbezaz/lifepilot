import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, checkConsistency } from "../server/modules/outfit";
import { parseForecast, type DayForecast } from "../server/modules/weather";
import { defaultPreferences, type Preferences } from "../shared/prefs";

type Hour = { a: number; p?: number; mm?: number; w?: number; g?: number; code?: number };
/** Fabrique une journée de 24 h : fn(heure) → conditions. */
function day(fn: (h: number) => Hour, uvMax = 3): DayForecast {
  const hours = Array.from({ length: 24 }, (_, h) => {
    const x = fn(h);
    return {
      time: `2026-01-15T${String(h).padStart(2, "0")}:00`,
      temperature: x.a + 1,
      apparent: x.a,
      precipProbability: x.p ?? 0,
      precipitation: x.mm ?? 0,
      windSpeed: x.w ?? 8,
      windGusts: x.g ?? 15,
      weatherCode: x.code ?? 1,
    };
  });
  return { date: "2026-01-15", timezone: "Europe/Paris", hours, missingHours: 0, uvMax, fetchedAt: "" };
}
const prefs = (o: Partial<Preferences> = {}): Preferences => ({ ...defaultPreferences, ...o });
const labels = (r: ReturnType<typeof recommend>) => r.items.map((i) => i.label).join(" | ");
const tags = (r: ReturnType<typeof recommend>) => r.items.flatMap((i) => i.tags);
// courbe journalière : min à 6 h, max à 15 h
const curve = (min: number, max: number) => (h: number) => min + (max - min) * Math.max(0, Math.sin(((h - 6) / 18) * Math.PI));

test("Scénario CHAUD (24→33 °C) : tenue légère, short, protection soleil, aucune couche", () => {
  const r = recommend(day((h) => ({ a: curve(24, 33)(h) }), 8), prefs());
  assert.ok(tags(r).includes("short"), labels(r));
  assert.ok(tags(r).includes("soleil"), labels(r));
  assert.ok(!r.items.some((i) => i.slot === "couche"), labels(r));
  assert.ok(!tags(r).includes("parapluie"));
});

test("Scénario CHAUD + tenue de bureau : jamais de short", () => {
  const r = recommend(day((h) => ({ a: curve(24, 33)(h) })), prefs({ dressCode: "bureau" }));
  assert.ok(!tags(r).includes("short"), labels(r));
  assert.match(labels(r), /Pantalon léger|Chemise/);
});

test("Scénario FROID (-6→1 °C) : manteau chaud, bonnet/gants, pull épais, pantalon chaud", () => {
  const r = recommend(day((h) => ({ a: curve(-6, 1)(h) })), prefs());
  assert.ok(tags(r).includes("manteau-chaud"), labels(r));
  assert.ok(tags(r).includes("bonnet"), labels(r));
  assert.match(labels(r), /Pull épais/);
  assert.match(labels(r), /Pantalon chaud/);
  assert.ok(!tags(r).includes("short"));
});

test("Scénario PLUIE (90 %, 6 mm) à pied : parapluie + chaussures imperméables, pas de short", () => {
  const r = recommend(day((h) => ({ a: curve(10, 14)(h), p: h >= 13 && h <= 17 ? 90 : 20, mm: h >= 13 && h <= 17 ? 1.2 : 0, code: 61 })), prefs({ commute: "pied" }));
  assert.ok(tags(r).includes("parapluie"), labels(r));
  assert.match(labels(r), /Chaussures imperméables/);
  assert.ok(!tags(r).includes("short"));
  assert.match(r.headline, /pluie 13h–18h/);
});

test("Scénario PLUIE à vélo : jamais de parapluie, veste à capuche + surpantalon", () => {
  const r = recommend(day((h) => ({ a: curve(10, 14)(h), p: 85, mm: 0.5, code: 61 })), prefs({ commute: "velo" }));
  assert.ok(!tags(r).includes("parapluie"), labels(r));
  assert.match(labels(r), /Veste imperméable à capuche/);
  assert.match(labels(r), /Surpantalon/);
});

test("Scénario VENT FORT + pluie (rafales 75 km/h) : imperméable, parapluie déconseillé", () => {
  const r = recommend(day((h) => ({ a: curve(9, 13)(h), p: 80, mm: 0.4, w: 45, g: 75, code: 63 })), prefs());
  assert.ok(!tags(r).includes("parapluie"), labels(r));
  assert.match(labels(r), /parapluie déconseillé/);
  assert.ok(r.alerts.some((a) => /Rafales fortes jusqu'à 75/.test(a)));
});

test("Scénario VENT sans pluie : la couche devient coupe-vent", () => {
  const r = recommend(day((h) => ({ a: curve(13, 17)(h), w: 35, g: 55 })), prefs());
  assert.match(labels(r), /coupe-vent/i);
  assert.match(r.headline, /venteux/);
});

test("Scénario CHANGEMENT BRUTAL (20 °C → 8 °C) : alerte chute + superposition", () => {
  const r = recommend(day((h) => ({ a: h < 12 ? 20 : h < 15 ? 20 - (h - 11) * 4 : 8 })), prefs());
  assert.ok(r.alerts.some((a) => /Chute brutale/.test(a)), r.alerts.join(" / "));
  assert.ok(r.alerts.some((a) => /superposez/.test(a)));
  assert.ok(r.items.some((i) => i.slot === "couche" && /Veste mi-saison/.test(i.label)), labels(r));
});

test("Préférence FRILEUX : une couche plus chaude que 'normal' à 13 °C", () => {
  const f = day(() => ({ a: 13 }));
  assert.match(labels(recommend(f, prefs())), /Veste légère/);
  assert.match(labels(recommend(f, prefs({ sensitivity: "frileux" }))), /Veste mi-saison/);
  assert.match(labels(recommend(f, prefs({ sensitivity: "chaud" }))), /Petite couche légère/);
});

test("Scénario NEIGE à vélo : chaussures antidérapantes + alerte vélo", () => {
  const r = recommend(day(() => ({ a: -2, p: 70, mm: 0.3, code: 73 })), prefs({ commute: "velo" }));
  assert.match(labels(r), /antidérapante/);
  assert.ok(r.alerts.some((a) => /vélo est déconseillé/.test(a)));
});

test("Temps sec : aucun parapluie et titre sans pluie", () => {
  const r = recommend(day((h) => ({ a: curve(12, 18)(h), p: 5 })), prefs());
  assert.ok(!tags(r).includes("parapluie") && !/pluie/.test(r.headline), r.headline);
});

test("Aucune recommandation contradictoire sur 3 000+ combinaisons météo × préférences", () => {
  let n = 0;
  for (const min of [-15, -5, 0, 4, 8, 12, 16, 20, 25])
    for (const span of [0, 4, 10, 16])
      for (const p of [0, 40, 95])
        for (const g of [10, 50, 80])
          for (const code of [1, 61, 73, 95])
            for (const sensitivity of ["frileux", "normal", "chaud"] as const)
              for (const commute of ["pied", "velo", "voiture"] as const)
                for (const dressCode of ["bureau", "decontracte"] as const) {
                  const r = recommend(day((h) => ({ a: curve(min, min + span)(h), p, mm: p / 50, g, w: g / 2, code })), prefs({ sensitivity, commute, dressCode }));
                  assert.ok(r.items.length >= 3);
                  n++;
                }
  assert.ok(n > 3000, `${n} combinaisons`);
});

test("Le garde-fou détecte bien une contradiction (short + manteau)", () => {
  const errs = checkConsistency(
    [
      { slot: "couche", label: "Manteau", reason: "", tags: ["manteau"] },
      { slot: "haut", label: "T-shirt", reason: "", tags: [] },
      { slot: "bas", label: "Short", reason: "", tags: ["short"] },
      { slot: "chaussures", label: "Baskets", reason: "", tags: [] },
    ],
    { effMin: 5, effMax: 25, rainLikely: false, rainMaybe: false, bike: false, stormyWind: false },
  );
  assert.ok(errs.includes("short avec manteau/bonnet"));
});

test("Données manquantes : heures ignorées + avertissement ; trop peu → erreur claire", () => {
  const time = Array.from({ length: 24 }, (_, h) => `2026-01-15T${String(h).padStart(2, "0")}:00`);
  const t = time.map((_, h) => (h % 4 === 0 ? null : 10));
  const f = parseForecast({ timezone: "Europe/Paris", hourly: { time, temperature_2m: t, apparent_temperature: t } }, "2026-01-15");
  assert.equal(f.missingHours, 6);
  const r = recommend(f, prefs());
  assert.ok(r.alerts.some((a) => /manquante/.test(a)));
  assert.throws(() => parseForecast({ hourly: { time, temperature_2m: time.map(() => null) } }, "2026-01-15"), /incomplètes/);
  assert.throws(() => parseForecast({}), /sans données/);
});
