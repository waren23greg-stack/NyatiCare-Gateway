import { Router, Request, Response } from "express";
import { getCachedPatient, cachePatient } from "../cache/redisClient";
import { findPatientByNationalId } from "../db/postgresClient";
import { PatientRecord } from "@nyaticare/core-architecture";

const router = Router();

router.get("/:nationalId", async (req: Request, res: Response) => {
  const { nationalId } = req.params;

  const cached = await getCachedPatient(nationalId);
  if (cached) {
    return res.status(200).json({ source: "cache", patient: cached });
  }

  // Cache miss: fall through to the source-of-truth lookup.
  const patient = await lookupFromSourceOfTruth(nationalId);

  if (!patient) {
    return res.status(404).json({ error: "patient_not_found" });
  }

  await cachePatient(patient);
  return res.status(200).json({ source: "origin", patient });
});

async function lookupFromSourceOfTruth(nationalId: string): Promise<PatientRecord | null> {
  // For now this queries the local Postgres registry directly. Once
  // this facility's local HMIS or Taifa Care Central sync is wired up,
  // this is the function to point at that instead — the cache-aside
  // logic above doesn't need to change either way.
  try {
    const row = await findPatientByNationalId(nationalId);
    if (!row) return null;

    return {
      nationalId: row.national_id,
      shaNumber: row.sha_number ?? "",
      fullName: row.full_name,
      facilityCode: row.facility_code ?? "",
    };
  } catch (error) {
    // A Postgres outage shouldn't crash the request — log it and treat
    // it the same as a genuine miss. The gateway-level circuit breaker
    // (see docs/ARCHITECTURE.md) is the right place to react to this
    // happening repeatedly, not this individual request.
    // eslint-disable-next-line no-console
    console.error("Postgres lookup failed", error);
    return null;
  }
}

export default router;
