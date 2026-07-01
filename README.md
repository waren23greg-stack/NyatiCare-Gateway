# NyatiCare Gateway

**A resilient integration layer for hospitals connecting to Kenya's SHA / Taifa Care HMIS**

![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![Status](https://img.shields.io/badge/status-prototype-orange)
![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-blue)

---

## ⚠️ Disclaimer

This is an **independent, open-source project** built for learning and portfolio purposes. It is **not affiliated with, endorsed by, or connected to** the Social Health Authority (SHA), the Digital Health Agency (DHA), the Ministry of Health, or the real Taifa Care HMIS. All endpoints, credentials, and downstream URLs in this repo are mocked or point to placeholder domains.

This system is **not production-ready** for handling real patient data. It has no independent security audit, no formal compliance review against Kenya's Data Protection Act, and no encryption-at-rest implementation. Treat it as a reference architecture and a base to build on, not a deployable clinical system.

---

## Why this exists

In June 2026, SHA began migrating claims processing for public hospitals from its old Provider Portal to a new platform, Taifa Care HMIS, giving healthcare providers a hard deadline to integrate or risk losing their contracts. Rolled out across thousands of facilities with very different levels of connectivity and IT maturity, that kind of deadline creates a predictable set of engineering problems:

- **Unreliable connectivity at the edge.** Many facilities, especially outside major towns, don't have consistent internet access. A claims pipeline that assumes an always-on connection to a central platform will lose data during outages.
- **Slow patient verification.** Looking up a patient's SHA status by calling a central API on every visit doesn't scale well when hundreds of facilities are hitting the same endpoint.
- **OTP delivery is fragile.** SMS-based one-time passwords for provider or patient authentication routinely fail or time out, especially on congested networks.
- **No-data, no-smartphone access.** A meaningful share of patients and even some facility staff don't have a smartphone or a reliable data connection at all — a system that only works over an app or web portal excludes them by design.
- **A brand-new platform will have rough edges.** Any system this size, freshly migrated, is going to have downtime and degraded performance in its early months. Client systems that integrate with it need to expect failure, not just success.

NyatiCare Gateway is a demonstration of how you'd architect around those constraints: cache aggressively at the edge, queue durably when the network is unavailable, offer a fallback for every failure mode — including no data connection at all — and never silently drop a claim just because a downstream call failed.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                Hospital / Facility Edge Layer                 │
│            (local HMIS, EMR, or point-of-care client)         │
└──────────────────────────────┬──────────────────────────────┬─┘
                               │ HTTPS (Client polls/SSE for OTP)
                               ▼
┌───────────────────────────────────────────────────────────────┐
│                     NyatiCare API Gateway                     │
│         rate limiting · JWT auth · circuit breaking           │
└───────────────┬─────────────────────────────┬─────────────────┘
                │                             │
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────────┐
   │   Patient Registry      │   │   Claims Ingestion          │
   │   Redis edge cache,     │   │   Kafka consumer, SQLite    │
   │   cache-aside pattern   │   │   fallback queue on failure │
   └────────────┬─────────────┘   └───────────────┬───────────────┘
                │                                 │
                └────────────────┬────────────────┘
                                 ▼

          ====== ENHANCED ASYNC AUTHENTICATION LAYER ======
          │                                               │
          │      ┌─────────────────────────────────┐      │
          │      │         Auth API Gateway        │      │
          │      │ Instantly returns 202 Accepted  │      │
          │      └─┬─────────────────────────────┬─┘      │
          │ Writes │                             │ Pushes │
          │ State  ▼                             ▼ Event  │
          │ ┌──────────────┐             ┌──────────────┐ │
          │ │ Redis Store  │             │ Kafka Broker │ │
          │ │ (Tracks       │            │ (auth_topic) │ │
          │ │  cascade step)│            └──────┬───────┘ │
          │ └──────┬───────┘                    │         │
          │        │                            │ Consumes│
          │ Reads/ ▼                            ▼         │
          │ Updates┌────────────────────────────────────┐ │
          │        │     Cascading Dispatch Engine      │ │
          │        │                                    │ │
          │        │  [Step 1] ──► SMS Workers          │ │
          │        │      │ (if fails / times out)      │ │
          │        │  [Step 2] ──► WhatsApp Workers     │ │
          │        │      │ (if fails / times out)      │ │
          │        │  [Step 3] ──► Voice Call Workers   │ │
          │        └────────────────────┬───────────────┘ │
          │                             │                 │
          │      ┌──────────────────────▼──────────┐      │
          │      │  Webhook Ingestion Endpoint     │      │
          │      │  (Listens for Telecom Failures) │      │
          │      └──────────────────────┬──────────┘      │
          ==============================│==================
                                        │
                                        ▼
                 ┌───────────────────────────────────────┐
                 │      External Telecom Providers       │
                 │  (Safaricom, Twilio, Africa's Talking)│
                 └──────────────────┬────────────────────┘
                                    │ synced when reachable
                                    ▼
                 ┌───────────────────────────────────────┐
                 │      Taifa Care HMIS (external)       │
                 │      mocked in this repo              │
                 └───────────────────────────────────────┘
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning behind the async auth design, fallback ordering, and gateway-level protections (rate limiting, timeouts, circuit-breaker semantics).

### Core mechanisms

**1. Cascading OTP fallback.** If SMS delivery exceeds `OTP_TIMEOUT_MS` or the provider returns repeated errors, the auth service retries the code over WhatsApp Business, then falls back to an IVR voice call — so a flaky SMS aggregator doesn't block someone from authenticating. The current implementation runs this chain in-process; the roadmap below covers moving dispatch onto Kafka so the request thread never blocks on a telecom call at all.

**2. Offline-first claims queue.** Claims are signed and hashed locally, then written to an embedded SQLite ledger *before* the system attempts to forward them upstream. A background worker retries delivery and only marks a claim as synced once the upstream platform confirms receipt. A downstream outage delays a claim; it never loses one.

**3. Edge-cached patient registry.** Patient/SHA-number lookups are served from a local Redis cache first (cache-aside pattern), falling back to the central registry only on a cache miss. This is what keeps repeat verification lookups fast instead of round-tripping to a central API on every visit.

**4. USSD access path (planned).** Not every facility or patient has a smartphone or reliable data. A `*XXX#`-style USSD menu — most realistically built on Africa's Talking' USSD sandbox — is planned as a parallel front door into the same auth/patient/claims services, so the system doesn't quietly exclude the people it's meant to serve. Tracked in the Roadmap.

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript on Node.js 20+ |
| API layer | Express (designed to sit behind Kong or Envoy) |
| Messaging | Apache Kafka |
| Edge cache | Redis 7 |
| Offline store | SQLite |
| Database | PostgreSQL 15 |
| Containers | Docker / Docker Compose |
| Orchestration | Kubernetes, with HPA autoscaling |
| Infra as code | Terraform (skeleton) |
| Testing | Jest |
| Logging | Pino (structured JSON logs) |

---

## Repository structure

```
nyaticare-gateway/
├── .github/
│   └── workflows/
│       └── ci.yml                # lint, build, test on push/PR
├── apps/
│   ├── auth-service/              # OTP fallback + identity (port 4001)
│   ├── claims-ingestion/          # Kafka consumer + offline queue (port 4002)
│   └── patient-registry/          # Redis-cached lookup service (port 4003)
├── packages/
│   ├── core-architecture/         # shared types, interfaces, crypto utils
│   └── database/                  # Postgres schema, migrations, seed data
├── infrastructure/
│   ├── docker-compose.yml         # local multi-container dev stack
│   ├── k8s/                       # Deployment, Service, HPA manifests
│   └── terraform/                 # cloud infra skeleton (AWS)
├── docs/
│   └── ARCHITECTURE.md            # design rationale for the auth cascade
├── .env.example
├── LICENSE
└── package.json                   # npm workspaces root
```

---

## Getting started

### Prerequisites

- Node.js 20 or later
- Docker Engine + Docker Compose
- npm 10+

### Setup

```bash
git clone git@github.com:waren23greg-stack/NyatiCare-Gateway.git
cd NyatiCare-Gateway
cp .env.example .env
npm install
```

### Run the infrastructure (Postgres, Redis, Kafka, Zookeeper) and services

```bash
docker compose -f infrastructure/docker-compose.yml up -d --build
```

### Run services in dev mode with hot reload

```bash
npm run dev
```

Each service exposes a health check once running:

```bash
curl http://localhost:4001/api/v1/health-check   # auth-service
curl http://localhost:4002/api/v1/health-check   # claims-ingestion
curl http://localhost:4003/api/v1/health-check   # patient-registry
```

### Environment variables

See [`.env.example`](.env.example) for the full list. Key ones:

```ini
NODE_ENV=development
LOG_LEVEL=info

# Auth
AUTH_SERVICE_PORT=4001
JWT_SECRET=replace-with-a-strong-secret
OTP_TIMEOUT_MS=1800

# Claims
CLAIMS_SERVICE_PORT=4002
KAFKA_BROKERS=localhost:9092
OFFLINE_QUEUE_DB_PATH=./data/offline-queue.sqlite

# Patient Registry
PATIENT_REGISTRY_PORT=4003
REDIS_URL=redis://localhost:6379
REDIS_CACHE_TTL_SECONDS=3600

# Downstream (mocked)
TAIFA_CARE_BASE_URL=https://example.go.ke
```

---

## Deployment

### Docker

Each service ships with its own `Dockerfile` under `apps/<service>/`.

### Kubernetes

```bash
kubectl apply -f infrastructure/k8s/namespace.yaml
kubectl apply -f infrastructure/k8s/
```

Manifests define `Deployment`s with liveness/readiness probes, `ClusterIP` `Service`s, and `HorizontalPodAutoscaler`s for `auth-service` and `patient-registry`. Adjust `TAIFA_CARE_BASE_URL`, secrets, and resource limits before pointing this at anything beyond a sandbox namespace.

### Terraform

`infrastructure/terraform/` is a skeleton (ECR repositories only) — a starting point, not a turn-key production module. Fill in a real backend, EKS/RDS/ElastiCache/MSK resources, and state management before using it for anything real.

---

## Roadmap

- [ ] Move OTP dispatch onto Kafka so the auth-service HTTP handler never blocks on a telecom call (see `docs/ARCHITECTURE.md`)
- [ ] Webhook ingestion endpoint for telecom delivery-status callbacks, with Redis TTL as a silent-failure backstop
- [ ] USSD gateway service for smartphone-free / data-free access
- [ ] Dual-key rate limiting (IP + phone number) on OTP endpoints to prevent OTP-flooding abuse
- [ ] Exponential backoff + jitter on retries, not just fixed intervals
- [ ] Structured audit-log export for the offline claims ledger
- [ ] Prometheus metrics + Grafana dashboard for queue depth and cache hit rate
- [ ] Facility onboarding CLI (bulk-register facility codes)
- [ ] Swap the mocked downstream client for a real sandbox integration if/when SHA publishes one
- [ ] Encryption at rest for the SQLite offline queue and Postgres

---

## Contributing

Issues and PRs are welcome. If you're picking this up as a learning project:

1. Fork the repo and create a feature branch.
2. Run `npm install` at the root (this is an npm-workspaces monorepo, so installing at the root wires up all three services).
3. Add tests for any new resilience behavior.
4. Open a PR describing what you changed and why.

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

## Author

Built by Trinity as a systems-design and distributed-architecture project. Questions or ideas welcome via GitHub Issues.
