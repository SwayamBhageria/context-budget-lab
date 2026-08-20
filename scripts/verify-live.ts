import { chromium } from "playwright";
const URL = "https://context-budget-lab.vercel.app";

async function main() {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("text=send everything", { timeout: 20000 });

  const opts = await page.locator("select option").allTextContents();
  console.log("dropdown (size order):");
  for (const o of opts) console.log("   " + o.trim());

  // Type a repo that is not in the corpus.
  await page.locator('input[placeholder*="owner/name"]').fill("openai/tiktoken");
  await page.getByRole("button", { name: "Index" }).click();
  await page.waitForTimeout(12000);

  const stat = async (l: string) =>
    (await page.locator(`div:has(> div:text-is("${l}")) > div.font-mono`).first().textContent())?.trim();
  console.log("\nlive repo indexed:");
  console.log("   everything:", await stat("send everything"));
  console.log("   selected:  ", await stat("selected"));
  console.log("   notice:    ", (await page.locator("text=/Indexed live from GitHub/").first().textContent())?.trim().slice(0, 90));
  // Ask something tiktoken actually contains, now that the empty case is explained.
  await page.locator('input:not([type]):not([placeholder])').first().fill("how are byte pair merges applied?");
  await page.waitForTimeout(6000);
  console.log("   after real question ->", await stat("selected"), "| top:",
    (await page.locator('section[class*="overflow-hidden"] > div span').first().textContent())?.trim());
  console.log("\npage errors:", errs.length ? errs.slice(0, 3) : "none");
  await b.close();
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
