import { pool } from '../../../db';

export interface TodoTask {
  id: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TodoTaskRow {
  id: number;
  title: string;
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

const mapRowToTask = (row: TodoTaskRow): TodoTask => ({
  id: row.id,
  title: row.title,
  isCompleted: row.is_completed,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export const todoModel = {
  async findAll(): Promise<TodoTask[]> {
    const query = `
      SELECT id, title, is_completed, created_at, updated_at 
      FROM todo_tasks 
      ORDER BY id ASC;
    `;
    const result = await pool.query<TodoTaskRow>(query);
    return result.rows.map(mapRowToTask);
  },

  async findById(id: number): Promise<TodoTask | null> {
    const query = `
      SELECT id, title, is_completed, created_at, updated_at 
      FROM todo_tasks 
      WHERE id = $1;
    `;
    const result = await pool.query<TodoTaskRow>(query, [id]);
    if (result.rows.length === 0) return null;
    return mapRowToTask(result.rows[0]);
  },

  async create(title: string): Promise<TodoTask> {
    const query = `
      INSERT INTO todo_tasks (title) 
      VALUES ($1) 
      RETURNING id, title, is_completed, created_at, updated_at;
    `;
    const result = await pool.query<TodoTaskRow>(query, [title]);
    return mapRowToTask(result.rows[0]);
  },

  async updateStatus(id: number, isCompleted: boolean): Promise<TodoTask | null> {
    const query = `
      UPDATE todo_tasks 
      SET is_completed = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING id, title, is_completed, created_at, updated_at;
    `;
    const result = await pool.query<TodoTaskRow>(query, [isCompleted, id]);
    if (result.rows.length === 0) return null;
    return mapRowToTask(result.rows[0]);
  },

  async deleteById(id: number): Promise<boolean> {
    const query = `
      DELETE FROM todo_tasks 
      WHERE id = $1 
      RETURNING id;
    `;
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};