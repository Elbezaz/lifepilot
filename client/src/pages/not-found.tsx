import { Link } from "wouter";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <h1 className="text-lg font-semibold">Page introuvable</h1>
      <Button asChild className="mt-4"><Link href="/">Retour à l'accueil</Link></Button>
    </div>
  );
}
