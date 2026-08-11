import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import signatureRoutes from "./routes/signatures.js";
import employeeRoutes from "./routes/employees.js";
import breedRoutes from "./routes/breeds.js";
import zapsignRoutes from "./routes/zapsign.js";
import settingsRoutes from "./routes/settings.js";
import { getDatabaseHealth, initDatabase } from "./db/init.js";
import { getEmployeesStorageInfo } from "./services/employees.js";
import { maybeSyncEmployeesFromSheets } from "./services/syncEmployeesFromSheets.js";
import {
  getZapSignProductionTemplateId,
  isZapSignEnabled,
  ZAPSIGN_UNIT_KEYS,
} from "./config/zapsignEnv.js";
import { warmUpZapSignTemplates } from "./services/zapsign.js";
import pkg from "../package.json" with { type: "json" };

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "../public");

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const patterns = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
    /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
    /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
    /^https:\/\/[\w.-]+(:\d+)?$/,
  ];
  if (origin === config.frontendUrl) return true;
  return patterns.some((p) => p.test(origin));
}

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    exposedHeaders: ["X-Client-Sign-Url", "X-Sheet-Index"],
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  const database = await getDatabaseHealth();
  let employees: Awaited<ReturnType<typeof getEmployeesStorageInfo>> | null = null;
  try {
    employees = await getEmployeesStorageInfo();
  } catch {
    employees = null;
  }
  res.json({
    ok: database.ok,
    database,
    employees,
    version: pkg.version,
    build: process.env.GIT_COMMIT || null,
    zapsign: Object.fromEntries(
      ZAPSIGN_UNIT_KEYS.map((unitKey) => [
        unitKey,
        getZapSignProductionTemplateId(unitKey) || null,
      ]),
    ),
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/signatures", signatureRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/breeds", breedRoutes);
app.use("/api/zapsign", zapsignRoutes);
app.use("/api/settings", settingsRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicDir, "index.html"), (err) => {
      if (err) next(err);
    });
  });
} else {
  app.get("/", (_req, res) => {
    res.json({
      message: "API SkoobPet — acesse o painel em http://localhost:5173",
      health: "/api/health",
    });
  });
}

async function start() {
  try {
    await initDatabase();
    maybeSyncEmployeesFromSheets(true).catch((e) => {
      console.warn("[employees] sync inicial:", e instanceof Error ? e.message : e);
    });
    if (process.env.ZAPSIGN_CONFIGURE_FORM !== "false" && ZAPSIGN_UNIT_KEYS.some(isZapSignEnabled)) {
      warmUpZapSignTemplates().catch((e) => {
        console.warn("[zapsign] template/form:", e instanceof Error ? e.message : e);
      });
    }
  } catch (e) {
    console.error("[db] Falha ao conectar PostgreSQL:", e instanceof Error ? e.message : e);
    console.warn("[db] Continuando com arquivos locais em backend/data/.");
  }

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`SkoobPet online em http://0.0.0.0:${config.port} (${process.env.NODE_ENV || "development"})`);
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((n) => n?.family === "IPv4" && !n.internal)?.address;
    if (lan && process.env.NODE_ENV !== "production") {
      console.log(`Outros dispositivos na mesma rede Wi-Fi: http://${lan}:5173/login`);
    }
  });
}

start();
