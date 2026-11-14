import { expect, test } from "./fixtures";

test("the home page asks its question and leads to every tool", async ({ page, crashes, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What is changing");
  for (const name of ["Trends", "Atlas", "Analysis", "Explore"]) {
    await expect(page.locator("#tools").getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }
  if (isMobile) {
    await page.getByRole("button", { name: /menu/i }).click();
    await expect(page.getByRole("link", { name: "Atlas", exact: true }).last()).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Atlas", exact: true })).toBeVisible();
  }
  expect(crashes).toEqual([]);
});

test("the Trends page starts on its form and reads a search from its address", async ({ page, crashes }) => {
  await page.goto("/trends?ind=vegetation&dir=decline&place=Uzbekistan&t=since-2015&season=usual");
  await expect(page.getByText(/In words:/)).toContainText("Vegetation decline in Uzbekistan since 2015");
  await expect(page.getByRole("button", { name: /Find changes/ })).toBeVisible();
  expect(crashes).toEqual([]);
});

test("a page that doesn't exist says so and offers a way home", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Nothing was");
  await expect(page.getByText("/no-such-page")).toBeVisible();
});
