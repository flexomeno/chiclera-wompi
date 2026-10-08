import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(root, "infra/.build/lambda");
const lambdas = join(root, "infra/lambdas");
const src = join(root, "src");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "handlers"), { recursive: true });
mkdirSync(join(dist, "lib"), { recursive: true });

cpSync(join(lambdas, "handlers"), join(dist, "handlers"), { recursive: true });
cpSync(join(lambdas, "lib"), join(dist, "lib"), { recursive: true });

for (const file of ["hotp.js", "wompi.js", "webhook-signature.js", "qr-svg-to-png.js"]) {
  cpSync(join(src, file), join(dist, "lib", file));
}

const pkg = JSON.parse(readFileSync(join(lambdas, "package.json"), "utf-8"));
writeFileSync(join(dist, "package.json"), JSON.stringify(pkg, null, 2));

execSync("npm install --omit=dev", {
  cwd: dist,
  stdio: "inherit",
});

console.log("Lambda package listo en", dist);
