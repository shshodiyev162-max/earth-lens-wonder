import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "../ThemeProvider";
import { useTheme } from "../theme";

function Toggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });

  it("always starts in dark mode", () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("switches to light and back, without saving the choice", () => {
    render(
      <ThemeProvider>
        <Toggle />
      </ThemeProvider>,
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => screen.getByRole("button").click());
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.length).toBe(0);
  });

  it("falls back to dark outside the provider", () => {
    render(<Toggle />);
    expect(screen.getByRole("button")).toHaveTextContent("dark");
  });
});
