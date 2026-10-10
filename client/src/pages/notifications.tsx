import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PublicSettings, Status } from "@/lib/types";
import { BellRing, Copy, Send, Smartphone, Clock, ShieldCheck, Trash2, RefreshCw, CloudOff, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";

const STATUS_LABEL: Record<string, string> = { sent: "Envoyée", fallback: "Envoyée (météo indisponible)", failed: "Échec, nouvel essai prévu", pending: "En cours" };

export default function NotificationsPage() {
  const settings = useQuery<PublicSettings>({ queryKey: ["/api/settings"] });
  const status = useQuery<Status>({ queryKey: ["/api/status"], staleTime: 0, refetchInterval: 60_000 });
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("07:00");
  useEffect(() => { if (settings.data) { setEnabled(settings.data.notifyEnabled); setTime(settings.data.notifyTime); } }, [settings.data]);

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/settings", { notifyEnabled: enabled, notifyTime: time })).json(),
    onSuccess: (d) => { queryClient.setQueryData(["/api/settings"], d); status.refetch(); toast({ title: "Réglages enregistrés", description: enabled ? `Notification chaque jour à ${time}.` : "Notifications désactivées." }); },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/notify/test")).json(),
    onSuccess: () => toast({ title: "Notification de test envoyée", description: "Elle doit arriver sur votre téléphone d'ici quelques secondes." }),
    onError: (e: any) => toast({ title: "Envoi impossible", description: e.message, variant: "destructive" }),
  });
  const regen = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/topic/regenerate")).json(),
    onSuccess: (d) => { queryClient.setQueryData(["/api/settings"], d); toast({ title: "Nouveau canal créé", description: "Abonnez-vous au nouveau sujet dans l'app ntfy." }); },
  });
  const wipe = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/data")).json(),
    onSuccess: () => { queryClient.clear(); window.location.hash = "#/"; toast({ title: "Données supprimées" }); },
  });
  const [diag, setDiag] = useState<string>("");
  const simulate = async () => {
    setDiag("Test en cours…");
    try { await apiRequest("GET", "/api/today?simulate=down"); setDiag("Inattendu : la panne simulée n'a pas été détectée."); }
    catch (e: any) { setDiag(`Résultat : « ${e.message} ». L'application affiche ce message au lieu d'inventer un conseil, puis réessaie automatiquement.`); }
  };

  if (!settings.data) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>;
  const s = settings.data;
  const topicUrl = `${s.ntfyServer}/${s.ntfyTopic}`;
  const dirty = enabled !== s.notifyEnabled || time !== s.notifyTime;
  const copy = async () => { try { await navigator.clipboard.writeText(s.ntfyTopic); toast({ title: "Nom du canal copié" }); } catch { toast({ title: "Copie impossible", description: "Sélectionnez le texte et copiez-le à la main." }); } };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Recevez chaque matin votre conseil sur votre téléphone, via l'application gratuite ntfy.</p>
      </div>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="sched-title">
        <h2 id="sched-title" className="flex items-center gap-2 text-base font-semibold"><Clock className="h-4 w-4 text-primary" aria-hidden />Programmation</h2>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-enabled" aria-label="Activer la notification quotidienne" />
            Notification quotidienne
          </label>
          <label className="flex items-center gap-2 text-sm">Heure
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" step={60} data-testid="input-time" />
          </label>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="button-save-notif">{dirty ? "Enregistrer" : "Enregistré"}</Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Heure de {s.city || "votre ville"} ({s.timezone}), changement d'heure été/hiver inclus. Il est {status.data?.localTime ?? "…"} là-bas.
          Envoi en général dans les 10 minutes suivant l'heure choisie (au plus tard 3 h après en cas d'incident), jamais deux fois le même jour.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="ntfy-title">
        <h2 id="ntfy-title" className="flex items-center gap-2 text-base font-semibold"><Smartphone className="h-4 w-4 text-primary" aria-hidden />Recevoir sur votre téléphone</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
          <li>Installez l'application gratuite <strong>ntfy</strong> :{" "}
            <a className="text-primary underline" href="https://apps.apple.com/us/app/ntfy/id1625396347" target="_blank" rel="noreferrer">iPhone (App Store)</a> ·{" "}
            <a className="text-primary underline" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">Android (Google Play)</a> ·{" "}
            <a className="text-primary underline" href={topicUrl} target="_blank" rel="noreferrer">ou dans le navigateur</a>. Aucun compte n'est nécessaire.</li>
          <li>Dans l'app, touchez <strong>+</strong> (« S'abonner à un sujet »), collez ce nom de canal, puis validez :
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm" data-testid="text-topic">{s.ntfyTopic}</code>
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copier le nom du canal" data-testid="button-copy"><Copy className="h-4 w-4" /></Button>
            </div>
          </li>
          <li>Autorisez les notifications quand le téléphone le demande, puis testez :
            <div className="mt-2"><Button onClick={() => test.mutate()} disabled={test.isPending} data-testid="button-test">
              {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Envoyer une notification de test
            </Button></div>
          </li>
        </ol>
        <p className="mt-4 flex gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          Ce nom de canal fait office de mot de passe : quiconque le connaît peut lire vos notifications. Ne le partagez pas. En cas de doute,
          <button className="underline" onClick={() => regen.mutate()} data-testid="button-regen">générez-en un nouveau</button>.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="hist-title">
        <div className="flex items-center justify-between">
          <h2 id="hist-title" className="flex items-center gap-2 text-base font-semibold"><BellRing className="h-4 w-4 text-primary" aria-hidden />Historique des envois</h2>
          <Button variant="ghost" size="sm" onClick={() => status.refetch()} aria-label="Actualiser"><RefreshCw className={`h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} /></Button>
        </div>
        {status.data?.deliveries.length ? (
          <ul className="mt-3 divide-y text-sm" data-testid="list-deliveries">
            {status.data.deliveries.map((d) => (
              <li key={d.day} className="flex items-start gap-2 py-2">
                {d.status === "failed" ? <XCircle className="h-4 w-4 shrink-0 translate-y-0.5 text-destructive" /> : <CheckCircle2 className="h-4 w-4 shrink-0 translate-y-0.5 text-emerald-600" />}
                <span className="tabular w-24 shrink-0">{new Date(d.day + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                <span className="min-w-0"><span className="font-medium">{STATUS_LABEL[d.status] ?? d.status}</span><span className="block truncate text-muted-foreground">{d.detail}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">Aucun envoi programmé pour l'instant.</p>}
        {status.data?.lastTick && <p className="mt-3 text-xs text-muted-foreground">Dernière vérification automatique : {new Date(status.data.lastTick.at).toLocaleTimeString("fr-FR", { timeZone: s.timezone, hour: "2-digit", minute: "2-digit" })} ({status.data.lastTick.source}).</p>}
      </section>

      <section className="rounded-xl border bg-card p-5 text-sm" aria-labelledby="limits-title">
        <h2 id="limits-title" className="flex items-center gap-2 text-base font-semibold"><Info className="h-4 w-4 text-primary" aria-hidden />Bon à savoir</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li><strong className="text-foreground">iPhone :</strong> utilisez l'app ntfy (fiable). Les notifications web directes exigeraient iOS 16.4+ et l'ajout du site à l'écran d'accueil ; elles ne sont pas utilisées.</li>
          <li><strong className="text-foreground">Android :</strong> si les notifications arrivent en retard, désactivez l'optimisation de batterie pour ntfy.</li>
          <li><strong className="text-foreground">Ordinateur :</strong> ouvrez le canal dans un onglet du navigateur et autorisez les notifications (l'onglet doit rester ouvert).</li>
          <li>Mode Concentration / Ne pas déranger : la notification est reçue mais peut rester silencieuse.</li>
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-5" aria-labelledby="diag-title">
        <h2 id="diag-title" className="flex items-center gap-2 text-base font-semibold"><CloudOff className="h-4 w-4 text-primary" aria-hidden />Diagnostic</h2>
        <p className="mt-1 text-sm text-muted-foreground">Vérifiez le comportement de l'application si le service météo tombe en panne.</p>
        <Button variant="outline" className="mt-3" onClick={simulate} data-testid="button-simulate">Simuler une panne météo</Button>
        {diag && <p className="mt-3 text-sm" role="status" data-testid="text-diag">{diag}</p>}
      </section>

      <section className="rounded-xl border border-destructive/30 bg-card p-5" aria-labelledby="data-title">
        <h2 id="data-title" className="text-base font-semibold">Vos données</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          LifePilot conserve uniquement : votre ville (ou une position arrondie à ~1 km), vos préférences, l'heure de notification, le nom du canal ntfy
          et les 30 derniers envois. Aucun nom, e-mail ni historique de position. Le texte des notifications transite par le service ntfy.sh.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="mt-3 text-destructive" data-testid="button-wipe"><Trash2 className="mr-2 h-4 w-4" />Supprimer toutes mes données</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer toutes vos données ?</AlertDialogTitle>
              <AlertDialogDescription>Ville, préférences, réglages et historique seront effacés définitivement. Les notifications s'arrêteront.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => wipe.mutate()} data-testid="button-wipe-confirm">Supprimer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
