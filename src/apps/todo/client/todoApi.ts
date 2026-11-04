export interface TodoItem {
  id: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export class TodoApi {
  private baseUrl = '/api/v1/todos';

  async getAllTodos(): Promise<TodoItem[]> {
    const res = await fetch(this.baseUrl);
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async createTodo(title: string): Promise<TodoItem> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async updateStatus(id: number, isCompleted: boolean): Promise<TodoItem> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async deleteTodo(id: number): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
      const json = await res.json();
      throw json;
    }
    return true;
  }
}