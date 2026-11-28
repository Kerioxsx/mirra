import { expect, test, type Page } from "@playwright/test";

const wearing = (page: Page) => page.getByRole("heading", { name: /Now wearing/ });

test.beforeEach(async ({ page }) => {
  await page.goto("/dresser/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("dresser-canvas")).toBeVisible();
});

test("renders the 3D stage with the starter look", async ({ page }) => {
  await expect(wearing(page)).toHaveText("Now wearing · 5");
  // the downloaded avatar has loaded (its status line goes away)
  await expect(page.getByRole("status").filter({ hasText: "avatar" })).toHaveCount(0);
  // the WebGL canvas actually draws something (not a blank frame)
  await page.waitForTimeout(1500);
  const painted = await page
    .getByTestId("dresser-canvas")
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => {
      const probe = document.createElement("canvas");
      probe.width = 64;
      probe.height = 64;
      const ctx = probe.getContext("2d")!;
      ctx.drawImage(c, 0, 0, 64, 64);
      const px = ctx.getImageData(0, 0, 64, 64).data;
      const colours = new Set<number>();
      for (let i = 0; i < px.length; i += 4)
        colours.add((px[i]! >> 4) * 256 + (px[i + 1]! >> 4) * 16 + (px[i + 2]! >> 4));
      return colours.size;
    });
  expect(painted).toBeGreaterThan(8);
});

test("layers, replaces, undoes and redoes", async ({ page }) => {
  await page.getByRole("button", { name: "Coats", exact: true }).click();
  await expect(wearing(page)).toHaveText("Now wearing · 6");
  await page.getByRole("button", { name: "Tank tops", exact: true }).click(); // replaces the T-shirt slot
  await expect(wearing(page)).toHaveText("Now wearing · 6");
  await expect(page.getByRole("status").filter({ hasText: "Took off T-shirt" })).toBeVisible();

  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: "T-shirt", exact: false }).first()).toBeVisible();
  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByRole("button", { name: "Tank tops", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a dress takes off the base top and bottoms and explains why", async ({ page }) => {
  await page.getByRole("button", { name: "Dresses", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /covers the (legs|torso)/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Baggy pants", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("selecting an item shows its fidelity and lets you recolour it", async ({ page }) => {
  // the "Now wearing" entry, not the "Zip-ups" category tile (which would take it off)
  await page.getByRole("button", { name: /^Zip-up generic/ }).click();
  const details = page.getByRole("region", { name: "Selected item" });
  await expect(details).toContainText("Generic");
  await expect(details).toContainText("Not linked to a product");
  await details.getByRole("button", { name: "Burgundy" }).click();
  await expect(details.getByRole("button", { name: "Burgundy" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the look survives a reload on this device", async ({ page }) => {
  await page.getByRole("button", { name: "Caps", exact: true }).click(); // replaces the beanie
  await page.getByRole("button", { name: "Watches", exact: true }).click();
  await expect(wearing(page)).toHaveText("Now wearing · 6");
  await page.reload();
  await expect(wearing(page)).toHaveText("Now wearing · 6");
  await expect(page.getByRole("button", { name: "Caps", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("switches between the female and male bodies", async ({ page }) => {
  await page.getByRole("tab", { name: "Avatar" }).first().click();
  const male = page.waitForResponse((r) => r.url().endsWith("/avatars/male.glb") && r.ok());
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await male;
  await expect(page.getByRole("radio", { name: "Male", exact: true })).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: "avatar" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Buzz", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Avatar" }).first().click();
  await expect(page.getByRole("radio", { name: "Male", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Buzz", exact: true })).toBeChecked();
});
