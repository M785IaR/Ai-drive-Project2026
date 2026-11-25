CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL DEFAULT 'default',
  user_name VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_id
  ON chat_messages (room_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_room_members (
  member_token VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL DEFAULT 'default',
  socket_id VARCHAR(64) NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_expires
  ON chat_room_members (room_id, expires_at);