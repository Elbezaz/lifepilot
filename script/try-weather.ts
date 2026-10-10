import { searchCity, getForecast, weatherLabel } from "../server/modules/weather";
const [p] = await searchCity("Paris");
console.log("Ville :", p);
const today = new Intl.DateTimeFormat("en-CA",{timeZone:p.timezone}).format(new Date());
const f = await getForecast(p.latitude, p.longitude, today);
console.log("Jour :", f.date, "| heures valides :", f.hours.length, "| manquantes :", f.missingHours);
for (const h of f.hours.filter((_,i)=>i%3===0)) console.log(h.time.slice(11), `${h.temperature}°C (ressenti ${h.apparent}°C)`, `pluie ${h.precipProbability}% ${h.precipitation}mm`, `vent ${h.windSpeed} rafales ${h.windGusts} km/h`, weatherLabel(h.weatherCode));
// Panne simulée : pas de connexion
const offline = async () => { throw new TypeError("fetch failed"); };
try { await getForecast(48.85, 2.35, today, offline as any); } catch (e:any) { console.log("Sans connexion →", e.code, ":", e.message); }
const http500 = async () => ({ ok:false, status:503, json: async()=>({}) });
try { await getForecast(48.85, 2.35, today, http500 as any); } catch (e:any) { console.log("Service en panne (503) →", e.code, ":", e.message); }
const empty = async () => ({ ok:true, status:200, json: async()=>({hourly:{time:[`${today}T00:00`], temperature_2m:[null]}}) });
try { await getForecast(48.85, 2.35, today, empty as any); } catch (e:any) { console.log("Données manquantes →", e.code, ":", e.message); }
