import { readFileSync } from "node:fs";
const fx = JSON.parse(readFileSync(`src/fixtures/${process.argv[2]}.json`, "utf8"));
const needle = process.argv[3];
for (const f of fx.repo.files) {
  const lines = f.text.split("\n");
  lines.forEach((l: string, i: number) => {
    if (l.includes(needle)) console.log(`${f.path}:${i + 1}: ${l.trim().slice(0, 100)}`);
  });
}
