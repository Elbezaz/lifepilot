import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Jeton de session gardé en mémoire (le cookie sécurisé prend le relais sur le site publié).
let token = "";
export const setToken = (t: string) => { token = t; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any) { super(message); }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, body?.message || res.statusText || "Erreur", body);
  }
}

const headers = (json: boolean): Record<string, string> => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { "x-lp-token": token } : {}),
});

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method, headers: headers(data !== undefined), body: data !== undefined ? JSON.stringify(data) : undefined, credentials: "include",
  });
  await throwIfResNotOk(res);
  return res;
}

export const getQueryFn: <T>(options: { on401: "returnNull" | "throw" }) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, { headers: headers(false), credentials: "include" });
    if (on401 === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { queryFn: getQueryFn({ on401: "throw" }), refetchInterval: false, refetchOnWindowFocus: false, staleTime: Infinity, retry: false },
    mutations: { retry: false },
  },
});
