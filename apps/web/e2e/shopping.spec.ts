import { expect, test, type Page } from "@playwright/test";

const HOODIE = "Heavyweight black zip-up hoodie, oversized fit";

async function signUp(page: Page) {
  await page.goto("/dresser/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/register/");
  await page.getByLabel("Name").fill("Mika");
  await page
    .getByLabel("Email")
    .fill(`shop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`);
  await page.getByLabel("Password").fill("a sturdy passphrase");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dresser\/$/);
}

test("save, open the listing page, find alternatives and try one on", async ({ page }) => {
  await signUp(page);
  await page.goto("/discover/?q=black%20zip-up%20hoodie");
  const card = page.getByRole("article", { name: HOODIE });
  await card.getByRole("button", { name: `Save ${HOODIE}` }).click();
  await expect(card.getByRole("button", { name: `Remove ${HOODIE} from saved` })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await card.getByRole("link", { name: HOODIE }).click();
  await expect(page).toHaveURL(/\/discover\/listing\/\?id=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HOODIE);
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/First seen at/)).toBeVisible();
  await expect(
    page.getByText("Sold by the brand's official flagship store", { exact: false }),
  ).toBeVisible();

  const alternatives = page.getByRole("region", { name: "Similar & cheaper" });
  const demoAlt = alternatives.getByRole("article", {
    name: "Oversized zip-up hoodie, heavyweight fleece",
  });
  await expect(demoAlt).toBeVisible();
  await expect(alternatives.getByText(/% match \(estimate\)/).first()).toBeVisible();
  await expect(alternatives.getByRole("article", { name: /High imitation/ })).toHaveCount(0);

  await demoAlt.getByRole("button", { name: "Try on" }).click();
  await expect(page).toHaveURL(/\/dresser\/$/);
  await expect(
    page.getByRole("button", { name: /^Oversized zip-up hoodie, heavyweight fleece/ }),
  ).toBeVisible();
});

test("save a look to the account and reopen it from Saved Outfits", async ({ page }) => {
  await signUp(page);
  await page.goto("/discover/?q=black%20zip-up%20hoodie");
  await page.getByRole("article", { name: HOODIE }).getByRole("button", { name: "Try on" }).click();
  await page.getByRole("link", { name: "Open the dresser" }).click();

  await page.getByLabel("Save this look").fill("Black layers");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to your account." }),
  ).toBeVisible();

  await page.goto("/outfits/");
  const look = page.getByRole("article", { name: "Black layers" });
  await expect(look).toContainText(HOODIE);
  await expect(look).toContainText("Taobao");
  await expect(look).toContainText("¥239.00");

  // wipe the local look, then restore it from the account
  await page.evaluate(() => localStorage.clear());
  await page.goto("/outfits/");
  await page
    .getByRole("article", { name: "Black layers" })
    .getByRole("button", { name: "Open in dresser" })
    .click();
  await expect(page).toHaveURL(/\/dresser\/$/);
  await expect(page.getByRole("heading", { name: /Now wearing · 5/ })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`^${HOODIE}`) })).toBeVisible();
});

test("shopping history shows searches, viewed listings and saved items, and can be cleared", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/discover/?q=boots");
  const first = page.getByRole("article").first();
  await first.getByRole("button", { name: /^Save / }).click();
  await first.getByRole("heading").getByRole("link").click();
  await expect(page).toHaveURL(/\/discover\/listing\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto("/history/");
  await expect(page.getByRole("heading", { name: "Saved · 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^boots/ })).toHaveAttribute(
    "href",
    /\/discover\/\?q=boots/,
  );
  await expect(page.getByText("Viewed")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved · 1" })).toBeVisible(); // saved items are kept
});
