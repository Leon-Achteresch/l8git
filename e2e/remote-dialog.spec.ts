import { expect, test, type Locator } from "@playwright/test";

async function expectInside(child: Locator, parent: Locator) {
  const childBox = await child.boundingBox();
  const parentBox = await parent.boundingBox();
  expect(childBox).toBeTruthy();
  expect(parentBox).toBeTruthy();
  if (!childBox || !parentBox) return;
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x);
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 0.5);
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(parentBox.y + parentBox.height + 0.5);
}

async function expectNoOverflow(dialog: Locator) {
  const sizes = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width);
  expect(sizes.scrollHeight).toBeLessThanOrEqual(sizes.height);
}

test.describe("remote dialog layout and interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 588, height: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?scene=remote-dialog&lang=de", { waitUntil: "domcontentloaded" });
  });

  test("keeps the empty-remote CTA and fields inside the modal", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Remote bearbeiten" });
    await expect(dialog).toBeVisible();
    await expectInside(dialog.getByRole("button", { name: /Bei einem Anbieter erstellen/ }), dialog);
    await expectInside(dialog.getByLabel("Name"), dialog);
    await expectInside(dialog.getByLabel("URL"), dialog);
    await expectNoOverflow(dialog);

    const viewport = page.viewportSize();
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    if (viewport && box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  test("supports editing, validation, closing, and reopening", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Remote bearbeiten" });
    await dialog.getByLabel("Name").fill("upstream");
    await dialog.getByLabel("URL").fill("");
    await dialog.getByRole("button", { name: "Hinzufügen" }).click();
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Remote-URL darf nicht leer sein." });
    await expect(toast).toBeVisible();
    await expectNoOverflow(dialog);
    await toast.getByRole("button", { name: "Close toast" }).click();

    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Open remote dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Remote bearbeiten" })).toBeVisible();
  });
});
