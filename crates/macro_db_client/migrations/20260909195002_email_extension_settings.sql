-- Global email extension settings (per user extensions).
--
-- Controls send-side open tracking and receive-side tracking pixel blocking
-- from Settings > Extensions > Email Enhancements.

CREATE TABLE IF NOT EXISTS email_extension_settings (
    user_id text NOT NULL PRIMARY KEY REFERENCES "User" ("id") ON DELETE CASCADE,
    email_open_tracking_enabled boolean NOT NULL DEFAULT true,
    email_tracking_pixel_blocking_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
