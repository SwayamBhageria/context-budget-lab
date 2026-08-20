import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("https://context-budget-lab.vercel.app", { waitUntil: "networkidle" });
  await page.waitForSelector("text=send everything");

  // Exactly the flow reported: type your own question, then click the button.
  const box = page.locator('input[type=text], input:not([type])').first();
  await box.fill("how does the cache provider work?");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Find minimum context" }).click();
  await page.waitForTimeout(4000);
  const custom = (await page.locator("text=/saturates at|Every anchor retrieved|No budget up to/").first().textContent())?.trim();
  console.log("CUSTOM QUESTION ->", custom);
  console.log("  follow-up    ->", (await page.locator("text=/No verified minimum/").first().textContent())?.trim().slice(0, 80));

  // And a benchmark question still reports the verified number.
  await box.fill("what is the deduping interval and where is it enforced?");
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Find minimum context" }).click();
  await page.waitForTimeout(6000);
  console.log("BENCHMARK       ->", (await page.locator("text=/saturates at|Every anchor retrieved|No budget up to/").first().textContent())?.trim());

  console.log("page errors:", errs.length ? errs : "none");
  await browser.close();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
