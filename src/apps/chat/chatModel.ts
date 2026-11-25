import { pool } from '../../../db';

export interface ChatMessageRow {
  id: number;
  roomId: string;
  userName: string;
  message: string;
  createdAt: string;
}

export class ChatModel {
  static async createMessage(
    roomId: string,
    userName: string,
    message: string
  ): Promise<ChatMessageRow> {
    const sql = `
      INSERT INTO chat_messages (room_id, user_name, message)
      VALUES ($1, $2, $3)
      RETURNING id, room_id, user_name, message, created_at
    `;
    const result = await pool.query(sql, [roomId, userName, message]);
    const row = result.rows[0];
    return {
      id: Number(row.id),
      roomId: row.room_id,
      userName: row.user_name,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  static async getRecentMessages(roomId: string, limit = 20): Promise<ChatMessageRow[]> {
    const sql = `
      SELECT id, room_id, user_name, message, created_at
      FROM (
        SELECT id, room_id, user_name, message, created_at
        FROM chat_messages
        WHERE room_id = $1
        ORDER BY id DESC
        LIMIT $2
      ) AS recent_messages
      ORDER BY id ASC
    `;
    const result = await pool.query(sql, [roomId, limit]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      roomId: row.room_id,
      userName: row.user_name,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  static async countActiveMembers(roomId: string): Promise<number> {
    await pool.query(
      'DELETE FROM chat_room_members WHERE room_id = $1 AND expires_at <= NOW()',
      [roomId]
    );
    const result = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM chat_room_members WHERE room_id = $1',
      [roomId]
    );
    return result.rows[0].cnt;
  }

  static async tryJoinRoom(
    roomId: string,
    memberToken: string,
    socketId: string,
    maxMembers = 5
  ): Promise<{ ok: boolean; memberCount: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [roomId]);
      await client.query(
        'DELETE FROM chat_room_members WHERE room_id = $1 AND expires_at <= NOW()',
        [roomId]
      );

      const existing = await client.query(
        'SELECT member_token FROM chat_room_members WHERE room_id = $1 AND member_token = $2',
        [roomId, memberToken]
      );

      if ((existing.rowCount ?? 0) > 0) {
        await client.query(
          `UPDATE chat_room_members
           SET socket_id = $1, expires_at = NOW() + INTERVAL '60 seconds'
           WHERE room_id = $2 AND member_token = $3`,
          [socketId, roomId, memberToken]
        );
      } else {
        const countRes = await client.query(
          'SELECT COUNT(*)::int AS cnt FROM chat_room_members WHERE room_id = $1',
          [roomId]
        );
        const currentCount: number = countRes.rows[0].cnt;
        if (currentCount >= maxMembers) {
          await client.query('ROLLBACK');
          return { ok: false, memberCount: currentCount };
        }

        await client.query(
          `INSERT INTO chat_room_members (member_token, room_id, socket_id, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '60 seconds')`,
          [memberToken, roomId, socketId]
        );
      }

      const afterRes = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM chat_room_members WHERE room_id = $1',
        [roomId]
      );
      await client.query('COMMIT');
      return { ok: true, memberCount: afterRes.rows[0].cnt };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async refreshMemberHeartbeat(
    roomId: string,
    memberToken: string
  ): Promise<boolean> {
    const result = await pool.query(
      `UPDATE chat_room_members
       SET expires_at = NOW() + INTERVAL '60 seconds'
       WHERE room_id = $1 AND member_token = $2 AND expires_at > NOW()`,
      [roomId, memberToken]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async isValidMember(roomId: string, memberToken: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM chat_room_members
       WHERE room_id = $1 AND member_token = $2 AND expires_at > NOW()
       LIMIT 1`,
      [roomId, memberToken]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async leaveBySocketId(
    roomId: string,
    socketId: string
  ): Promise<number> {
    await pool.query(
      'DELETE FROM chat_room_members WHERE room_id = $1 AND socket_id = $2',
      [roomId, socketId]
    );
    return this.countActiveMembers(roomId);
  }
}