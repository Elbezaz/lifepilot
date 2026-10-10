export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  // Soleil levant sur l'horizon + aiguille de cap : « piloter sa journée ».
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-label="LifePilot" role="img">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M7 21a9 9 0 0 1 18 0" className="stroke-primary-foreground" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 25h22" className="stroke-primary-foreground" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 21l4.5-8" stroke="#f0a43a" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
