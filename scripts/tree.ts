import { fetchRepo } from "../src/lib/ingest/github";
const slug = process.argv[2];
async function main() {
  const repo = await fetchRepo(slug, "HEAD");
  for (const f of repo.files.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`${String(f.tokens).padStart(6)}  ${f.path}`);
  }
  console.log(`\n${repo.files.length} files, ${repo.naiveTokens} tokens`);
}
main();
