import { todoModel, TodoTask } from './todoModel';

export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code: string = 'ERROR') {
    super(message);
    this.name = 'AppError';
  }
}

export const todoService = {
  async getAllTodos(): Promise<TodoTask[]> {
    return await todoModel.findAll();
  },

  async createTodo(titleInput: unknown): Promise<TodoTask> {
    if (typeof titleInput !== 'string') {
      throw new AppError(422, 'タイトルは文字列で指定してください。', 'VALIDATION_ERROR');
    }

    const trimmedTitle = titleInput.trim();
    if (trimmedTitle.length < 1 || trimmedTitle.length > 100) {
      throw new AppError(
        422,
        'タイトルは前後の空白を除き1文字以上100文字以内で入力してください。',
        'VALIDATION_ERROR'
      );
    }

    return await todoModel.create(trimmedTitle);
  },

  async updateTodoStatus(idParam: string, isCompletedInput: unknown): Promise<TodoTask> {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) {
      throw new AppError(400, 'IDは1以上の整数を指定してください。', 'BAD_REQUEST');
    }

    if (typeof isCompletedInput !== 'boolean') {
      throw new AppError(422, 'isCompleted は boolean 型で指定してください。', 'VALIDATION_ERROR');
    }

    const updatedTask = await todoModel.updateStatus(id, isCompletedInput);
    if (!updatedTask) {
      throw new AppError(404, `ID ${id} のTodoが見つかりません。`, 'NOT_FOUND');
    }

    return updatedTask;
  },

  async deleteTodo(idParam: string): Promise<void> {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) {
      throw new AppError(400, 'IDは1以上の整数を指定してください。', 'BAD_REQUEST');
    }

    const deleted = await todoModel.deleteById(id);
    if (!deleted) {
      throw new AppError(404, `ID ${id} のTodoが見つかりません。`, 'NOT_FOUND');
    }
  },
};