-- NyatiCare-Gateway: Initial schema
-- Target: PostgreSQL 15+ (TimescaleDB extension recommended for audit_log)

CREATE TABLE IF NOT EXISTS facilities (
    facility_code   VARCHAR(20) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    county          VARCHAR(100) NOT NULL,
    accreditation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    signing_key_ref VARCHAR(255) NOT NULL, -- reference to secret in KMS/Vault, never the raw key
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
    national_id     VARCHAR(20) PRIMARY KEY,
    sha_number      VARCHAR(30) UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    facility_code   VARCHAR(20) REFERENCES facilities(facility_code),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
    claim_id            UUID PRIMARY KEY,
    facility_code       VARCHAR(20) REFERENCES facilities(facility_code),
    patient_national_id VARCHAR(20) REFERENCES patients(national_id),
    amount              NUMERIC(12,2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'KES',
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
    signature_hash      VARCHAR(128) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_facility ON claims(facility_code);

-- Append-only audit trail for every claim state transition and OTP
-- delivery attempt. Recommended: convert to a TimescaleDB hypertable
-- via `SELECT create_hypertable('audit_log', 'occurred_at');`
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL,
    entity_type     VARCHAR(30) NOT NULL, -- 'claim' | 'otp' | 'patient'
    entity_id       VARCHAR(64) NOT NULL,
    event_type      VARCHAR(50) NOT NULL,
    metadata        JSONB,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
