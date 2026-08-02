const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiOptions extends RequestInit {
  method?: ApiMethod;
}

export async function apiFetch<TResponse = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<TResponse> {
  if (!API_BASE_URL) {
    throw new Error("API base URL is not configured (VITE_API_BASE_URL).");
  }

  const url = `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && (data as any).message) ||
      `Request failed with status ${response.status}`;
    throw new Error(String(message));
  }

  return data as TResponse;
}

