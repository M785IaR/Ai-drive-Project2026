import { Router } from 'express';
import * as todoController from './todoController';

const router = Router();

// 画面表示ルート (/todo と /todo/ の両方に対応)
router.get(['/todo', '/todo/'], (req, res) => {
  res.render('todo/index', { title: 'Todo 管理' });
});

// REST API 4操作ルート
router.get('/api/v1/todos', todoController.getTodos);
router.post('/api/v1/todos', todoController.createTodo);
router.patch('/api/v1/todos/:id', todoController.updateTodo);
router.delete('/api/v1/todos/:id', todoController.deleteTodo);

export default router;