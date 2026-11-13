import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dresser/");
  await page.evaluate(() => localStorage.clear());
});

test("searches Taobao (mock gateway) in Chinese and labels every result honestly", async ({
  page,
}) => {
  await page.goto("/discover/");
  await page.getByRole("searchbox").fill("black zip-up hoodie");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/discover\/\?q=black%20zip-up%20hoodie/);

  const strip = page.getByLabel("Marketplaces searched");
  await expect(strip).toContainText("Taobao 3 results");
  await expect(strip).toContainText("拉链连帽卫衣 黑色");

  const tmall = page.getByRole("article", {
    name: "Heavyweight black zip-up hoodie, oversized fit",
  });
  await expect(tmall).toContainText("Tmall");
  await expect(tmall).toContainText("Brand / authorized");
  await expect(tmall).toContainText("Machine-translated title");
  await expect(tmall.getByRole("link", { name: /View on Taobao/ })).toHaveAttribute(
    "rel",
    /sponsored/,
  );

  await expect(page.getByRole("article", { name: /High imitation/ })).toContainText(
    "Listed as replica",
  );
  await expect(page.getByRole("article", { name: /Same paragraph puffer vest/ })).toContainText(
    "Look-alike, not the brand",
  );
  // the dev-only sample catalog is clearly marked
  await expect(page.getByRole("article").filter({ hasText: "Demo data" }).first()).toBeVisible();
  await expect(page.getByText(/may be affiliate links/)).toBeVisible();
});

test("try on a Taobao result: approximate preview with the exact original price", async ({
  page,
}) => {
  await page.goto("/discover/?q=black%20zip-up%20hoodie");
  const tmall = page.getByRole("article", {
    name: "Heavyweight black zip-up hoodie, oversized fit",
  });
  await tmall.getByRole("button", { name: "Try on" }).click();
  await page.getByRole("link", { name: "Open the dresser" }).click();

  await expect(page.getByTestId("dresser-canvas")).toBeVisible();
  // try-on selects the new piece, so its details are already open
  await expect(
    page.getByRole("button", { name: /^Heavyweight black zip-up hoodie/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const details = page.getByRole("region", { name: "Selected item" });
  await expect(details).toContainText("Approximate preview");
  await expect(details).toContainText("Taobao");
  await expect(details).toContainText("239.00 CNY");
  await expect(details.getByRole("link", { name: /original listing/ })).toHaveAttribute(
    "href",
    /intl\.taobao\.com/,
  );
  await expect(page.getByRole("region", { name: "Outfit price" })).toContainText("239.00 CNY");

  // survives a reload on this device
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Heavyweight black zip-up hoodie/ }),
  ).toBeVisible();
});
