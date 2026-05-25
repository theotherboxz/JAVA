import express from "express";
import path from "path";
import { existsSync, readdirSync } from "fs";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

function resolveJavaBin(): { javac: string; java: string } | null {
  const binDirs: string[] = [];

  if (process.env.JAVA_HOME) {
    binDirs.push(path.join(process.env.JAVA_HOME, "bin"));
  }

  const bundledJdk = path.join(process.cwd(), ".jdk");
  if (existsSync(bundledJdk)) {
    for (const name of readdirSync(bundledJdk, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      binDirs.push(path.join(bundledJdk, name.name, "bin"));
    }
  }

  const javacName = process.platform === "win32" ? "javac.exe" : "javac";
  const javaName = process.platform === "win32" ? "java.exe" : "java";

  for (const bin of binDirs) {
    const javac = path.join(bin, javacName);
    const java = path.join(bin, javaName);
    if (existsSync(javac) && existsSync(java)) {
      return { javac, java };
    }
  }

  return null;
}

const javaBin = resolveJavaBin();
if (javaBin) {
  console.log(`Using JDK: ${path.dirname(javaBin.javac)}`);
} else {
  console.warn("JDK not found. Place a JDK under .jdk/ or set JAVA_HOME.");
}

// ─────────────────────────────────────────────
// Real Java compiler runner
// ─────────────────────────────────────────────
async function runJavaCode(code: string): Promise<{ output?: string; error?: string }> {
  if (!javaBin) {
    return {
      error:
        "Java JDK not found. Install JDK 21+ and set JAVA_HOME, or run: npm run setup-jdk",
    };
  }

  const { javac, java } = javaBin;
  const classMatch = code.match(/public\s+class\s+(\w+)/);
  const className = classMatch ? classMatch[1] : "Main";

  const runDir = path.join(tmpdir(), `java_run_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const javaFile = path.join(runDir, `${className}.java`);

  try {
    await mkdir(runDir, { recursive: true });
    await writeFile(javaFile, code, "utf8");

    // Compile
    try {
      await execAsync(`"${javac}" "${javaFile}"`, { cwd: runDir, timeout: 10_000 });
    } catch (compileErr: any) {
      const msg = (compileErr.stderr || compileErr.message || "Compilation failed")
        .replace(new RegExp(runDir + "/", "g"), "");
      return { error: msg };
    }

    // Run (5s timeout to catch infinite loops)
    try {
      const { stdout, stderr } = await execAsync(
        `"${java}" -cp "${runDir}" ${className}`,
        { timeout: 5_000 }
      );
      return { output: stdout || stderr || "(no output)" };
    } catch (runErr: any) {
      if (runErr.killed || runErr.signal === "SIGTERM") {
        return { error: "Error: Program timed out (exceeded 5 seconds). Check for infinite loops." };
      }
      return { error: runErr.stdout || runErr.stderr || runErr.message || "Runtime error" };
    }
  } finally {
    rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Only endpoint: real Java execution
  app.post("/api/run-java", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code is required" });

      const result = await runJavaCode(code);
      if (result.error) return res.json({ error: result.error });
      return res.json({ output: result.output });
    } catch (error: any) {
      console.error("Error running Java code:", error);
      res.status(500).json({ error: error.message || "Failed to run Java code" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
