import { useEffect, useState } from "react";
import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, setToken } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { Sun, Moon, CalendarDays, SlidersHorizontal, BellRing, Lock } from "lucide-react";
import TodayPage from "@/pages/today";
import PreferencesPage from "@/pages/preferences";
import NotificationsPage from "@/pages/notifications";
import NotFound from "@/pages/not-found";

const NAV = [
  { href: "/", label: "Aujourd'hui", icon: CalendarDays },
  { href: "/preferences", label: "Préférences", icon: SlidersHorizontal },
  { href: "/notifications", label: "Notifications", icon: BellRing },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  return (
    <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"} data-testid="button-theme">
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <Logo className="h-8 w-8" />
            <span className="font-display text-lg font-bold">LifePilot</span>
          </Link>
          <nav className="ml-6 hidden gap-1 md:flex" aria-label="Navigation principale">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${loc === n.href ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-current={loc === n.href ? "page" : undefined} data-testid={`nav-${n.href.slice(1) || "today"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted-foreground">
        Données météo : <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (licence CC BY 4.0). Conseils générés par des règles fixes, sans IA.
      </footer>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t bg-background/95 backdrop-blur md:hidden" aria-label="Navigation mobile">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={loc === n.href ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium ${loc === n.href ? "text-primary" : "text-muted-foreground"}`}>
            <n.icon className="h-5 w-5" aria-hidden />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const auth = useQuery<{ required: boolean; authenticated: boolean }>({ queryKey: ["/api/auth"] });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.isLoading) return <div className="grid min-h-dvh place-items-center text-muted-foreground">Chargement…</div>;
  if (auth.isError) return <div className="grid min-h-dvh place-items-center p-6 text-center">Le serveur LifePilot ne répond pas. Réessayez dans un instant.</div>;
  if (auth.data?.authenticated) return <>{children}</>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await apiRequest("POST", "/api/login", { code });
      setToken((await r.json()).token);
      await queryClient.invalidateQueries();
    } catch (err: any) { setError(err.message || "Code incorrect"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6">
        <div className="flex items-center gap-2"><Logo /><span className="font-display text-lg font-bold">LifePilot</span></div>
        <p className="text-sm text-muted-foreground"><Lock className="mr-1 inline h-4 w-4" aria-hidden />Espace personnel. Entrez votre code d'accès.</p>
        <label className="block text-sm font-medium" htmlFor="code">Code d'accès</label>
        <Input id="code" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} data-testid="input-code" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy || !code} data-testid="button-login">{busy ? "Vérification…" : "Entrer"}</Button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Gate>
          <Router hook={useHashLocation}>
            <Shell>
              <Switch>
                <Route path="/" component={TodayPage} />
                <Route path="/preferences" component={PreferencesPage} />
                <Route path="/notifications" component={NotificationsPage} />
                <Route component={NotFound} />
              </Switch>
            </Shell>
          </Router>
        </Gate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
