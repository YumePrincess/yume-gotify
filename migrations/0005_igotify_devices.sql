CREATE TABLE IF NOT EXISTS igotify_devices (
  uid INTEGER PRIMARY KEY AUTOINCREMENT,
  client_token TEXT NOT NULL UNIQUE,
  device_token TEXT NOT NULL,
  gotify_url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  last_message_id INTEGER NOT NULL DEFAULT 0,
  disabled_at TEXT,
  disabled_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_igotify_devices_device_token
  ON igotify_devices (device_token);

CREATE INDEX IF NOT EXISTS idx_igotify_devices_disabled_at
  ON igotify_devices (disabled_at);

CREATE TABLE IF NOT EXISTS igotify_notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_token TEXT NOT NULL,
  gotify_url TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  UNIQUE (device_token, gotify_url, message_id)
);

CREATE INDEX IF NOT EXISTS idx_igotify_notification_deliveries_status_created_at
  ON igotify_notification_deliveries (status, created_at);
