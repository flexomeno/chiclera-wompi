import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") console.log(`[console:error] ${msg.text()}`);
});
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

console.log("Abriendo /pagar-qr ...");
await page.goto("http://localhost:3000/pagar-qr");

await page.fill("#email", "test-automatizado@example.com");
await page.click("#btn-crear");

console.log("Esperando QR...");
await page.waitForSelector("img.qr", { timeout: 15000 });
console.log("✅ QR mostrado en pantalla.");

console.log("Esperando código final (puede tardar unos segundos por el webhook)...");
await page.waitForSelector(".code", { timeout: 30000 });
const code = await page.locator(".code").textContent();
console.log(`✅ Código mostrado en pantalla: ${code.trim()}`);

await page.screenshot({ path: "/tmp/pagar-qr-debug.png", fullPage: true });
await browser.close();
