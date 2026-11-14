import { test as base, expect } from "@playwright/test";

/**
 * Every test page has outside services switched off (NASA, OpenStreetMap, NOAA, fonts are bundled),
 * so the tests check TerraScope itself and give the same answer whether or not NASA is reachable.
 * `crashes` collects anything the page threw that nothing caught.
 */
export const test = base.extend<{ crashes: string[] }>({
  page: async ({ page }, provide) => {
    await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
    await provide(page);
  },
  crashes: async ({ page }, provide) => {
    const crashes: string[] = [];
    page.on("pageerror", (error) => crashes.push(error.message));
    await provide(crashes);
  },
});

export { expect };
