import axios from "axios";

const PATIENT_REGISTRY_URL = process.env.PATIENT_REGISTRY_URL ?? "http://patient-registry:4003";

export interface PatientLookupResult {
  found: boolean;
  shaNumber?: string;
  fullName?: string;
  facilityCode?: string;
}

export async function lookupPatientStatus(nationalId: string): Promise<PatientLookupResult> {
  try {
    const response = await axios.get(`${PATIENT_REGISTRY_URL}/api/v1/patients/${nationalId}`, {
      timeout: 4000,
    });

    const patient = response.data?.patient;
    if (!patient) return { found: false };

    return {
      found: true,
      shaNumber: patient.shaNumber,
      fullName: patient.fullName,
      facilityCode: patient.facilityCode,
    };
  } catch (error) {
    // A 404 means genuinely not found; any other failure (timeout,
    // connection refused) should read the same way to the caller on
    // the phone — we don't want to leak "the server is down" over a
    // USSD session. The important thing is this never throws upward
    // and crashes the menu flow.
    return { found: false };
  }
}
