-- A registration generation prevents cached public keys surviving device/key rotation.
ALTER TABLE igotify_devices ADD COLUMN key_version TEXT NOT NULL DEFAULT 'legacy';
