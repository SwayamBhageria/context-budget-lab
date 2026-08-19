import { readFileSync } from "node:fs";
const fx = JSON.parse(readFileSync(`src/fixtures/${process.argv[2]}.json`, "utf8"));
for (const want of process.argv.slice(3)) {
  const f = fx.repo.files.find((x: any) => x.path === want);
  console.log(`\n===== ${want} (${f?.tokens} tok) =====\n${f ? f.text : "NOT FOUND"}`);
}
