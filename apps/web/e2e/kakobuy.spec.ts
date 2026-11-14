import { expect, test } from "@playwright/test";

test("a Taobao listing with its original link can be bought via KakoBuy", async ({ page }) => {
  await page.goto("/discover/?q=black%20zip-up%20hoodie");
  await page.getByRole("link", { name: "Heavyweight black zip-up hoodie, oversized fit" }).click();
  await expect(page).toHaveURL(/\/discover\/listing\//);

  const route = page.getByRole("article", { name: "Buy via KakoBuy" });
  const buy = route.getByRole("link", { name: "Buy via KakoBuy" });
  await expect(buy).toHaveAttribute(
    "href",
    "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D700000000001",
  );
  await expect(buy).toHaveAttribute("rel", /sponsored/);
  await expect(route).toContainText("KakoBuy service fee");
  await expect(route).toContainText("Customs declaration (per parcel)");
  await expect(route).toContainText("not proof of authenticity");
});

test("listings advertised as replicas are never routed to KakoBuy", async ({ page }) => {
  await page.goto("/discover/?q=black%20zip-up%20hoodie");
  await page.getByRole("link", { name: /High imitation/ }).click();
  const route = page.getByRole("article", { name: "Buy via KakoBuy" });
  await expect(route).toContainText("KakoBuy prohibits buying counterfeits");
  await expect(route.getByRole("link", { name: "Buy via KakoBuy" })).toHaveCount(0);
});

test("paste a KakoBuy or Weidian link, buy it via KakoBuy or try it on", async ({ page }) => {
  await page.goto("/dresser/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/discover/");
  await page
    .getByLabel("Product link")
    .fill(
      "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D4123456789&affcode=abc",
    );
  await page.getByRole("button", { name: "Check link" }).click();
  const result = page.getByLabel("Link result");
  await expect(result).toContainText("Weidian item 4123456789");
  await expect(result.getByRole("link", { name: "Open on Weidian" })).toHaveAttribute(
    "href",
    "https://weidian.com/item.html?itemID=4123456789",
  );
  await expect(result.getByRole("link", { name: "Buy via KakoBuy" })).toHaveAttribute(
    "href",
    /kakobuy\.com\/item\/details\?url=https%3A%2F%2Fweidian\.com/,
  );

  await page.getByLabel("Try it on as").selectOption("cargo_pants");
  await result.getByRole("button", { name: "Try on" }).click();
  await page.getByRole("link", { name: "Open the dresser" }).last().click();
  await expect(page.getByRole("button", { name: /^Weidian item 4123456789/ })).toBeVisible();

  await page.goto("/discover/");
  await page.getByLabel("Product link").fill("https://m.tb.cn/h.short");
  await page.getByRole("button", { name: "Check link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "short link" })).toBeVisible();
});
