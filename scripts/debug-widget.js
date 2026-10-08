import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:3000/pagar";

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  console.log(`[console:${msg.type()}] ${msg.text()}`);
});

page.on("pageerror", (err) => {
  console.log(`[pageerror] ${err.message}`);
});

page.on("requestfailed", (req) => {
  console.log(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});

page.on("response", async (res) => {
  if (res.status() >= 400) {
    console.log(`[http ${res.status()}] ${res.url()}`);
  }
});

console.log(`Abriendo ${url} ...`);
await page.goto(url, { waitUntil: "networkidle" });

console.log("Buscando el botón del widget...");
await page.waitForTimeout(2000);

// El widget inyecta un <button> dentro del <form>
const button = page.locator("form button").first();
const count = await button.count();
console.log(`Botones encontrados dentro del <form>: ${count}`);

if (count > 0) {
  console.log("Haciendo clic en el botón...");
  await button.click();
  await page.waitForTimeout(5000);
}

console.log("Tomando screenshot final...");
await page.screenshot({ path: "/tmp/widget-debug.png", fullPage: true });

console.log("Listo. Cerrando navegador en 3s...");
await page.waitForTimeout(3000);
await browser.close();
