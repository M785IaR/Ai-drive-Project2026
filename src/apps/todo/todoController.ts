import { Request, Response } from 'express';
import { todoService, AppError } from './todoService';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  console.error('Unhandled Controller Error:', error);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'サーバー内部エラーが発生しました。',
    },
  });
};

export const getTodos = async (req: Request, res: Response) => {
  try {
    const todos = await todoService.getAllTodos();
    return res.status(200).json({
      success: true,
      data: todos,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const createTodo = async (req: Request, res: Response) => {
  try {
    const { title } = req.body || {};
    const newTodo = await todoService.createTodo(title);
    return res.status(201).json({
      success: true,
      data: newTodo,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateTodo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isCompleted } = req.body || {};
    const updatedTodo = await todoService.updateTodoStatus(
      Array.isArray(id) ? id[0] ?? '' : id,
      isCompleted,
    );
    return res.status(200).json({
      success: true,
      data: updatedTodo,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

export const deleteTodo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await todoService.deleteTodo(Array.isArray(id) ? id[0] ?? '' : id);
    return res.status(204).send();
  } catch (error) {
    return handleError(res, error);
  }
};