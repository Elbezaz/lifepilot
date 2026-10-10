// Moteur de règles vestimentaires. SOURCE DE VÉRITÉ : déterministe, testé, sans IA.
import type { DayForecast, HourPoint } from "./weather";
import { isSnow, isStorm } from "./weather";
import type { OutfitItem, Preferences, Recommendation } from "@shared/prefs";

// Seuils (°C ressentis après ajustement des préférences, km/h, %, mm)
export const T = { glacial: 0, froid: 6, frais: 11, doux: 16, tiede: 21, chaud: 26 };
export const RAIN = { likelyProb: 60, likelyMm: 1, maybeProb: 30, maybeMm: 0.2, hourProb: 50, hourMm: 0.3 };
export const WIND = { windyGust: 45, windySpeed: 30, stormyGust: 60 };
export const SWING = 8; // écart matin/après-midi qui impose des couches
export const DROP = 6; // chute brutale en 3 h

const round = (n: number) => Math.round(n);
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const hourOf = (h: HourPoint) => Number(h.time.slice(11, 13));

function feel(t: number): string {
  if (t < T.glacial) return "glacial";
  if (t < T.froid) return "froid";
  if (t < T.frais) return "frais";
  if (t < T.doux) return "doux";
  if (t < T.tiede) return "agréable";
  if (t < T.chaud) return "chaud";
  return "très chaud";
}

/** Regroupe des heures consécutives en plages "14h–17h". */
function periods(hours: HourPoint[]): string[] {
  const hs = hours.map(hourOf).sort((a, b) => a - b);
  const out: string[] = [];
  let start = -1;
  let prev = -1;
  for (const h of hs) {
    if (start < 0) start = h;
    else if (h !== prev + 1) {
      out.push(start === prev ? `${start}h` : `${start}h–${prev + 1}h`);
      start = h;
    }
    prev = h;
  }
  if (start >= 0) out.push(start === prev ? `${start}h` : `${start}h–${prev + 1}h`);
  return out;
}

