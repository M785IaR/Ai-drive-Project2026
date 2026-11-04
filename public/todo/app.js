// public/todo/app.js

class TodoApi {
  constructor() {
    this.baseUrl = '/api/v1/todos';
  }

  async getAllTodos() {
    const res = await fetch(this.baseUrl);
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async createTodo(title) {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async updateStatus(id, isCompleted) {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    const json = await res.json();
    if (!res.ok) throw json;
    return json.data;
  }

  async deleteTodo(id) {
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

document.addEventListener('DOMContentLoaded', () => {
  const api = new TodoApi();
  const form = document.getElementById('todo-form');
  // IDの表記揺れに対応（todo-input と todo-title-input の両方に対応）
  const input = document.getElementById('todo-input') || document.getElementById('todo-title-input');
  const list = document.getElementById('todo-list');
  const errorContainer = document.getElementById('error-container') || document.getElementById('error-alert');

  const showError = (message) => {
    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.style.display = 'block';
    } else {
      alert(message);
    }
  };

  const hideError = () => {
    if (errorContainer) {
      errorContainer.textContent = '';
      errorContainer.style.display = 'none';
    }
  };

  const renderTodos = (todos) => {
    if (!list) return;
    list.innerHTML = '';
    if (todos.length === 0) {
      list.innerHTML = '<li class="empty-message">タスクがありません。</li>';
      return;
    }

    todos.forEach((todo) => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.isCompleted ? 'completed' : ''}`;

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
        } catch (err) {
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
        } catch (err) {
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
    } catch (err) {
      showError(err.error?.message || 'Todo一覧の取得に失敗しました。');
    }
  };

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input ? input.value : '';
      try {
        hideError();
        await api.createTodo(title);
        if (input) input.value = '';
        await loadTodos();
      } catch (err) {
        showError(err.error?.message || 'Todoの作成に失敗しました。');
      }
    });
  }

  loadTodos();
});
//