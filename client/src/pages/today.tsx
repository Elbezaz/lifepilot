import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, queryClient } from "@/lib/queryClient";
import type { Today, PublicSettings } from "@/lib/types";
import { LABELS } from "@shared/prefs";
import {
  Shirt, Layers, Footprints, Umbrella, AlertTriangle, CloudOff, RefreshCw, MapPin, Wind, Droplets, Thermometer,
  BadgeCheck, BellRing, Sparkles, type LucideIcon,
} from "lucide-react";

const SLOT_ICON: Record<string, LucideIcon> = { couche: Layers, haut: Shirt, bas: Shirt, chaussures: Footprints, accessoire: Umbrella };
const SLOT_LABEL: Record<string, string> = { couche: "Couche extérieure", haut: "Haut", bas: "Bas", chaussures: "Chaussures", accessoire: "Accessoire" };

const fmtTime = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function TodayPage() {
  const settings = useQuery<PublicSettings>({ queryKey: ["/api/settings"] });
  const today = useQuery<Today>({ queryKey: ["/api/today"], enabled: !!settings.data?.city, staleTime: 10 * 60 * 1000, refetchInterval: 30 * 60 * 1000 });

  if (settings.isLoading) return <LoadingState />;
  if (!settings.data?.city) return <EmptyState />;
  if (today.isLoading) return <LoadingState />;
  if (today.isError) return <ErrorState error={today.error as ApiError} onRetry={() => today.refetch()} retrying={today.isFetching} />;
  const t = today.data!;
  const r = t.recommendation;
  const s = settings.data;
  const p = s.preferences;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{fmtDate(t.date)}</p>
          <h1 className="font-display text-xl font-bold" data-testid="text-city">
            <MapPin className="mr-1 inline h-5 w-5 align-[-2px] text-primary" aria-hidden />{t.city}
            {t.region && <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">{t.region}</span>}
          </h1>
        </div>
        <VerifiedBadge t={t} />
      </div>

      {t.warning && (
        <div role="status" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <CloudOff className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />{t.warning}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recommandation */}
        <section className="rounded-xl border bg-card p-5 lg:col-span-3" aria-labelledby="reco-title">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Shirt className="h-4 w-4" aria-hidden /> Votre tenue du jour
          </div>
          <h2 id="reco-title" className="text-lg font-semibold leading-snug" data-testid="text-headline">{r.headline}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Pour {r.facts.window} · {LABELS.sensitivity[p.sensitivity]} · {LABELS.commute[p.commute]} · {LABELS.dressCode[p.dressCode]}
          </p>
          <ul className="mt-4 divide-y" data-testid="list-items">
            {r.items.map((i, k) => {
              const Icon = SLOT_ICON[i.slot] ?? Shirt;
              return (
                <li key={k} className="flex gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-5 w-5" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{SLOT_LABEL[i.slot]}</p>
                    <p className="font-medium">{i.label}</p>
                    <p className="text-sm text-muted-foreground">{i.reason}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {r.alerts.length > 0 && (
            <ul className="mt-3 space-y-2">
              {r.alerts.map((a, k) => (
                <li key={k} className="flex gap-2 rounded-lg bg-amber-500/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 translate-y-0.5 text-amber-600" aria-hidden />{a}</li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Conseil calculé par des règles fixes à partir des données ci-contre (aucune IA).
          </p>
        </section>

        {/* Météo vérifiée */}
        <section className="space-y-4 lg:col-span-2" aria-labelledby="meteo-title">
          <div className="rounded-xl border bg-card p-5">
            <h2 id="meteo-title" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Maintenant · {t.now.time.slice(11, 16)}</h2>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="tabular font-display text-xl font-bold" data-testid="text-temp">{Math.round(t.now.temperature)}°C</span>
              <span className="text-sm text-muted-foreground">ressenti {Math.round(t.now.apparent)}°C · {t.now.label}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Fact icon={Thermometer} label="Ressenti min / max" value={`${r.facts.apparentMin}° / ${r.facts.apparentMax}°`} />
              <Fact icon={Thermometer} label="Matin → après-midi" value={`${r.facts.morning}° → ${r.facts.afternoon}°`} />
              <Fact icon={Droplets} label="Pluie (max)" value={`${r.facts.rainMaxProb} % · ${r.facts.rainTotal} mm`} />
              <Fact icon={Wind} label="Rafales (max)" value={`${r.facts.gustMax} km/h`} />
            </dl>
            {(t.sunrise || t.sunset) && (
              <p className="mt-3 text-xs text-muted-foreground">Lever {t.sunrise?.slice(11, 16)} · Coucher {t.sunset?.slice(11, 16)}{t.uvMax != null ? ` · UV max ${Math.round(t.uvMax)}` : ""}</p>
            )}
          </div>
          <NextNotification s={s} />
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="chart-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="chart-title" className="text-lg font-semibold">Évolution de la journée</h2>
          <p className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-[hsl(var(--chart-1))]" />Ressenti (°C)</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[hsl(var(--chart-3))]" />Risque de pluie (%)</span>
          </p>
        </div>
        <div className="mt-4 h-56 w-full" role="img" aria-label={`Ressenti de ${r.facts.apparentMin} à ${r.facts.apparentMax} degrés, pluie maximale ${r.facts.rainMaxProb} pour cent`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={t.hours.map((h) => ({ h: Number(h.time.slice(11, 13)), apparent: Math.round(h.apparent * 10) / 10, rain: h.precipProbability, label: h.label }))} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <ReferenceArea x1={p.dayStart} x2={p.dayEnd} yAxisId="t" fill="hsl(var(--accent))" fillOpacity={0.5} />
              <XAxis dataKey="h" tickFormatter={(v) => `${v}h`} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} interval={2} axisLine={false} tickLine={false} />
              <YAxis yAxisId="t" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} />
              <YAxis yAxisId="p" orientation="right" domain={[0, 100]} hide />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 13 }}
                labelFormatter={(v) => `${v}h`}
                formatter={(v: any, n: string) => (n === "apparent" ? [`${v} °C`, "Ressenti"] : [`${v} %`, "Pluie"])}
              />
              <Bar yAxisId="p" dataKey="rain" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Line yAxisId="t" dataKey="apparent" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Zone colorée : vos heures dehors ({p.dayStart}h–{p.dayEnd}h), modifiables dans les préférences.</p>
      </section>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}

function VerifiedBadge({ t }: { t: Today }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground" data-testid="badge-source">
      <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden />
      Données Open-Meteo · {t.source === "cache" ? "mises à jour à" : "reçues à"} {fmtTime(t.fetchedAt, t.timezone)}
    </span>
  );
}

function NextNotification({ s }: { s: PublicSettings }) {
  return (
    <Link href="/notifications" className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50" data-testid="link-next-notif">
      <BellRing className={`h-5 w-5 ${s.notifyEnabled ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
      <div className="text-sm">
        {s.notifyEnabled ? (<><p className="font-medium">Notification chaque jour à {s.notifyTime}</p><p className="text-muted-foreground">Heure de {s.city} ({s.timezone})</p></>)
          : (<><p className="font-medium">Notifications désactivées</p><p className="text-muted-foreground">Recevoir ce conseil chaque matin →</p></>)}
      </div>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement de la météo">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-80 lg:col-span-3" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <MapPin className="mx-auto h-8 w-8 text-primary" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Bienvenue sur LifePilot</h1>
      <p className="mt-2 text-sm text-muted-foreground">Indiquez votre ville et vos habitudes : LifePilot vous dira chaque matin comment vous habiller selon la météo réelle.</p>
      <Button asChild className="mt-5" data-testid="button-start"><Link href="/preferences">Choisir ma ville</Link></Button>
    </div>
  );
}

function ErrorState({ error, onRetry, retrying }: { error: ApiError; onRetry: () => void; retrying: boolean }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center" role="alert" data-testid="state-error">
      <CloudOff className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">{offline ? "Vous êtes hors connexion" : "Météo indisponible pour le moment"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {offline ? "Vérifiez votre connexion internet." : error?.message || "Le service météo ne répond pas."} Aucun conseil n'est affiché tant que la météo réelle n'est pas disponible : LifePilot n'invente jamais de prévision.
      </p>
      <Button variant="outline" className="mt-5" onClick={() => { queryClient.removeQueries({ queryKey: ["/api/today"] }); onRetry(); }} disabled={retrying} data-testid="button-retry">
        <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden />Réessayer
      </Button>
    </div>
  );
}
