# Architecture Notes

This document expands on the diagram in the root README, focused on the
part of the system most likely to break under real load: authentication.

## Why the Auth Service is async, not synchronous

Early versions of this design called an SMS provider directly inside the
HTTP request handler and waited for the reply. That fails at scale for
one simple reason: this system is I/O-bound, not CPU-bound. The slow
part is always the network hop to a telecom provider, never our own
code. Blocking a request thread on that hop means a slow SMS gateway
can exhaust the whole server's capacity during exactly the moment —
peak registration traffic — when you can least afford it.

The fix is to decouple "accepting the request" from "delivering the
OTP":

1. A facility calls `POST /api/v1/auth/otp/request`.
2. The service generates the code, stores its hash in memory/Redis with
   a TTL, and — in the target production design — pushes a `send OTP`
   event onto a Kafka topic instead of calling the telecom API inline.
3. The HTTP response returns immediately (target: single-digit
   milliseconds), regardless of how long the actual SMS delivery takes.
4. A background worker consumes the event and calls the SMS provider.
   If it fails or times out, the worker publishes the next fallback
   step (WhatsApp, then voice) rather than the original caller waiting.

The version of `auth-service` in this repo currently calls the fallback
chain synchronously inside the request (see `otp/fallbackEngine.ts`) as
a simpler first implementation. The Kafka-based dispatch described
above is the next step — see the Roadmap in the root README.

## Fallback ordering and timeouts

- **SMS first.** Cheapest, most familiar to users, but the least
  reliable under network congestion.
- **WhatsApp second.** Requires the recipient to have data connectivity,
  but avoids SMS-specific delivery problems.
- **Voice (IVR) last.** Slowest to set up but works even when a user has
  no data plan active — only their line needs to be reachable.

`OTP_TIMEOUT_MS` bounds how long the service waits on a single channel
before treating it as failed and moving to the next one. This number is
a genuine statistics/ops tradeoff: too short and you abandon slow-but-
working SMS deliveries prematurely (costing money on unnecessary
WhatsApp/voice fallbacks); too long and you block real users during
congestion. The right number should come from observed p95/p99 delivery
latency from your actual SMS aggregator, not a guess — this is a good
place to log delivery latency from day one so the number can be tuned
with real data.

## Gateway-level protections

Regardless of how resilient the auth service itself is, the layer in
front of it needs its own protections:

- **Rate limiting**, keyed by both IP and by phone number, on the OTP
  endpoints specifically — this is the standard defense against "OTP
  flooding" (bots requesting OTPs to run up telecom costs or exhaust a
  provider's quota).
- **Short upstream timeouts** on any reverse proxy in front of the
  service, so a degraded backend can't hold open thousands of gateway
  connections.
- **Circuit breaking that measures the right thing.** The gateway
  should treat "auth-service accepted and queued the request" as
  success, not "the SMS provider confirmed delivery" — otherwise a slow
  telecom provider trips a circuit breaker that blocks all login
  traffic at the edge, including users who would have succeeded via
  WhatsApp or voice.

## Offline-first claims, same idea applied differently

The claims-ingestion service uses the same core principle — never let
an unavailable downstream dependency block or lose an inbound request —
applied to Taifa Care Central connectivity instead of telecom APIs.
Claims are hashed and signed locally, written to the SQLite offline
queue immediately, and only marked `submitted` once the central
platform actually confirms receipt. A downstream outage delays
settlement; it should never lose a claim.
