import { Pool } from "pg";

/**
 * A connection pool, not a single client. Postgres connections aren't
 * free — the pool reuses a small set of them across requests instead
 * of opening a new one per lookup, which matters once this service is
 * handling concurrent traffic from many facilities at once.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep this modest for now — a single patient-registry replica has
  // no business holding more connections open than Postgres can spare
  // across all replicas combined. Revisit once we have real load
  // numbers to size it against (a stats call, not a guess).
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  // A background/idle client hit an error (e.g. the DB restarted).
  // Log it; don't crash the whole service over a single bad connection.
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});

export interface PatientRow {
  national_id: string;
  sha_number: string | null;
  full_name: string;
  facility_code: string | null;
}

export async function findPatientByNationalId(nationalId: string): Promise<PatientRow | null> {
  const result = await pool.query<PatientRow>(
    `SELECT national_id, sha_number, full_name, facility_code
     FROM patients
     WHERE national_id = $1
     LIMIT 1`,
    [nationalId]
  );

  return result.rows[0] ?? null;
}
