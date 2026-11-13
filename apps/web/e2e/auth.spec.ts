import { expect, test } from "@playwright/test";

test("register, edit the style profile, survive a reload, sign out and back in", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "a sturdy passphrase";

  await page.goto("/register/");
  await page.getByLabel("Name").fill("Robin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dresser\/$/);
  await expect(page.getByRole("link", { name: /Robin/ })).toBeVisible();

  await page.goto("/settings/");
  const aesthetics = page.getByLabel("Aesthetics");
  await aesthetics.fill("Japanese streetwear");
  await aesthetics.press("Enter");
  await page.getByLabel("Top size").fill("M");
  await page.getByRole("button", { name: "Save style profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // a full reload restores the session from the httpOnly refresh cookie
  await page.reload();
  await expect(page.getByText("Japanese streetwear", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Top size")).toHaveValue("M");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

  await page.goto("/login/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Email or password is incorrect" }),
  ).toBeVisible();

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dresser\/$/);
});

test("registration shows field errors from the API", async ({ page }) => {
  await page.goto("/register/");
  await page.getByLabel("Name").fill("Sam");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("long enough password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible();
});
