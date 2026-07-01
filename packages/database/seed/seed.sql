-- Sample seed data for local development only.

INSERT INTO facilities (facility_code, name, county, accreditation_status, signing_key_ref)
VALUES
    ('FAC-0001', 'Kenyatta National Hospital', 'Nairobi', 'accredited', 'vault://facilities/FAC-0001/signing-key'),
    ('FAC-0002', 'Moi Teaching and Referral Hospital', 'Uasin Gishu', 'accredited', 'vault://facilities/FAC-0002/signing-key')
ON CONFLICT (facility_code) DO NOTHING;

INSERT INTO patients (national_id, sha_number, full_name, facility_code)
VALUES
    ('12345678', 'SHA-000001', 'Jane Wanjiru', 'FAC-0001'),
    ('87654321', 'SHA-000002', 'John Otieno', 'FAC-0002')
ON CONFLICT (national_id) DO NOTHING;
