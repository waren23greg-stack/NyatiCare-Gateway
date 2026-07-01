import { Router, Request, Response } from "express";
import { getCachedPatient, cachePatient } from "../cache/redisClient";
import { PatientRecord } from "@nyaticare/core-architecture";

const router = Router();

router.get("/:nationalId", async (req: Request, res: Response) => {
  const { nationalId } = req.params;

  const cached = await getCachedPatient(nationalId);
  if (cached) {
    return res.status(200).json({ source: "cache", patient: cached });
  }

  // Cache miss: fall through to the source-of-truth lookup.
  // Replace this with a real call to the local HMIS mirror or
  // Taifa Care Central, guarded by its own circuit breaker.
  const patient = await lookupFromSourceOfTruth(nationalId);

  if (!patient) {
    return res.status(404).json({ error: "patient_not_found" });
  }

  await cachePatient(patient);
  return res.status(200).json({ source: "origin", patient });
});

async function lookupFromSourceOfTruth(nationalId: string): Promise<PatientRecord | null> {
  // Placeholder. In production this calls the local HMIS database or
  // the Taifa Care Central API, wrapped in a circuit breaker so a slow
  // upstream doesn't cascade into request pileups here.
  return null;
}

export default router;
