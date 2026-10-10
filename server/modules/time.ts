// Heure locale d'une ville (fuseau IANA). Gère l'heure d'été/hiver via Intl.
export function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour, minute: Number(get("minute")), minutes: hour * 60 + Number(get("minute")) };
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export const WINDOW_MIN = 180; // fenêtre de rattrapage après l'heure choisie

/** Faut-il envoyer maintenant ? `late` = minutes de retard sur l'heure choisie. */
export function dueNow(now: Date, timeZone: string, notifyTime: string) {
  const l = localParts(now, timeZone);
  const late = l.minutes - toMinutes(notifyTime);
  return { day: l.day, local: `${String(l.hour).padStart(2, "0")}:${String(l.minute).padStart(2, "0")}`, late, due: late >= 0 && late < WINDOW_MIN };
}

export function isValidTimeZone(tz: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}
