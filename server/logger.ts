// Journalisation simple, horodatée, avec niveaux. Garde les 200 dernières lignes en mémoire
// pour l'écran d'état. Ne jamais y écrire de secret.
type Level = "info" | "warn" | "error";
export interface LogLine { at: string; level: Level; scope: string; message: string }
const buffer: LogLine[] = [];
const quiet = process.env.LOG_QUIET === "1";

function write(level: Level, scope: string, message: string) {
  const line = { at: new Date().toISOString(), level, scope, message };
  buffer.push(line);
  if (buffer.length > 200) buffer.shift();
  if (!quiet) (level === "error" ? console.error : console.log)(`${line.at} ${level.toUpperCase()} [${scope}] ${message}`);
}

export const logger = {
  info: (s: string, m: string) => write("info", s, m),
  warn: (s: string, m: string) => write("warn", s, m),
  error: (s: string, m: string) => write("error", s, m),
  recent: (n = 50) => buffer.slice(-n),
};
