import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workerPath = new URL("../dist/server/index.js", import.meta.url);
workerPath.searchParams.set("pages-export", `${Date.now()}`);

const { default: worker } = await import(workerPath.href);
const response = await worker.fetch(
  new Request("https://power-futa-gg.pages.dev/", {
    headers: { accept: "text/html" },
  }),
  {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  },
  {
    waitUntil() {},
    passThroughOnException() {},
  },
);

if (!response.ok) {
  throw new Error(`Pages export failed with HTTP ${response.status}`);
}

const contentType = response.headers.get("content-type") ?? "";
if (!contentType.startsWith("text/html")) {
  throw new Error(`Pages export returned an unexpected content type: ${contentType}`);
}

const html = await response.text();
if (!html.includes("台灣電力即時資訊")) {
  throw new Error("Pages export did not contain the expected dashboard markup");
}

const outputPath = resolve("dist/client/index.html");
await writeFile(outputPath, html, "utf8");
console.log(outputPath);
