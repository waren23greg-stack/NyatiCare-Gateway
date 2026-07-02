import path from "path";
import fs from "fs";
import { OfflineClaimsQueue } from "../offlineQueue/sqliteQueue";
import { processClaimEvent } from "../kafka/consumer";
import { Claim } from "@nyaticare/core-architecture";

describe("Claims fault tolerance — Taifa Care outage handling", () => {
  const testDbPath = path.join(__dirname, "test-fault-queue.sqlite");
  let queue: OfflineClaimsQueue;

  beforeEach(() => {
    process.env.TAIFA_CARE_BASE_URL = "https://example.invalid";
    process.env.TAIFA_CARE_API_KEY = "test-key";
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    queue = new OfflineClaimsQueue(testDbPath);
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  function makeTestClaim(claimId: string): Claim {
    return {
      claimId,
      facilityCode: "FAC-17042",
      patientNationalId: "33445566",
      amount: 4500,
      currency: "KES",
      status: "signed_offline",
      createdAt: new Date().toISOString(),
      signatureHash: "0xTestSignatureHash",
    };
  }

  it("keeps the claim unsynced in the local queue when Taifa Care is unreachable", async () => {
    const claimId = "outage-test-claim-001";
    queue.enqueue(makeTestClaim(claimId));

    expect(queue.getUnsynced().some((c) => c.claimId === claimId)).toBe(true);

    jest.spyOn(global, "fetch").mockRejectedValue(new Error("getaddrinfo ENOTFOUND example.invalid"));

    const result = await processClaimEvent({ claimId }, queue);

    expect(result.synced).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const stillQueued = queue.getUnsynced().find((c) => c.claimId === claimId);
    expect(stillQueued).toBeDefined();
    expect(stillQueued?.status).toBe("signed_offline");
  });

  it("keeps the claim unsynced when Taifa Care responds with a 503", async () => {
    const claimId = "outage-test-claim-002";
    queue.enqueue(makeTestClaim(claimId));

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Taifa Care central database lockup. Degradation detected.",
    } as Response);

    const result = await processClaimEvent({ claimId }, queue);

    expect(result.synced).toBe(false);
    const stillQueued = queue.getUnsynced().find((c) => c.claimId === claimId);
    expect(stillQueued).toBeDefined();
    expect(stillQueued?.status).toBe("signed_offline");
  });

  it("marks the claim synced once Taifa Care accepts it", async () => {
    const claimId = "success-test-claim-001";
    queue.enqueue(makeTestClaim(claimId));

    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    } as Response);

    const result = await processClaimEvent({ claimId }, queue);

    expect(result.synced).toBe(true);
    const stillQueued = queue.getUnsynced().find((c) => c.claimId === claimId);
    expect(stillQueued).toBeUndefined();
  });
});
