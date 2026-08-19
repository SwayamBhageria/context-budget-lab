import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForSelector("text=send everything", { timeout: 15000 });

  const stat = async (label: string) =>
    (await page.locator(`div:has(> div:text-is("${label}")) > div.font-mono`).first().textContent())?.trim();

  console.log("H1:        ", await page.locator("h1").textContent());
  console.log("everything:", await stat("send everything"));
  console.log("selected:  ", await stat("selected"));
  console.log("recall:    ", (await page.locator("text=/\\d+\\/\\d+ anchors/").first().textContent())?.trim());
  console.log("kept rows: ", await page.locator("section.overflow-hidden.rounded-lg.border > div").count());

  // Drive the slider down and confirm the numbers actually move.
  const before = await stat("selected");
  await page.locator('input[type=range]').fill("1000");
  await page.waitForTimeout(1500);
  const after = await stat("selected");
  console.log(`slider 8000->1000: selected ${before} -> ${after}`);

  await page.screenshot({ path: "scratch/ui.png", fullPage: false });
  console.log("console errors:", errors.length ? errors.slice(0, 5) : "none");
  await browser.close();
}
main().catch((e) => { console.error("VERIFY FAILED:", e.message); process.exit(1); });
