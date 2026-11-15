import { expect, test } from "@playwright/test";

test("a Taobao listing reads its Chinese sizes and suggests one from your measurements", async ({
  page,
}) => {
  await page.goto("/dresser/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/discover/?q=puffer%20vest");
  const card = page.getByRole("article", { name: /Same paragraph puffer vest/ });
  await card.getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(/\/discover\/listing\//);

  const sizes = page.getByRole("region", { name: "Chinese sizes" });
  await expect(sizes.getByRole("rowheader")).toHaveText(["M", "L", "XL"]);
  await expect(sizes).toContainText("Enter your measurements");

  await sizes.getByLabel("Your height (cm)").fill("178");
  await sizes.getByLabel("Your chest (cm)").fill("96");
  await expect(sizes.getByText("Try XL.")).toBeVisible();
  await expect(sizes).toContainText("check the shop's size chart");

  // measurements stay on this device for the next listing
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Chinese sizes" }).getByLabel("Your height (cm)"),
  ).toHaveValue("178");
});
