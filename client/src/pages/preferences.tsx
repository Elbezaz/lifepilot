import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PublicSettings, Place } from "@/lib/types";
import { LABELS, type Preferences } from "@shared/prefs";
import { MapPin, LocateFixed, Search, Check, Loader2 } from "lucide-react";

type Loc = Pick<PublicSettings, "city" | "region" | "latitude" | "longitude" | "timezone">;

export default function PreferencesPage() {
  const settings = useQuery<PublicSettings>({ queryKey: ["/api/settings"] });
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);

  useEffect(() => {
    if (settings.data && !prefs) {
      setPrefs(settings.data.preferences);
      const { city, region, latitude, longitude, timezone } = settings.data;
      setLoc({ city, region, latitude, longitude, timezone });
    }
  }, [settings.data, prefs]);

  const save = useMutation({
    mutationFn: async () => {
      const body: any = { preferences: prefs };
      if (loc?.city && loc.latitude != null && loc.longitude != null) Object.assign(body, { city: loc.city, region: loc.region, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone });
      return (await apiRequest("PUT", "/api/settings", body)).json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/settings"], data);
      queryClient.removeQueries({ queryKey: ["/api/today"] });
      toast({ title: "Préférences enregistrées", description: "Le conseil du jour a été recalculé." });
    },
    onError: (e: any) => toast({ title: "Enregistrement impossible", description: e.message, variant: "destructive" }),
  });

  if (!prefs || !loc) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const dirty = JSON.stringify(prefs) !== JSON.stringify(settings.data?.preferences) || loc.city !== settings.data?.city || loc.latitude !== settings.data?.latitude;
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setPrefs({ ...prefs, [k]: v });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Préférences</h1>
        <p className="text-sm text-muted-foreground">Ces réglages personnalisent le conseil. Ils sont conservés sur le serveur de l'application.</p>
      </div>

      <CityPicker loc={loc} onChange={setLoc} />

      <Section title="Sensibilité au froid" hint="Décale les seuils d'environ 3 °C.">
        <Choices name="sensitivity" value={prefs.sensitivity} options={LABELS.sensitivity} onChange={(v) => set("sensitivity", v as Preferences["sensitivity"])} />
      </Section>
      <Section title="Mode de déplacement" hint="À vélo : jamais de parapluie, et le vent compte davantage.">
        <Choices name="commute" value={prefs.commute} options={LABELS.commute} onChange={(v) => set("commute", v as Preferences["commute"])} />
      </Section>
      <Section title="Style de tenue" hint="Tenue de bureau : pas de short, chaussures de ville.">
        <Choices name="dressCode" value={prefs.dressCode} options={LABELS.dressCode} onChange={(v) => set("dressCode", v as Preferences["dressCode"])} />
      </Section>
      <Section title="Heures passées dehors" hint="Le conseil tient compte de la météo entre votre départ et votre retour.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Départ
            <HourSelect value={prefs.dayStart} onChange={(v) => set("dayStart", v)} max={22} testid="select-start" />
          </label>
          <label className="flex items-center gap-2">Retour
            <HourSelect value={prefs.dayEnd} onChange={(v) => set("dayEnd", v)} min={prefs.dayStart + 1} testid="select-end" />
          </label>
        </div>
      </Section>

      <div className={`${dirty ? "sticky bottom-20 md:bottom-4" : ""} z-10 flex justify-end`}>
        <Button size="lg" onClick={() => save.mutate()} disabled={!dirty || save.isPending || !loc.city} data-testid="button-save">
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          {dirty ? "Enregistrer" : "Enregistré"}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border bg-card p-5">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-base font-semibold" aria-hidden>{title}</h2>
      {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Choices({ name, value, options, onChange }: { name: string; value: string; options: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4" role="radiogroup">
      {Object.entries(options).map(([k, label]) => (
        <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${value === k ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted"}`}>
          <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} className="accent-[hsl(var(--primary))]" data-testid={`radio-${name}-${k}`} />
          {label}
        </label>
      ))}
    </div>
  );
}

function HourSelect({ value, onChange, min = 0, max = 23, testid }: { value: number; onChange: (v: number) => void; min?: number; max?: number; testid: string }) {
  return (
    <select className="rounded-md border bg-background px-2 py-1.5" value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testid}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((h) => <option key={h} value={h}>{h} h</option>)}
    </select>
  );
}

function CityPicker({ loc, onChange }: { loc: Loc; onChange: (l: Loc) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [geoMsg, setGeoMsg] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const results = useQuery<Place[]>({ queryKey: ["/api/cities?q=" + encodeURIComponent(debounced)], enabled: debounced.length >= 2, staleTime: 60_000 });

  const locate = () => {
    if (!navigator.geolocation) { setGeoMsg("La géolocalisation n'est pas disponible sur cet appareil."); return; }
    setGeoBusy(true); setGeoMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
          const r = await (await apiRequest("GET", `/api/locate?lat=${lat}&lon=${lon}`)).json();
          onChange({ city: "Ma position", region: `${lat}, ${lon} (arrondi ~1 km)`, latitude: lat, longitude: lon, timezone: r.timezone });
          setGeoMsg("Position trouvée. Pensez à enregistrer.");
        } catch (e: any) { setGeoMsg(e.message); } finally { setGeoBusy(false); }
      },
      () => { setGeoBusy(false); setGeoMsg("Position refusée ou indisponible. Recherchez votre ville à la place."); },
      { timeout: 10000, maximumAge: 600000 },
    );
  };

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="city-title">
      <h2 id="city-title" className="text-base font-semibold">Ville</h2>
      <p className="mb-3 flex items-center gap-1 text-sm">
        <MapPin className="h-4 w-4 text-primary" aria-hidden />
        {loc.city ? <span data-testid="text-current-city"><strong>{loc.city}</strong>{loc.region ? ` · ${loc.region}` : ""} <span className="text-muted-foreground">({loc.timezone})</span></span> : <span className="text-muted-foreground">Aucune ville choisie</span>}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder="Rechercher une ville (ex. Lyon)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher une ville" data-testid="input-city" />
        </div>
        <Button variant="outline" onClick={locate} disabled={geoBusy} data-testid="button-locate">
          {geoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Ma position
        </Button>
      </div>
      {geoMsg && <p className="mt-2 text-sm text-muted-foreground" role="status">{geoMsg}</p>}
      {debounced.length >= 2 && (
        <ul className="mt-3 divide-y rounded-lg border" data-testid="list-cities">
          {results.isLoading && <li className="p-3 text-sm text-muted-foreground">Recherche…</li>}
          {results.isError && <li className="p-3 text-sm text-destructive">Recherche indisponible (service météo injoignable).</li>}
          {results.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">Aucune ville trouvée.</li>}
          {results.data?.map((p, i) => (
            <li key={i}>
              <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted"
                onClick={() => { onChange({ city: p.name, region: [p.admin1, p.country].filter(Boolean).join(", "), latitude: p.latitude, longitude: p.longitude, timezone: p.timezone }); setQ(""); }}
                data-testid={`button-city-${i}`}>
                <span><strong>{p.name}</strong> <span className="text-muted-foreground">{[p.admin1, p.country].filter(Boolean).join(", ")}</span></span>
                <span className="text-xs text-muted-foreground">Choisir</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
