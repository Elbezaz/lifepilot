import { sendNtfy } from "../server/modules/notify";
const topic = "lifepilot-selftest-" + Math.random().toString(36).slice(2, 10);
const r = await sendNtfy(topic, { title: "Paris · 11° → 15° ressentis", body: "Test d'envoi LifePilot — accents é è ç ✓" });
console.log("envoyé, id =", r.id, "sujet =", topic);
const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`);
console.log("reçu côté abonné :", (await res.text()).trim());