export function recommend(f: DayForecast, p: Preferences, city = ""): Recommendation {
  // 1) Fenêtre de la journée passée dehors
  const start = Math.min(p.dayStart, p.dayEnd - 1);
  const end = Math.max(p.dayEnd, start + 1);
  let win = f.hours.filter((h) => hourOf(h) >= start && hourOf(h) <= end);
  if (win.length < 3) win = f.hours; // repli si trop de données manquantes sur la plage
  const first = win.slice(0, 3);
  const last = win.slice(-3);
  const mid = win.filter((h) => hourOf(h) >= 12 && hourOf(h) <= 16);

  const app = win.map((h) => h.apparent);
  const aMin = Math.min(...app);
  const aMax = Math.max(...app);
  const morning = avg(first.map((h) => h.apparent));
  const evening = avg(last.map((h) => h.apparent));
  const afternoon = mid.length ? Math.max(...mid.map((h) => h.apparent)) : aMax;

  // 2) Préférences → température « vécue »
  const offset = p.sensitivity === "frileux" ? -3 : p.sensitivity === "chaud" ? 3 : 0;
  const bike = p.commute === "velo";
  const exposed = p.commute === "pied" || bike;
  const effMin = aMin + offset + (bike ? -2 : 0); // vent relatif à vélo
  const effMax = aMax + offset;
  const office = p.dressCode === "bureau";

  // 3) Pluie, vent, neige, orage
  const rainProb = Math.max(...win.map((h) => h.precipProbability));
  const rainTotal = win.reduce((s, h) => s + h.precipitation, 0);
  const rainHours = win.filter((h) => h.precipProbability >= RAIN.hourProb || h.precipitation >= RAIN.hourMm);
  const rainLikely = rainProb >= RAIN.likelyProb || rainTotal >= RAIN.likelyMm;
  const rainMaybe = !rainLikely && (rainProb >= RAIN.maybeProb || rainTotal >= RAIN.maybeMm);
  const gustMax = Math.max(...win.map((h) => h.windGusts));
  const windMax = Math.max(...win.map((h) => h.windSpeed));
  const windy = gustMax >= WIND.windyGust || windMax >= WIND.windySpeed;
  const stormyWind = gustMax >= WIND.stormyGust;
  const snow = win.some((h) => isSnow(h.weatherCode));
  const storm = win.some((h) => isStorm(h.weatherCode));
  const swing = aMax - aMin;
  const layered = swing >= SWING;

  // chute brutale : baisse ≥ DROP en 3 h
  let dropAt: string | null = null;
  for (let i = 0; i + 3 < win.length; i++) {
    const j = i + 3;
    if (win[i].apparent - win[j].apparent >= DROP) {
      dropAt = `${hourOf(win[j])}h`;
      break;
    }
  }

  const items: OutfitItem[] = [];
  const add = (slot: OutfitItem["slot"], label: string, reason: string, tags: string[] = []) =>
    items.push({ slot, label, reason, tags });

  // 4) Couche extérieure — dictée par le moment le plus froid
  const minTxt = `${round(effMin)}°C ressentis au plus froid`;
  if (effMin < T.glacial) add("couche", "Manteau chaud (doudoune ou laine épaisse)", minTxt, ["manteau", "manteau-chaud"]);
  else if (effMin < T.froid) add("couche", "Manteau", minTxt, ["manteau"]);
  else if (effMin < T.frais) add("couche", "Veste mi-saison", minTxt, ["veste"]);
  else if (effMin < T.doux) add("couche", "Veste légère ou gilet", minTxt, ["veste", "leger"]);
  else if (effMin < 19 || (layered && effMin < T.tiede)) add("couche", "Petite couche légère à retirer (gilet, surchemise)", "Fraîcheur en début ou fin de journée", ["leger"]);
  if (windy && !rainLikely && effMin < T.chaud) {
    const outer = items.find((i) => i.slot === "couche");
    if (outer) outer.label += ", fermée et coupe-vent si possible";
    else add("couche", "Coupe-vent léger", `Rafales jusqu'à ${round(gustMax)} km/h`, ["coupe-vent"]);
  }

  // 5) Haut — dicté par le moment le plus chaud (et compatible avec le plus froid grâce à la couche)
  const top = (casual: string, formal: string) => (office ? formal : casual);
  const maxTxt = `${round(effMax)}°C ressentis au plus chaud`;
  if (effMax < T.froid) add("haut", top("Pull épais sur un haut à manches longues", "Pull en laine sur une chemise"), maxTxt, ["pull"]);
  else if (effMax < T.frais) add("haut", top("Pull", "Pull fin sur une chemise"), maxTxt, ["pull"]);
  else if (effMax < T.doux) add("haut", top("Haut à manches longues ou pull fin", "Chemise à manches longues, pull fin à portée de main"), maxTxt, ["manches-longues"]);
  else if (effMax < T.tiede) add("haut", top("T-shirt ou haut à manches longues léger", "Chemise ou blouse"), maxTxt, ["leger"]);
  else if (effMax < T.chaud) add("haut", top("T-shirt", "Chemise légère ou polo"), maxTxt, ["leger"]);
  else add("haut", top("Haut très léger et respirant (lin, coton)", "Chemise en lin ou coton léger"), maxTxt, ["tres-leger"]);

  // 6) Bas
  const shorts = !office && effMax >= 24 && effMin >= 17 && !rainLikely;
  if (shorts) add("bas", "Short ou jupe légère", "Chaud toute la journée", ["short"]);
  else if (effMin < T.glacial && effMax < T.tiede) add("bas", office ? "Pantalon en laine + collant ou sous-couche thermique" : "Pantalon chaud + collant ou sous-couche thermique", "Froid intense", ["chaud"]);
  else if (effMax >= T.chaud) add("bas", office ? "Pantalon léger (lin, coton) ou jupe" : "Pantalon léger ou jupe", "Chaleur", ["leger"]);
  else add("bas", office ? "Pantalon de ville" : "Jean ou pantalon", "Adapté à la journée", []);
  if (bike && rainLikely) add("bas", "Surpantalon de pluie", "Pluie probable à vélo", ["pluie"]);

  // 7) Pluie (jamais de parapluie à vélo ou par fortes rafales)
  const when = rainHours.length ? ` (${periods(rainHours).join(", ")})` : "";
  if (rainLikely) {
    if (bike) add("accessoire", "Veste imperméable à capuche", `Pluie probable${when}, à vélo`, ["impermeable"]);
    else if (stormyWind) add("accessoire", "Imperméable à capuche — parapluie déconseillé", `Pluie${when} et rafales à ${round(gustMax)} km/h`, ["impermeable"]);
    else add("accessoire", "Parapluie", `Pluie probable${when} : ${rainProb}% / ${rainTotal.toFixed(1)} mm`, ["parapluie"]);
  } else if (rainMaybe) {
    if (bike || stormyWind) add("accessoire", "Veste imperméable légère dans le sac", `Risque d'averse ${rainProb}%`, ["impermeable"]);
    else add("accessoire", "Parapluie compact dans le sac, au cas où", `Risque d'averse ${rainProb}%`, ["parapluie"]);
  }

  // 8) Froid : accessoires
  if (effMin < 3) add("accessoire", "Bonnet, gants et écharpe", minTxt, ["bonnet", "gants"]);
  else if (effMin < 7) add("accessoire", bike ? "Écharpe et gants" : "Écharpe", minTxt, ["echarpe"]);

  // 9) Chaleur / soleil
  if (effMax >= T.chaud && !rainLikely) add("accessoire", "Casquette ou chapeau, lunettes de soleil et une bouteille d'eau", maxTxt, ["soleil"]);
  else if ((f.uvMax ?? 0) >= 6 && !rainLikely) add("accessoire", "Crème solaire", `Indice UV ${round(f.uvMax!)}`, ["soleil"]);

  // 10) Chaussures
  if (snow) add("chaussures", "Chaussures imperméables à semelle antidérapante", "Neige prévue", ["impermeable"]);
  else if (rainLikely) add("chaussures", office ? "Chaussures de ville imperméables (évitez le daim)" : "Chaussures imperméables", "Sol mouillé", ["impermeable"]);
  else if (effMax >= T.chaud && !office && exposed === false) add("chaussures", "Chaussures légères ou sandales", "Chaleur", ["sandales"]);
  else if (effMax >= T.chaud && !office) add("chaussures", "Baskets légères et aérées", "Chaleur, beaucoup de marche", []);
  else add("chaussures", office ? "Chaussures de ville" : "Baskets ou chaussures confortables", "Temps sec", []);

  // 11) Alertes
  const alerts: string[] = [];
  if (layered) alerts.push(`Écart de ${round(swing)}° entre le moment le plus froid et le plus chaud : superposez les couches pour pouvoir en retirer.`);
  if (dropAt) alerts.push(`Chute brutale de température vers ${dropAt} : gardez votre couche chaude à portée de main.`);
  if (storm) alerts.push(bike ? "Risque d'orage : envisagez une alternative au vélo." : "Risque d'orage : évitez de vous abriter sous les arbres.");
  if (snow) alerts.push(bike ? "Neige prévue : le vélo est déconseillé (sol glissant)." : "Neige prévue : prévoyez plus de temps pour vos trajets.");
  if (stormyWind) alerts.push(`Rafales fortes jusqu'à ${round(gustMax)} km/h.`);
  if (f.missingHours > 0) alerts.push(`${f.missingHours} heure(s) de prévision manquante(s) : conseil établi sur les heures disponibles.`);

  // 12) Titre
  const m = feel(morning + offset);
  const a = feel(afternoon + offset);
  const e = feel(evening + offset);
  let headline = m === a ? `${cap(m)} toute la journée` : `${cap(m)} le matin, ${a} l'après-midi`;
  if (e !== a && m !== a && e !== m) headline += `, ${e} le soir`;
  if (rainLikely) headline += rainHours.length ? ` — pluie ${periods(rainHours)[0]}` : " — pluie probable";
  else if (rainMaybe) headline += " — averse possible";
  else if (stormyWind || windy) headline += " — venteux";
  headline += ".";

  const checks = checkConsistency(items, { effMin, effMax, rainLikely, rainMaybe, bike, stormyWind });
  if (checks.length) throw new Error("Recommandation incohérente : " + checks.join("; "));

  const order: OutfitItem["slot"][] = ["couche", "haut", "bas", "chaussures", "accessoire"];
  items.sort((x, y) => order.indexOf(x.slot) - order.indexOf(y.slot));

  const title = `${city ? city + " · " : ""}${round(aMin)}° → ${round(aMax)}° ressentis`;
  const body = [headline, ...items.map((i) => `• ${i.label}`), ...alerts.map((x) => `⚠ ${x}`)].join("\n");

  return {
    headline,
    items,
    alerts,
    facts: {
      window: `${start}h–${end}h`,
      apparentMin: round(aMin),
      apparentMax: round(aMax),
      morning: round(morning),
      afternoon: round(afternoon),
      evening: round(evening),
      rainMaxProb: rainProb,
      rainTotal: Math.round(rainTotal * 10) / 10,
      rainPeriods: periods(rainHours),
      gustMax: round(gustMax),
      windMax: round(windMax),
      effectiveMin: round(effMin),
      effectiveMax: round(effMax),
    },
    notification: { title, body },
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Garde-fou : liste les contradictions. Doit toujours renvoyer [] (vérifié par les tests). */
export function checkConsistency(
  items: OutfitItem[],
  c: { effMin: number; effMax: number; rainLikely: boolean; rainMaybe: boolean; bike: boolean; stormyWind: boolean },
): string[] {
  const has = (tag: string) => items.some((i) => i.tags.includes(tag));
  const errs: string[] = [];
  if (has("short") && (has("manteau") || has("bonnet"))) errs.push("short avec manteau/bonnet");
  if (has("short") && c.rainLikely) errs.push("short sous la pluie");
  if (has("parapluie") && (c.bike || c.stormyWind)) errs.push("parapluie à vélo ou par fortes rafales");
  if (has("parapluie") && !c.rainLikely && !c.rainMaybe) errs.push("parapluie sans pluie");
  if (has("sandales") && (c.rainLikely || has("impermeable"))) errs.push("sandales sous la pluie");
  if (has("chaud") && c.effMax >= T.tiede) errs.push("tenue chaude par temps chaud");
  if (c.effMin < T.frais && !items.some((i) => i.slot === "couche")) errs.push("pas de couche par temps froid");
  if (has("soleil") && c.rainLikely) errs.push("accessoires soleil sous la pluie");
  const slots = ["haut", "chaussures"] as const;
  for (const s of slots) if (items.filter((i) => i.slot === s).length !== 1) errs.push(`un seul élément '${s}' attendu`);
  if (items.filter((i) => i.slot === "couche").length > 1) errs.push("plusieurs couches extérieures");
  return errs;
}
