import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const isWin = process.platform === "win32";

function run(cwd, script) {
  const env = { ...process.env, NODE_OPTIONS: "--use-system-ca" };
  const nodeDir = join(process.env.ProgramFiles || "C:\\Program Files", "nodejs");
  if (isWin && !env.PATH?.toLowerCase().includes("nodejs")) {
    env.PATH = `${nodeDir};${env.PATH || ""}`;
  }

  return spawn(isWin ? `npm run ${script}` : "npm", isWin ? [] : ["run", script], {
    cwd,
    stdio: "inherit",
    shell: isWin,
    env,
  });
}

console.log("Iniciando backend (porta 3001) e frontend (porta 5173)...\n");
console.log("Pressione Ctrl+C para parar.\n");

const backend = run(join(root, "backend"), "dev");
const frontend = run(join(root, "frontend"), "dev");

backend.on("error", (err) => {
  console.error("Erro ao iniciar backend:", err.message);
  process.exit(1);
});

frontend.on("error", (err) => {
  console.error("Erro ao iniciar frontend:", err.message);
  process.exit(1);
});

function shutdown() {
  try {
    backend.kill();
    frontend.kill();
  } catch {
    // ignore
  }
  process.exit();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
