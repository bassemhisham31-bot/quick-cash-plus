// إعدادات مساعد Quick Cash Plus — تخزين وحفظ فقط (بدون تنفيذ فعلي لأي محادثة ذكاء اصطناعي)
export const migration014AssistantSettings = `
CREATE TABLE IF NOT EXISTS assistant_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  floating_button_enabled INTEGER NOT NULL DEFAULT 1,
  store_analysis_enabled INTEGER NOT NULL DEFAULT 1,
  external_search_enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai_compatible', 'groq', 'gemini', 'openai')),
  model_name TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  api_key TEXT,
  api_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  allowed_sections TEXT NOT NULL DEFAULT '[]',
  allowed_user_ids TEXT NOT NULL DEFAULT '[]'
);
INSERT OR IGNORE INTO assistant_settings (id) VALUES (1);
`
