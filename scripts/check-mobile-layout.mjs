import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const targetUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const screenshotPath = process.argv[3];
const diagnosticCss = process.env.POWER_LAYOUT_CSS;
const viewport = {
  width: Number(process.env.POWER_VIEWPORT_WIDTH ?? 390),
  height: Number(process.env.POWER_VIEWPORT_HEIGHT ?? 844),
  deviceScaleFactor: Number(process.env.POWER_DEVICE_SCALE_FACTOR ?? 3),
};
const chromePath =
  process.env.POWER_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForDebugger(port) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools did not become ready.");
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback?.reject(new Error(message.error.message));
      else callback?.resolve(message.result);
      return;
    }
    for (const callback of listeners.get(message.method) ?? []) callback(message.params);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const callbacks = listeners.get(method) ?? [];
        const callback = (params) => {
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((item) => item !== callback),
          );
          resolve(params);
        };
        callbacks.push(callback);
        listeners.set(method, callbacks);
      });
    },
  };
}

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "power-mobile-layout-"));
const port = await getFreePort();
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let cdp;
try {
  await waitForDebugger(port);
  const pageResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  const page = await pageResponse.json();
  cdp = connectCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await Promise.all([
    cdp.send("Page.enable"),
    cdp.send("Runtime.enable"),
    cdp.send("Emulation.setDeviceMetricsOverride", {
      ...viewport,
      mobile: true,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    }),
    cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true }),
    cdp.send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      platform: "Android",
    }),
  ]);

  const loaded = cdp.once("Page.loadEventFired");
  await cdp.send("Page.navigate", { url: targetUrl });
  await Promise.race([loaded, delay(20_000)]);
  await delay(6_000);

  if (diagnosticCss) {
    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const style = document.createElement("style");
        style.dataset.mobileLayoutDiagnostic = "";
        style.textContent = ${JSON.stringify(diagnosticCss)};
        document.head.append(style);
      })()`,
    });
    await delay(100);
  }

  const evaluation = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const describe = (element) => {
        const rect = element.getBoundingClientRect();
        const className = typeof element.className === "string"
          ? element.className.trim().split(/\\s+/).slice(0, 3).join(".")
          : "";
        const name = element.tagName.toLowerCase()
          + (element.id ? "#" + element.id : "")
          + (className ? "." + className : "");
        let scrollParent = element.parentElement;
        while (scrollParent) {
          const style = getComputedStyle(scrollParent);
          if (/auto|scroll|hidden|clip/.test(style.overflowX)) break;
          scrollParent = scrollParent.parentElement;
        }
        return {
          element: name,
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          scrollParent: scrollParent
            ? scrollParent.tagName.toLowerCase()
              + (scrollParent.className && typeof scrollParent.className === "string"
                ? "." + scrollParent.className.trim().split(/\\s+/).slice(0, 2).join(".")
                : "")
            : null,
        };
      };
      const visibleElements = [...document.querySelectorAll("body *")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      const outsideViewport = visibleElements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .map(describe)
        .slice(0, 40);
      const escapedPanels = visibleElements
        .filter((element) => element.matches("section, article, main > *, .panel, .card"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .map(describe);
      return {
        url: location.href,
        title: document.title,
        appFound: Boolean(document.querySelector(".power-app")),
        viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? null,
        viewportWidth,
        innerWidth: window.innerWidth,
        outerWidth: window.outerWidth,
        visualViewportWidth: window.visualViewport?.width ?? null,
        devicePixelRatio: window.devicePixelRatio,
        mobileBreakpointMatches: matchMedia("(max-width: 760px)").matches,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        horizontalOverflow: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - viewportWidth,
        escapedPanels,
        outsideViewport,
        layoutStyles: [
          document.documentElement,
          document.body,
          document.querySelector(".power-app"),
          document.querySelector(".dashboard-grid"),
          document.querySelector(".load-card"),
          document.querySelector(".load-chart-shell"),
          document.querySelector(".load-chart"),
        ].filter(Boolean).map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            element: describe(element).element,
            rectWidth: Math.round(rect.width * 10) / 10,
            width: style.width,
            minWidth: style.minWidth,
            maxWidth: style.maxWidth,
            display: style.display,
            gridTemplateColumns: style.gridTemplateColumns,
            overflowX: style.overflowX,
            boxSizing: style.boxSizing,
          };
        }),
      };
    })()`,
  });

  const result = evaluation.result.value;
  if (screenshotPath) {
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  }

  console.log(JSON.stringify(result, null, 2));
  if (
    !result.appFound ||
    result.url.startsWith("chrome-error:") ||
    result.horizontalOverflow > 1 ||
    result.escapedPanels.length > 0
  ) {
    process.exitCode = 1;
  }
} finally {
  cdp?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await Promise.race([exited, delay(2_000)]);
  }
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
