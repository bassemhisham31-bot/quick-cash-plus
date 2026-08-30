// المرحلة 027 — سجل محادثة مساعد Quick Cash Plus الفعلي (رسائل حقيقية محفوظة لكل مستخدم)
export const migration027AssistantChat = `
CREATE TABLE IF NOT EXISTS assistant_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assistant_chat_messages_user ON assistant_chat_messages(user_id, id);
`
