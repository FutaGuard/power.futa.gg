import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(html, /og-wankw\.png/);
  assert.match(html, /現在，台灣用了多少電？/);
  assert.match(html, /區域電力供需/);
  assert.match(html, /歷史電力總覽/);
  assert.match(html, /快速選擇歷史期間/);
  assert.match(html, /把用電、備轉容量、發電結構與區域需求放在同一個時間軸查看/);
  assert.match(html, />依能源<\/button>/);
  assert.match(html, /點選能源，即時查看比例與今日發電曲線。/);
  assert.match(html, /aria-label="查看太陽能發電曲線與比例"/);
  assert.match(html, /data-tooltip-placement="right-bottom"/);
  assert.match(html, /發電機組即時狀態/);
  assert.doesNotMatch(html, /太陽能今日曲線|太陽能即時發電|太陽能正供應全台/);
  assert.match(html, /機組狀態顏色說明/);
  assert.match(html, /unit-status is-running/);
  assert.match(html, /unit-status is-limited/);
  assert.match(html, /unit-status is-outage/);
  assert.match(html, /unit-status is-stopped/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("hero utilization metrics explain their calculations", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const gaugeRule = css.match(/\.circular-gauge\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(gaugeRule, /conic-gradient\(from 0deg,/);

  const response = await render();
  const html = await response.text();
  assert.match(html, /aria-label="查看系統供電利用率計算說明"/);
  assert.match(html, /使用率計算方式為：\( 目前用電量 ÷ 供電能力 \)×100%；其中供電能力為估算值，係參考機組狀況及再生能源發電量適時更新。/);
  assert.match(html, /aria-label="查看今日預估尖峰計算說明"/);
  assert.match(html, /尖峰使用率 = \( 預估最高用電 ÷ 最大供電能力 \)×100%/);
});

test("displays power values in ten-thousand kilowatts", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /3,951\.5/);
  assert.match(html, /38\.62/);
  assert.match(html, /單位：萬瓩/);
  assert.doesNotMatch(html, /\bMW\b/);
});

test("uses the same focus-following tooltip placement for live and history charts", async () => {
  const source = await readFile(new URL("../app/PowerDashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.equal(source.match(/placeChartTooltip\(cursorX, cursorY,/g)?.length, 2);
  assert.match(source, /className="history-chart" viewBox=\{`0 0 \$\{width\} \$\{canvasHeight\}`\}/);
  assert.match(source, /className="history-tooltip-dot"/);
  assert.match(css, /\.history-chart\s*\{[\s\S]*?aspect-ratio:\s*980\s*\/\s*408;/);
});

test("keeps the hero question on one line on mobile", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.hero-copy h1\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(css, /font-size:\s*clamp\(20px,\s*7\.6vw,\s*50px\)/);
});

test("keeps the desktop fuel donut value inside its center", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const valueRule = css.match(/\.donut-hole strong\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.match(valueRule, /max-width:\s*100%/);
  assert.match(valueRule, /font-size:\s*clamp\(21px,\s*1\.8vw,\s*25px\)/);
  assert.match(valueRule, /white-space:\s*nowrap/);
});

test("keeps mobile regional units aligned and generator rows full width", async () => {
  const response = await render();
  const html = await response.text();
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(html, /class="region-metric-value"><strong>[^<]+<\/strong><em>萬瓩<\/em>/);
  assert.match(css, /\.region-metric-value\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.region-metric-value\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr;/);
  assert.match(css, /\.generator-table tbody,[\s\S]*?\.generator-table td\s*\{\s*display:\s*block;/);
  assert.match(css, /\.generator-table-wrap,[\s\S]*?\.generator-table td\s*\{\s*width:\s*100%/);
});

test("keeps the mobile header aligned with a visible live status", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.site-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/);
  assert.match(css, /\.header-actions\s*\{[^}]*grid-column:\s*2;[^}]*justify-self:\s*end;/);
  assert.match(css, /\.sync-copy\s*\{[^}]*display:\s*grid;[^}]*white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /\.sync-button\s*\{\s*display:\s*none;/);
});

test("keeps mobile metric information above adjacent hero cards", async () => {
  const source = await readFile(new URL("../app/PowerDashboard.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.hero-stat:has\(\.metric-info\[open\]\)\s*,[\s\S]*?\.hero-stat\[data-metric-info-open\]\s*\{[^}]*z-index:\s*5;/);
  assert.match(source, /onToggle=\{\(event\) => \{[\s\S]*?data-metric-info-open/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.gauge-card \.metric-info\s*\{[^}]*position:\s*static;/);
  assert.match(css, /\.gauge-card \.metric-info-popover\s*\{[^}]*top:\s*76px;[^}]*right:\s*12px;[^}]*width:\s*min\(310px,\s*calc\(100% - 24px\)\);/);
});
