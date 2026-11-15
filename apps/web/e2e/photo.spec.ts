import { expect, test } from "@playwright/test";

test("search with a photo: colours read on the device, the type picked by the shopper", async ({
  page,
}) => {
  await page.goto("/discover/");
  // a plain olive photo, made in the browser
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 150;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#6c6e34";
    ctx.fillRect(0, 0, 120, 150);
    return c.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1]!, "base64");

  await page.getByRole("button", { name: "Photo" }).click();
  const panel = page.getByRole("region", { name: "Search with a photo" });
  await panel.getByLabel("Photo", { exact: true }).setInputFiles({
    name: "vest.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(panel.getByText("Main colours: olive")).toBeVisible();
  await panel.getByLabel("What is it?").selectOption("vest");
  await panel.getByRole("button", { name: "Search with this photo" }).click();

  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("“olive vest”")).toBeVisible();
  await expect(results).toContainText("by its colours and the type you picked");
  await expect(results.getByRole("article").first()).toBeVisible();

  // a photo with no type and no photo reader on the server asks for the type
  await panel.getByLabel("What is it?").selectOption("");
  await panel.getByRole("button", { name: "Search with this photo" }).click();
  await expect(panel.getByRole("alert")).toHaveText(/Pick what kind of piece/);
});
