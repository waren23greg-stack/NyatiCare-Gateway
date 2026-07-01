import "dotenv/config";
import express from "express";
import pino from "pino";
import patientRoutes from "./routes/patient.routes";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const app = express();
const port = process.env.PATIENT_REGISTRY_PORT ?? 4003;

app.use(express.json());

app.get("/api/v1/health-check", (_req, res) => {
  res.status(200).json({ service: "patient-registry", status: "ok" });
});

app.use("/api/v1/patients", patientRoutes);

app.listen(port, () => {
  logger.info(`patient-registry listening on port ${port}`);
});
