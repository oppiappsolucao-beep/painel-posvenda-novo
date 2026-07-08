import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import os from "os";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

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

app.get("/", (_req, res) => {
  res.json({
    message: "API SkoobPet — acesse o painel em http://localhost:5173",
    health: "/api/health",
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Backend SkoobPet rodando em http://localhost:${config.port}`);
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((n) => n?.family === "IPv4" && !n.internal)?.address;
  if (lan) {
    console.log(`Outros dispositivos na mesma rede Wi-Fi: http://${lan}:5173/login`);
  }
});
