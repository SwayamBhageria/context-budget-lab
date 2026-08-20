// @ts-nocheck
import { fetchRepo } from "../src/lib/ingest/github";
// Bypass the source filter to see everything the repo really holds.
const { gunzipSync } = await import("node:zlib");
const res = await fetch("https://codeload.github.com/karpathy/llm.c/tar.gz/HEAD");
const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
let off = 0; const counts: Record<string, [number, number]> = {};
while (off + 512 <= tar.length) {
  const h = tar.subarray(off, off + 512);
  const name = h.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
  if (!name) break;
  const size = parseInt(h.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim() || "0", 8);
  const type = h[156]; off += 512;
  if (type === 48 || type === 0) {
    const ext = name.includes(".") ? name.split(".").pop()! : "(none)";
    counts[ext] = [(counts[ext]?.[0] ?? 0) + 1, (counts[ext]?.[1] ?? 0) + size];
  }
  off += Math.ceil(size / 512) * 512;
}
for (const [ext, [n, bytes]] of Object.entries(counts).sort((a, b) => b[1][1] - a[1][1]).slice(0, 10))
  console.log(`  .${ext.padEnd(6)} ${String(n).padStart(4)} files  ${(bytes / 1024).toFixed(0)}KB`);
