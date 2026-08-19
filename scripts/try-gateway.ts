import { config } from "dotenv";
config({ path: ".env.local" });
import { gateway, generateText } from "ai";

async function main() {
  const models = await gateway.getAvailableModels();
  const claude = models.models
    .filter((m) => m.id.startsWith("anthropic/"))
    .map((m) => m.id);
  console.log("Anthropic models available:");
  for (const m of claude) console.log("  " + m);

  const pick = claude.find((m) => m.includes("haiku")) ?? claude[0];
  console.log(`\nCalling ${pick}...`);
  const r = await generateText({
    model: pick,
    prompt: "Reply with exactly: gateway works",
  });
  console.log("RESPONSE:", r.text.trim());
  console.log("USAGE:", JSON.stringify(r.usage));
}
main().catch((e) => console.error("FAILED:", e.message));
