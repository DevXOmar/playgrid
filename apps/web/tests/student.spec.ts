import { test, expect } from "@playwright/test";

test("student can browse facilities", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("ONE COURT.")).toBeVisible();
  await page.getByRole("link", { name: /Book a Facility/i }).first().click();
  await expect(page.getByRole("heading", { name: "Find your court" })).toBeVisible();
});
