import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";

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
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

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

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend SkoobPet rodando em http://0.0.0.0:${config.port}`);
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((n) => n?.family === "IPv4" && !n.internal)?.address;
  if (lan && process.env.NODE_ENV !== "production") {
    console.log(`Outros dispositivos na mesma rede Wi-Fi: http://${lan}:5173/login`);
  }
});
