import { createWriteStream, existsSync, mkdirSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const jdkDir = path.join(root, ".jdk");

function hasJdk() {
  if (!existsSync(jdkDir)) return false;
  return readdirSync(jdkDir, { withFileTypes: true }).some((e) => {
    if (!e.isDirectory()) return false;
    return existsSync(path.join(jdkDir, e.name, "bin", "javac.exe"));
  });
}

async function download(url, dest) {
  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

if (hasJdk()) {
  console.log("JDK already present in .jdk/");
  process.exit(0);
}

mkdirSync(jdkDir, { recursive: true });
const zipPath = path.join(jdkDir, "jdk.zip");
const url =
  "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk";

console.log("Downloading JDK 21 (this may take a minute)...");
await download(url, zipPath);

console.log("Extracting...");
const { execSync } = await import("child_process");
execSync(
  `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${jdkDir.replace(/'/g, "''")}' -Force"`,
  { stdio: "inherit" }
);

console.log("Done. Restart the dev server: npm run dev");
