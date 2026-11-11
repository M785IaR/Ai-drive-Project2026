import db from '../../config/database'; // 既存の PostgreSQL (pg Pool/Client) 接続構成を参照

export interface AiQaLog {
  id: number;
  prompt: string;
  response_text: string | null;
  status: string;
  error_message: string | null;
  response_time_ms: number | null;
  created_at: Date | string;
}

export interface PublicAiQaLog {
  id: number;
  prompt: string;
  response: string | null;
  createdAt: string;
}

export interface CreateAiQaLogInput {
  prompt: string;
  responseText: string | null;
  status?: string;
  errorMessage?: string | null;
  responseTimeMs?: number | null;
}

export class AiModel {
  /**
   * 最新20件のQAログを取得し、公開用レスポンス形式に変換して返却する (PostgreSQL対応)
   */
  static async getRecentLogs(limit: number = 20): Promise<PublicAiQaLog[]> {
    const sql = `
      SELECT id, prompt, response_text, created_at
      FROM ai_qa_logs
      ORDER BY id DESC
      LIMIT $1
    `;

    try {
      // 既存の db.query (pg Pool または Client) を呼び出し
      const result = await db.query(sql, [limit]);
      const rows: AiQaLog[] = result.rows || [];

      if (rows.length === 0) {
        return [];
      }

      // DB列名を公開用フォーマットに変換 (id, prompt, response, createdAt)
      return rows.map((row) => ({
        id: Number(row.id),
        prompt: row.prompt,
        response: row.response_text,
        createdAt: row.created_at instanceof Date 
          ? row.created_at.toISOString() 
          : String(row.created_at),
      }));
    } catch (error) {
      throw error;
    }
  }

  /**
   * QAログをDBに1件挿入し、作成されたレコードを公開用形式で返却する
   */
  static async createLog(input: CreateAiQaLogInput): Promise<PublicAiQaLog> {
    const sql = `
      INSERT INTO ai_qa_logs (prompt, response_text, status, error_message, response_time_ms)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, prompt, response_text, created_at
    `;

    const values = [
      input.prompt,
      input.responseText,
      input.status || 'SUCCESS',
      input.errorMessage || null,
      input.responseTimeMs || null,
    ];

    try {
      const result = await db.query(sql, values);
      const row: AiQaLog = result.rows[0];

      return {
        id: Number(row.id),
        prompt: row.prompt,
        response: row.response_text,
        createdAt: row.created_at instanceof Date 
          ? row.created_at.toISOString() 
          : String(row.created_at),
      };
    } catch (error) {
      throw error;
    }
  }
}