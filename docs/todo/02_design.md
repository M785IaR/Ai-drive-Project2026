# TODOアプリ V1 詳細設計書

## 1. 概要・要件対応マッピング

本設計書は、`01_requirements.md`（以下、要件定義書）に基づき、既存の Express + TypeScript + EJS アプリケーションに対して追加する TODO 管理機能のシステム設計を定義するものです。

### 要件対応表
| 要件ID | 機能名 | 対応する画面/API | 概要 |
| :--- | :--- | :--- | :--- |
| **REQ-01** | Todo一覧取得 | `GET /api/v1/todos` | 登録済みTodoを取得し画面にリスト表示 |
| **REQ-02** | Todo新規登録 | `POST /api/v1/todos` | トリム処理後、1〜100文字のタイトルを新規保存 |
| **REQ-03** | Todo完了状態部分更新 | `PATCH /api/v1/todos/:id` | Todoの完了/未完了フラグ (`isCompleted`) を更新 |
| **REQ-04** | Todo削除 | `DELETE /api/v1/todos/:id` | 指定したIDのTodoを削除 |

---

## 2. ディレクトリ構造および追加・変更ファイル一覧

指定されたディレクトリ構成規則に従い、追加・変更ファイルを以下の通り整理します。

```text
.
├── sql/
│   └── todo/
│       └── 001_create_todo_tasks.sql # SQLテーブル定義ファイル
├── docs/
│   └── todo/
│       └── README.md                 # Todo機能ドキュメント
├── src/
│   ├── index.ts                      # 既存エントリーポイント（todoRouter追加登録）
│   ├── apps/
│   │   └── todo/                     # バックエンドTodoモジュール・TSソース
│   │       ├── todoRouter.ts         # /todo 画面および /api/v1/todos を束ねるルーター
│   │       ├── todoController.ts     # コントローラー（リクエスト検証・レスポンス整形）
│   │       ├── todoService.ts        # ビジネスロジック層
│   │       ├── todoModel.ts          # データアクセス層 (SQL実行)
│   │       └── client/               # フロントエンド用 TypeScript ソース
│   │           ├── todoApi.ts        # Fetch API カプセル化クラス
│   │           └── app.ts            # DOM操作・イベントハンドラ
├── views/
│   └── todo/
│       └── index.ejs                 # TODO管理画面テンプレート (`/todo`)
└── public/
    └── todo/
        └── app.js                    # クライアント用ビルド済みJS (ブラウザで直接読み込み)
```

---

## 3. データベース設計 (Neon PostgreSQL)

### テーブル名: `todo_tasks`

