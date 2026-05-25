var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = require("fs");
var import_vite = require("vite");
var import_child_process = require("child_process");
var import_promises = require("fs/promises");
var import_os = require("os");
var import_util = require("util");
var execAsync = (0, import_util.promisify)(import_child_process.exec);
function resolveJavaBin() {
  const binDirs = [];
  if (process.env.JAVA_HOME) {
    binDirs.push(import_path.default.join(process.env.JAVA_HOME, "bin"));
  }
  const bundledJdk = import_path.default.join(process.cwd(), ".jdk");
  if ((0, import_fs.existsSync)(bundledJdk)) {
    for (const name of (0, import_fs.readdirSync)(bundledJdk, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      binDirs.push(import_path.default.join(bundledJdk, name.name, "bin"));
    }
  }
  const javacName = process.platform === "win32" ? "javac.exe" : "javac";
  const javaName = process.platform === "win32" ? "java.exe" : "java";
  for (const bin of binDirs) {
    const javac = import_path.default.join(bin, javacName);
    const java = import_path.default.join(bin, javaName);
    if ((0, import_fs.existsSync)(javac) && (0, import_fs.existsSync)(java)) {
      return { javac, java };
    }
  }
  return null;
}
var javaBin = resolveJavaBin();
if (javaBin) {
  console.log(`Using JDK: ${import_path.default.dirname(javaBin.javac)}`);
} else {
  console.warn("JDK not found. Place a JDK under .jdk/ or set JAVA_HOME.");
}
async function runJavaCode(code) {
  if (!javaBin) {
    return {
      error: "Java JDK not found. Install JDK 21+ and set JAVA_HOME, or run: npm run setup-jdk"
    };
  }
  const { javac, java } = javaBin;
  const classMatch = code.match(/public\s+class\s+(\w+)/);
  const className = classMatch ? classMatch[1] : "Main";
  const runDir = import_path.default.join((0, import_os.tmpdir)(), `java_run_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const javaFile = import_path.default.join(runDir, `${className}.java`);
  try {
    await (0, import_promises.mkdir)(runDir, { recursive: true });
    await (0, import_promises.writeFile)(javaFile, code, "utf8");
    try {
      await execAsync(`"${javac}" "${javaFile}"`, { cwd: runDir, timeout: 1e4 });
    } catch (compileErr) {
      const msg = (compileErr.stderr || compileErr.message || "Compilation failed").replace(new RegExp(runDir + "/", "g"), "");
      return { error: msg };
    }
    try {
      const { stdout, stderr } = await execAsync(
        `"${java}" -cp "${runDir}" ${className}`,
        { timeout: 5e3 }
      );
      return { output: stdout || stderr || "(no output)" };
    } catch (runErr) {
      if (runErr.killed || runErr.signal === "SIGTERM") {
        return { error: "Error: Program timed out (exceeded 5 seconds). Check for infinite loops." };
      }
      return { error: runErr.stdout || runErr.stderr || runErr.message || "Runtime error" };
    }
  } finally {
    (0, import_promises.rm)(runDir, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.post("/api/run-java", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Code is required" });
      const result = await runJavaCode(code);
      if (result.error) return res.json({ error: result.error });
      return res.json({ output: result.output });
    } catch (error) {
      console.error("Error running Java code:", error);
      res.status(500).json({ error: error.message || "Failed to run Java code" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
