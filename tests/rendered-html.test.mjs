import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Taiwan power dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*lang="zh-Hant"/i);
  assert.match(html, /<title>台灣電力即時資訊 · power\.futa\.gg<\/title>/i);
  assert.match(html, /現在，台灣用了多少電？/);
  assert.match(html, /區域電力供需/);
  assert.match(html, /歷史電力總覽/);
  assert.match(html, /快速選擇歷史期間/);
  assert.match(html, /把用電、備轉容量、發電結構與區域需求放在同一個時間軸查看/);
  assert.match(html, /發電機組即時狀態/);
  assert.doesNotMatch(html, /太陽能今日曲線|太陽能即時發電|太陽能正供應全台/);
  assert.match(html, /機組狀態顏色說明/);
  assert.match(html, /unit-status is-running/);
  assert.match(html, /unit-status is-limited/);
  assert.match(html, /unit-status is-outage/);
  assert.match(html, /unit-status is-stopped/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});
