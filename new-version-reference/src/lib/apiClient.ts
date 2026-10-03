const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || undefined;

/** Without a backend the app runs fully client-side and accounts are disabled. */
export function isDemoMode(): boolean {
  return !API_BASE_URL;
}

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiOptions extends RequestInit {
  method?: ApiMethod;
}

export async function apiFetch<TResponse = unknown>(path: string, options: ApiOptions = {}): Promise<TResponse> {
  if (!API_BASE_URL) {
    throw new Error("API base URL is not configured (VITE_API_BASE_URL).");
  }

  const url = `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && (data as { message?: unknown }).message) || `Request failed with status ${response.status}`;
    throw new Error(String(message));
  }

  return data as TResponse;
}
