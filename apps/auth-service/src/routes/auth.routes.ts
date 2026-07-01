import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OtpService } from "../otp/otpService";

const router = Router();
const otpService = new OtpService();

router.post("/otp/request", async (req: Request, res: Response) => {
  const { phoneNumber } = req.body ?? {};

  if (!phoneNumber || typeof phoneNumber !== "string") {
    return res.status(400).json({ error: "phoneNumber is required" });
  }

  const result = await otpService.requestOtp(phoneNumber);

  if (!result.delivered) {
    // All channels (SMS -> WhatsApp -> Voice) failed. Surface this
    // distinctly so the client can fall back to manual verification
    // rather than looping silently.
    return res.status(503).json({
      error: "otp_delivery_failed",
      attempts: result.attempts,
    });
  }

  return res.status(200).json({
    message: "OTP sent",
    deliveredVia: result.deliveredVia,
    attempts: result.attempts,
  });
});

router.post("/otp/verify", (req: Request, res: Response) => {
  const { phoneNumber, code } = req.body ?? {};

  if (!phoneNumber || !code) {
    return res.status(400).json({ error: "phoneNumber and code are required" });
  }

  const result = otpService.verifyOtp(phoneNumber, code);

  if (!result.valid) {
    return res.status(401).json({ error: result.reason });
  }

  const token = jwt.sign(
    { sub: phoneNumber, scope: "patient:verified" },
    process.env.JWT_SECRET ?? "dev-secret-change-me",
    { expiresIn: process.env.JWT_EXPIRY ?? "15m" }
  );

  return res.status(200).json({ token });
});

export default router;
