import { expect, test } from "@playwright/test";

const PAGES: [string, RegExp][] = [
  ["Discover", /Find it anywhere/],
  ["AI Stylist", /Ask for a look/],
  ["My Wardrobe", /Everything you own/],
  ["Saved Outfits", /Looks worth keeping/],
  ["Shopping History", /Everything you looked at/],
];

test("every main section is reachable from the rail", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Search every store");
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  for (const [label, heading] of PAGES) {
    await nav.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
  }
  await nav.getByRole("link", { name: "3D Dresser" }).click();
  await expect(page.getByTestId("dresser-canvas")).toBeVisible();
});

test("home shows live marketplace status from the API", async ({ page }) => {
  await page.goto("/");
  const ebay = page.getByRole("listitem").filter({ hasText: "eBay" });
  await expect(ebay).toContainText("Planned");
  await expect(page.getByRole("listitem").filter({ hasText: "Depop" })).toContainText(
    "Needs partnership",
  );
});

test("account pages ask guests to sign in instead of showing data", async ({ page }) => {
  await page.goto("/wardrobe/");
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
});

test("unknown routes render the 404 page", async ({ page }) => {
  const res = await page.goto("/definitely-not-here/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not in this collection.");
});