| 列名 (snake_case) | 型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | TODOを一意に識別するID（1以上の整数） |
| `title` | `VARCHAR(100)` | `NOT NULL` | TODOのタイトル（1〜100文字） |
| `is_completed` | `BOOLEAN` | `NOT NULL DEFAULT false` | 完了フラグ (`true`: 完了, `false`: 未完了) |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 作成日時 |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL DEFAULT CURRENT_TIMESTAMP` | 最終更新日時 |

---

## 4. REST API 4操作 詳細仕様マッピング表

JSONキーは **camelCase**、DB列名は **snake_case** を使用します。

| 要件ID | HTTPメソッド | URL | リクエスト本文 (JSON) | 成功ステータス | 失敗ステータス | レスポンスJSON例 / DB処理 / `TodoApi` メソッド | 確認方法 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | `GET` | `/api/v1/todos` | なし | `200 OK` | `500 Internal Server Error` | **[JSON成功例]**<br>```json\n{\n  "success": true,\n  "data": [\n    {\n      "id": 1,\n      "title": "タスク1",\n      "isCompleted": false,\n      "createdAt": "2026-11-04T05:00:00.000Z",\n      "updatedAt": "2026-11-04T05:00:00.000Z"\n    }\n  ]\n}\n```<br>**[DB処理]**<br>`SELECT id, title, is_completed, created_at, updated_at FROM todo_tasks ORDER BY id ASC;`<br>**[TodoApiメソッド]**<br>`getAllTodos()` | `/todo` にアクセスし、DevToolsのネットワークタブで `GET /api/v1/todos` のステータスが `200` かつ正しく配列が返るか確認する。 |
| **REQ-02** | `POST` | `/api/v1/todos` | ```json\n{\n  "title": "買い物に行く"\n}\n``` | `201 Created` | `400 Bad Request`<br>`422 Unprocessable Entity`<br>`500 Internal Server Error` | **[JSON成功例]**<br>```json\n{\n  "success": true,\n  "data": {\n    "id": 2,\n    "title": "買い物に行く",\n    "isCompleted": false,\n    "createdAt": "2026-11-04T05:10:00.000Z",\n    "updatedAt": "2026-11-04T05:10:00.000Z"\n  }\n}\n```<br>**[JSON失敗例 (422)]**<br>```json\n{\n  "success": false,\n  "error": {\n    "code": "VALIDATION_ERROR",\n    "message": "タイトルは前後の空白を除き1文字以上100文字以内で入力してください。"\n  }\n}\n```<br>**[DB処理]**<br>`INSERT INTO todo_tasks (title) VALUES ($1) RETURNING *;`<br>**[TodoApiメソッド]**<br>`createTodo(title: string)` | 画面フォームから正常値（例: " テスト "）および異常値（空文字、101文字以上）を送信し、トリム保存およびエラー表示を確認する。 |
| **REQ-03** | `PATCH` | `/api/v1/todos/:id` | ```json\n{\n  "isCompleted": true\n}\n``` | `200 OK` | `400 Bad Request`<br>`404 Not Found`<br>`422 Unprocessable Entity`<br>`500 Internal Server Error` | **[JSON成功例]**<br>```json\n{\n  "success": true,\n  "data": {\n    "id": 1,\n    "title": "タスク1",\n    "isCompleted": true,\n    "createdAt": "2026-11-04T05:00:00.000Z",\n    "updatedAt": "2026-11-04T05:15:00.000Z"\n  }\n}\n```<br>**[DB処理]**<br>`UPDATE todo_tasks SET is_completed = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`<br>**[TodoApiメソッド]**<br>`updateStatus(id: number, isCompleted: boolean)` | 画面リスト内のチェックボックスを操作し、ネットワークタブで `200 OK` が返り、DB・画面が更新されるか確認する。 |
| **REQ-04** | `DELETE` | `/api/v1/todos/:id` | なし | `204 No Content` | `400 Bad Request`<br>`404 Not Found`<br>`500 Internal Server Error` | **[JSON成功例]**<br>Empty Body (本文なし)<br>**[DB処理]**<br>`DELETE FROM todo_tasks WHERE id = $1 RETURNING id;`<br>**[TodoApiメソッド]**<br>`deleteTodo(id: number)` | 画面の削除ボタンを押下し、`204 No Content` が返り、要素が画面およびDBから削除されることを確認する。 |

---

## 5. エントリーポイント (`src/index.ts`) への組み込み位置

既存の TOP 画面 (`/`) および DB 導通チェック (`/api/db-check`) を保持したまま、`todoRouter` を登録します。

```typescript
// src/index.ts の編集イメージ
import express from 'express';
import { pool } from './db'; // 既存のDB接続を再利用
import todoRouter from './apps/todo/todoRouter'; // ★ 追加

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 既存ルート（変更しない） ---
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

app.get('/api/db-check', async (req, res) => {
  // 既存のDB導通確認処理...
});

// --- TODO機能ルートの追加（既存ルートの直下に登録） ---
// 画面用 (/todo) および API用 (/api/v1/todos) を todoRouter 内で統合してバインド
app.use('/', todoRouter); // ★ todoRouter 内で /todo と /api/v1/todos をルーティング

export default app;
```

---

## 6. クライアント側通信モジュール (`TodoApi`) 設計

フロントエンド (`public/todo/app.js` の元となる `src/apps/todo/client/todoApi.ts`) では Fetch 通信をカプセル化します。

```typescript
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
    if (!res.ok) throw await res.json();
    const result = await res.json();
    return result.data;
  }

  async createTodo(title: string): Promise<TodoItem> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw await res.json();
    const result = await res.json();
    return result.data;
  }

  async updateStatus(id: number, isCompleted: boolean): Promise<TodoItem> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted }),
    });
    if (!res.ok) throw await res.json();
    const result = await res.json();
    return result.data;
  }

  async deleteTodo(id: number): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw await res.json();
    return true;
  }
}
```

---

## 7. 曖昧な点・注意事項（要確認事項）

以下の事項については現時点で確定していないため、実装および運用前にチーム/受講者間で合意・確認が必要です。

1. **【要確認】フロントエンド TypeScript のビルド方式**
   * `src/apps/todo/client/` 配下の TS コードを `public/todo/app.js` に変換・ビルドするための手段（`tsc` のマルチ構成, `esbuild`, Vite, または手動トランスパイル等）の選定。
2. **【要確認】EJS 画面のコンポーネント分割 / 共通ヘッダー・フッター**
   * `views/todo/index.ejs` 単体で全 HTML 構造を持つか、既存の `views/partials/`（存在する場合）を利用してレイアウトを共通化するか。
3. **【要確認】Neon DB トランザクション管理および接続エラー時の再試行 policy**
   * ネットワーク瞬断時のコネクションプール再試行ロジックの必要性。
4. **【要確認】レスポンスデータにおける `createdAt` / `updatedAt` のフォーマット**
   * ISO 8601 文字列（`2026-11-04T05:00:00.000Z`）として即座に返却するか、サーバー側で特定のタイムゾーン（JST等）に文字列整形するか。