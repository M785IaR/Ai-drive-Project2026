import { pool } from '../../../../db';

export interface AiConversationRow {
  id: number;
  title: string;
  createdAt: string;
}

export interface AiConversationTurnRow {
  id: number;
  conversationId: number;
  prompt: string;
  responseText: string;
  createdAt: string;
}

export interface AiContextTurn {
  id: number;
  prompt: string;
  responseText: string;
}

export class AiV2Model {
  /**
   * 新規会話を作成する
   */
  static async createConversation(title: string): Promise<AiConversationRow> {
    const query = `
      INSERT INTO ai_conversations (title)
      VALUES ($1)
      RETURNING id, title, created_at
    `;
    const result = await pool.query(query, [title]);
    const row = result.rows[0];
    return {
      id: Number(row.id),
      title: row.title,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  /**
   * 会話一覧を新しい順（最新50件）で取得する
   */
  static async listConversations(limit = 50): Promise<AiConversationRow[]> {
    const query = `
      SELECT id, title, created_at
      FROM ai_conversations
      ORDER BY id DESC
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * 指定された会話IDが存在するか確認する
   */
  static async existsConversation(conversationId: number): Promise<boolean> {
    const query = `
      SELECT id
      FROM ai_conversations
      WHERE id = $1
    `;
    const result = await pool.query(query, [conversationId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * 画面表示用：指定会話の最新20往復を取得し、古い順（id ASC）に並べて返す
   */
  static async getRecentTurnsForDisplay(
    conversationId: number,
    limit = 20
  ): Promise<AiConversationTurnRow[]> {
    const query = `
      SELECT id, conversation_id, prompt, response_text, created_at
      FROM (
        SELECT id, conversation_id, prompt, response_text, created_at
        FROM ai_conversation_turns
        WHERE conversation_id = $1
        ORDER BY id DESC
        LIMIT $2
      ) AS recent_turns
      ORDER BY id ASC
    `;
    const result = await pool.query(query, [conversationId, limit]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      conversationId: Number(row.conversation_id),
      prompt: row.prompt,
      responseText: row.response_text,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * Gemini文脈組立用：指定会話の保存済み最新5往復を取得し、古い順（id ASC）に並べて返す
   */
  static async getRecentTurnsForContext(
    conversationId: number,
    limit = 5
  ): Promise<AiContextTurn[]> {
    const query = `
      SELECT id, prompt, response_text
      FROM (
        SELECT id, prompt, response_text
        FROM ai_conversation_turns
        WHERE conversation_id = $1
        ORDER BY id DESC
        LIMIT $2
      ) AS context_turns
      ORDER BY id ASC
    `;
    const result = await pool.query(query, [conversationId, limit]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      prompt: row.prompt,
      responseText: row.response_text,
    }));
  }

  /**
   * 質問と回答を1往復として保存する
   */
  static async createTurn(
    conversationId: number,
    prompt: string,
    responseText: string
  ): Promise<AiConversationTurnRow> {
    const query = `
      INSERT INTO ai_conversation_turns (conversation_id, prompt, response_text)
      VALUES ($1, $2, $3)
      RETURNING id, conversation_id, prompt, response_text, created_at
    `;
    const result = await pool.query(query, [conversationId, prompt, responseText]);
    const row = result.rows[0];
    return {
      id: Number(row.id),
      conversationId: Number(row.conversation_id),
      prompt: row.prompt,
      responseText: row.response_text,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}