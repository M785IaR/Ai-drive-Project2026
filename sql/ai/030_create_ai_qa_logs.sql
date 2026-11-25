-- ai_qa_logs テーブルおよびインデックス作成SQL (PostgreSQL / Neon DB 向け)
CREATE TABLE IF NOT EXISTS ai_qa_logs (
    id BIGSERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    response_text TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT,
    response_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_created_at ON ai_qa_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_status ON ai_qa_logs(status);