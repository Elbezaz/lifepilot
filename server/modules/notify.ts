// Canal de notification : ntfy (https://docs.ntfy.sh/publish/). Publication JSON (UTF-8 sûr).
import type { FetchLike } from "./weather";
import { logger } from "../logger";

export const NTFY_SERVER = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");

export interface Notification { title: string; body: string; tags?: string[]; priority?: number; click?: string }

export async function sendNtfy(topic: string, n: Notification, fetchImpl: FetchLike = fetch as any): Promise<{ id: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await (fetchImpl as any)(NTFY_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        title: n.title.slice(0, 250),
        message: n.body.slice(0, 3900),
        tags: n.tags ?? ["shirt"],
        priority: n.priority ?? 3,
        ...(n.click ? { click: n.click } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`ntfy a répondu ${res.status}`);
    const data = await res.json().catch(() => ({}));
    logger.info("notify", `notification envoyée (id ${data?.id ?? "?"})`);
    return { id: String(data?.id ?? "") };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "ntfy ne répond pas (délai dépassé)" : e?.message || "envoi impossible";
    logger.error("notify", msg);
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}
