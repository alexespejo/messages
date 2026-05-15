CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   TEXT NOT NULL,
  content     TEXT,
  media_url   TEXT,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_created_at ON messages (created_at DESC);

CREATE TABLE media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  cdn_url     TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
