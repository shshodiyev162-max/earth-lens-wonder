import { ATLAS } from "../src/lib/atlas/atlasData";
import { expect, test } from "./fixtures";

// The atlas is bundled with the app, so it works fully with outside services switched off.

test("the atlas shows where each measure changed most, and opens one change on the Trends page", async ({ page, crashes, isMobile }) => {
  await page.goto("/atlas");
  if (isMobile) await page.getByRole("button", { name: "Controls" }).click();

  const panel = page.getByRole("complementary", { name: "Atlas controls" });
  await expect(panel.getByRole("heading", { level: 2, name: /^Vegetation, 2003–20\d\d$/ })).toBeVisible();
  const changes = panel.getByRole("list", { name: "Biggest changes, largest first" }).getByRole("listitem");
  await expect(changes.first()).toBeVisible();
  expect(await changes.count()).toBeGreaterThan(2);

  await panel.getByRole("button", { name: "Sea temperature" }).click();
  await expect(page).toHaveURL(/[?&]m=sst/);
  await expect(panel.getByRole("heading", { level: 2, name: /^Sea temperature, / })).toBeVisible();

  const first = changes.first();
  const name = (await first.locator("[translate=no]").textContent())?.trim() ?? "";
  await first.getByRole("button").click();
  await first.getByRole("link", { name: /Look closer on the Trends page/ }).click();

  await expect(page).toHaveURL(/\/trends\?.*ind=sst.*poly=/);
  await expect(page.getByText(/In words:/)).toContainText(name);
  expect(crashes).toEqual([]);
});

test("switching measure moves the outlines to the new measure's changes", async ({ page, isMobile }) => {
  test.skip(isMobile, "The panel covers the map on a phone; the map itself is the same.");
  await page.goto("/atlas");
  const changeMap = page.locator("img.trend-grid-image");
  const outlines = page.locator(".leaflet-trend-hotspots-pane path");
  await expect(changeMap).toBeVisible();
  await expect(outlines.first()).toBeVisible();

  // Where a longitude falls on screen: the change map spans 180°W to 180°E.
  const screenX = async (longitude: number) => {
    const box = (await changeMap.boundingBox())!;
    return box.x + ((longitude + 180) / 360) * box.width;
  };
  const westEdge = async () => (await outlines.first().boundingBox())!.x;

  // Each measure's biggest change, where the atlas data puts its western edge.
  const westOf = (id: string) => ATLAS.measures.find((m) => m.id === id)!.hotspots[0].bbox[0];
  for (const [id, label] of [["heat", "Surface heat"], ["sst", "Sea temperature"], ["vegetation", "Vegetation"]]) {
    await page.getByRole("button", { name: label }).click();
    await expect.poll(async () => Math.abs((await westEdge()) - (await screenX(westOf(id))))).toBeLessThan(8);
  }
});

test("the atlas keeps the measure in its address", async ({ page, isMobile }) => {
  await page.goto("/atlas?m=snow");
  if (isMobile) await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByRole("button", { name: "Snow cover" })).toHaveAttribute("aria-pressed", "true");
});
