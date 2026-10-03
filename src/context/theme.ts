import { createContext, useContext } from "react";

export type Theme = "dark" | "light";

export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeState | null>(null);

// Outside <ThemeProvider> (e.g. a single component in a test) everything is dark, like the default.
const DARK_FALLBACK: ThemeState = { theme: "dark", setTheme: () => {}, toggleTheme: () => {} };

export function useTheme(): ThemeState {
  return useContext(ThemeContext) ?? DARK_FALLBACK;
}
