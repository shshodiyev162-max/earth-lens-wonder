import { afterEach, describe, expect, it, vi } from "vitest";
import { printReport } from "../export";

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.add("dark");
});

describe("printReport", () => {
  it("opens the browser's print dialog on white paper, then puts the dark colours back", () => {
    document.documentElement.classList.add("dark");
    const print = vi.fn(() => {
      // While the dialog is open the page is in the light colours.
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
    vi.stubGlobal("print", print);
    printReport();
    expect(print).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("leaves a light page light", () => {
    document.documentElement.classList.remove("dark");
    vi.stubGlobal("print", vi.fn());
    printReport();
    window.dispatchEvent(new Event("afterprint"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
