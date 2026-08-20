import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("https://context-budget-lab.vercel.app", { waitUntil: "networkidle" });
  await page.waitForSelector("text=send everything");

  // Swayam's exact flow: his own wording, slider at 13000.
  const box = page.locator('input[type=text], input:not([type])').first();
  await box.fill("what is revalidation");
  await page.locator('input[type=range]').fill("13000");
  await page.waitForTimeout(3000);

  console.log("hint:", (await page.locator("text=/Press \\+ on a chunk/").first().textContent())?.trim());

  // Before marking anything.
  await page.getByRole("button", { name: "Find minimum context" }).click();
  await page.waitForTimeout(3500);
  console.log("unmarked ->", (await page.locator("text=/saturates at/").first().textContent())?.trim());

  // Mark the first kept chunk, then ask again.
  const firstRow = page.locator('button[aria-pressed]').first();
  const rowLabel = await firstRow.locator("xpath=following-sibling::span[1]").textContent();
  await firstRow.click();
  await page.waitForTimeout(400);
  console.log("marked:", rowLabel?.trim(), "| counter:", (await page.locator("text=/marked as containing/").first().textContent())?.trim());

  await page.getByRole("button", { name: "Find minimum context" }).click();
  await page.waitForTimeout(6000);
  console.log("marked   ->", (await page.locator("text=/retrieved at|No budget up to/").first().textContent())?.trim());
  console.log("caveat   ->", (await page.locator("text=/not a pre-registered/").first().textContent())?.trim());

  console.log("page errors:", errs.length ? errs : "none");
  await browser.close();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
