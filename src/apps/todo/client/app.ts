import { TodoApi, TodoItem } from './todoApi';

document.addEventListener('DOMContentLoaded', () => {
  const api = new TodoApi();
  const form = document.getElementById('todo-form') as HTMLFormElement;
  const input = document.getElementById('todo-title-input') as HTMLInputElement;
  const list = document.getElementById('todo-list') as HTMLUListElement;
  const errorContainer = document.getElementById('error-container') as HTMLDivElement;

  const showError = (message: string) => {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
  };

  const hideError = () => {
    errorContainer.textContent = '';
    errorContainer.style.display = 'none';
  };

  const renderTodos = (todos: TodoItem[]) => {
    list.innerHTML = '';
    todos.forEach((todo) => {
      const li = document.createElement('li');

      const leftDiv = document.createElement('div');
      leftDiv.className = 'todo-item-left';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.isCompleted;
      checkbox.addEventListener('change', async () => {
        try {
          hideError();
          await api.updateStatus(todo.id, checkbox.checked);
          span.classList.toggle('completed', checkbox.checked);
        } catch (err: any) {
          checkbox.checked = !checkbox.checked;
          showError(err.error?.message || '状態の更新に失敗しました。');
        }
      });

      const span = document.createElement('span');
      span.textContent = todo.title;
      if (todo.isCompleted) span.classList.add('completed');

      leftDiv.appendChild(checkbox);
      leftDiv.appendChild(span);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.className = 'delete-btn';
      deleteBtn.addEventListener('click', async () => {
        try {
          hideError();
          await api.deleteTodo(todo.id);
          li.remove();
        } catch (err: any) {
          showError(err.error?.message || '削除に失敗しました。');
        }
      });

      li.appendChild(leftDiv);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });
  };

  const loadTodos = async () => {
    try {
      hideError();
      const todos = await api.getAllTodos();
      renderTodos(todos);
    } catch (err: any) {
      showError(err.error?.message || 'Todo一覧の取得に失敗しました。');
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = input.value;
    try {
      hideError();
      await api.createTodo(title);
      input.value = '';
      await loadTodos();
    } catch (err: any) {
      showError(err.error?.message || 'Todoの作成に失敗しました。');
    }
  });

  loadTodos();
});