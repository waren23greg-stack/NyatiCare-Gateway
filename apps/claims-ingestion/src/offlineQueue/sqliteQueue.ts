import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { Claim } from "@nyaticare/core-architecture";

const DB_PATH = process.env.OFFLINE_QUEUE_DB_PATH ?? "./data/offline-queue.sqlite";

/**
 * Local, append-only-ish store for claims signed at the hospital edge.
 * When the DHA/Taifa Care central endpoint is unreachable (5xx, timeout,
 * or full outage), claims land here first and are cryptographically
 * signed before insertion. A background sync worker drains this queue
 * once connectivity is restored (see claims-ingestion/src/kafka/producer.ts).
 */
export class OfflineClaimsQueue {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claims_queue (
        claim_id TEXT PRIMARY KEY,
        facility_code TEXT NOT NULL,
        patient_national_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KES',
        status TEXT NOT NULL,
        signature_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  enqueue(claim: Claim): void {
    const stmt = this.db.prepare(`
      INSERT INTO claims_queue
        (claim_id, facility_code, patient_national_id, amount, currency, status, signature_hash, created_at, synced)
      VALUES (@claimId, @facilityCode, @patientNationalId, @amount, @currency, @status, @signatureHash, @createdAt, 0)
    `);

    stmt.run({
      claimId: claim.claimId,
      facilityCode: claim.facilityCode,
      patientNationalId: claim.patientNationalId,
      amount: claim.amount,
      currency: claim.currency,
      status: claim.status,
      signatureHash: claim.signatureHash,
      createdAt: claim.createdAt,
    });
  }

  getUnsynced(limit = 100): Claim[] {
    const rows = this.db
      .prepare(`SELECT * FROM claims_queue WHERE synced = 0 ORDER BY created_at ASC LIMIT ?`)
      .all(limit) as any[];

    return rows.map((row) => ({
      claimId: row.claim_id,
      facilityCode: row.facility_code,
      patientNationalId: row.patient_national_id,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      signatureHash: row.signature_hash,
      createdAt: row.created_at,
      submittedAt: row.submitted_at ?? undefined,
    }));
  }

  markSynced(claimId: string): void {
    this.db
      .prepare(`UPDATE claims_queue SET synced = 1, status = 'submitted', submitted_at = ? WHERE claim_id = ?`)
      .run(new Date().toISOString(), claimId);
  }
}
