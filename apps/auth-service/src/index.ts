import "dotenv/config";
import express from "express";
import pino from "pino";
import authRoutes from "./routes/auth.routes";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const app = express();
const port = process.env.AUTH_SERVICE_PORT ?? 4001;

app.use(express.json());

app.get("/api/v1/health-check", (_req, res) => {
  res.status(200).json({ service: "auth-service", status: "ok" });
});

app.use("/api/v1/auth", authRoutes);

app.listen(port, () => {
  logger.info(`auth-service listening on port ${port}`);
});
