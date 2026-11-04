# Todo機能 実装計画書（03_implementation_plan.md）

## 1. 概要・設計方針

本ドキュメントは、`01_requirements.md`（要件定義書）および `02_design.md`（詳細設計書）を根拠とし、既存の Express + TypeScript + EJS アプリケーションに対して Todo 機能を安全かつ段階的に追加するための実装手順書です。

### 既存構造への適合と設計原則

1. **既存機能の完全保護**:
   * エントリーポイント `src/index.ts` に存在する既存ルート `/` および `/api/db-check` は一切変更しません。
   * 既存の PostgreSQL 接続プール (`src/db.ts`) をそのまま再利用します。
2. **モジュール構成とディレクトリ指定**:
   * SQL定義: `sql/todo/001_create_todo_tasks.sql`
   * ドキュメント: `docs/todo/README.md`
   * バックエンドモジュール: `src/apps/todo/`
   * 画面テンプレート: `views/todo/index.ejs`
   * フロントエンドビルド・静的配信: `public/todo/app.js`
3. **命名規則の整合性**:
   * **DBテーブル**: `todo_tasks` (`snake_case`)
   * **API / JSON**: `camelCase` (例: `isCompleted`, `createdAt`, `updatedAt`)
   * **フロントエンド通信クラス**: `TodoApi`

---

## 2. 実装工程ロードマップ

| 工程 | コンポーネント | 内容 |
| :--- | :--- | :--- |
| **工程 1** | SQL (Git保存) | `sql/todo/001_create_todo_tasks.sql` の作成・Git管理登録 |
| **工程 2** | DB (Neon手動実行) | Neon SQL Editor でのテーブル作成クエリ実行と構造確認 |
| **工程 3** | Project Config | `tsconfig.json` の include / exclude 調整 |
| **工程 4** | Backend (Model) | `src/apps/todo/todoModel.ts` の作成 (DBアクセス & 列名変換) |
| **工程 5** | Backend (Service) | `src/apps/todo/todoService.ts` の作成 (ビジネスロジック) |
| **工程 6** | Backend (Controller) | `src/apps/todo/todoController.ts` の作成 (レスポンス整形) |
| **工程 7** | Backend (Router) | `src/apps/todo/todoRouter.ts` の作成 (画面/API統合ルーター) |
| **工程 8** | Backend Integration | `src/index.ts` への `todoRouter` インポート・登録 |
| **工程 9** | Frontend (View) | `views/todo/index.ejs` の作成 (画面レイアウト) |
| **工程 10** | Frontend (TS Module) | `src/apps/todo/client/todoApi.ts` の作成 (Fetch処理) |
| **工程 11** | Frontend (App Logic) | `src/apps/todo/client/app.ts` の作成および `public/todo/app.js` の配置 |
| **工程 12** | E2E Testing | ローカルおよび Neon / Vercel 環境での全機能動作確認 |

---

## 3. 詳細実装ステップ

### 工程 1: テーブル作成SQLの作成とGit保存

* **目的**: データベース構造（`todo_tasks` テーブル）の定義変更を Git で履歴管理する。
* **対象ファイル**: `sql/todo/001_create_todo_tasks.sql` (新規作成)
* **作業内容**:
  `sql/todo/001_create_todo_tasks.sql` を作成し、以下の DDL を記述する。
  ```sql
  CREATE TABLE IF NOT EXISTS todo_tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      is_completed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ```
* **確認コマンド**:
  ```bash
  git status
  ```
* **期待結果**: `sql/todo/001_create_todo_tasks.sql` が追跡対象外 (Untracked) ファイルとして認識されること。
* **失敗時に最初に見る場所**: ディレクトリパス（`sql/todo/`）のスペルミス。

---

### 工程 2: Neon SQL Editor でのテーブル手動作成

* **目的**: Neon PostgreSQL 運用環境へ `todo_tasks` テーブルを手動で作成する。
* **対象環境**: Neon Console -> SQL Editor
* **作業内容**:
  1. Neon Console にログインし、プロジェクトの SQL Editor を開く。
  2. `sql/todo/001_create_todo_tasks.sql` の DDL をコピー＆ペーストして実行 (Run)。
* **確認コマンド**:
  Neon SQL Editor で以下のクエリを実行：
  ```sql
  SELECT column_name, data_type, is_nullable 
  FROM information_schema.columns 
  WHERE table_name = 'todo_tasks';
  ```
* **期待結果**: `id`, `title`, `is_completed`, `created_at`, `updated_at` の 5 カラムが取得できること。
* **失敗時に最初に見る場所**: Neon Dashboard で接続先のデータベース/ブランチを誤って選択していないか。

---

### 工程 3: Project Config (`tsconfig.json`) の調整

* **目的**: バックエンドコンパイル時にフロントエンド用 TS コード (`src/apps/todo/client/`) や別ターゲットが干渉しないよう設定を調整する。
* **対象ファイル**: `tsconfig.json`
* **作業内容**: `exclude` 設定項目にフロントエンドTS作業ディレクトリ等を追加する。
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true
    },
    "exclude": ["node_modules", "dist", "public"]
  }
  ```
* **確認コマンド**:
  ```bash
  npx tsc --noEmit
  ```
* **期待結果**: エラーなく型チェックが終了すること。
* **失敗時に最初に見る場所**: `tsconfig.json` 内の末尾カンマ等の JSON 構文エラー。

---

### 工程 4: バックエンド・モデル層 (`todoModel.ts`) の作成

* **目的**: `todo_tasks` テーブルに対する SQL 操作と、`snake_case` (DB) から `camelCase` (アプリ) へのデータ変換を担当する。
* **対象ファイル**: `src/apps/todo/todoModel.ts` (新規作成)
* **作業内容**:
  1. 既存の `src/db.ts` から `pool` をインポート。
  2. `TodoTask` インターフェースを定義 (`id`, `title`, `isCompleted`, `createdAt`, `updatedAt`)。
  3. 以下のデータアクセス関数を実装：
     * `findAll()`: `SELECT * FROM todo_tasks ORDER BY id ASC;`
     * `findById(id)`: `SELECT * FROM todo_tasks WHERE id = $1;`
     * `create(title)`: `INSERT INTO todo_tasks (title) VALUES ($1) RETURNING *;`
     * `updateStatus(id, isCompleted)`: `UPDATE todo_tasks SET is_completed = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`
     * `deleteById(id)`: `DELETE FROM todo_tasks WHERE id = $1 RETURNING id;`
* **確認コマンド**:
  ```bash
  npx tsc --noEmit
  ```
* **期待結果**: コンパイルエラーが発生しないこと。
* **失敗時に最初に見る場所**: `src/db.ts` のエクスポート形式（`pool`）と `todoModel.ts` 側のインポート名。

---

### 工程 5: バックエンド・サービス層 (`todoService.ts`) の作成

* **目的**: バリデーション、文字列トリム、存在チェック等のビジネスロジックをカプセル化する。
* **対象ファイル**: `src/apps/todo/todoService.ts` (新規作成)
* **作業内容**:
  * **要件 REQ-01**: `getAllTodos()` を実装。
  * **要件 REQ-02**: `createTodo(title)` を実装。前後の空白を `.trim()` し、長さが 1〜100 文字以外の場合はエラーを投げる。
  * **要件 REQ-03**: `updateTodoStatus(id, isCompleted)` を実装。`id` が 1 未満または非数値の場合はエラー、対象が存在しない場合は 404 用エラーを投げる。
  * **要件 REQ-04**: `deleteTodo(id)` を実装。対象が存在しない場合は 404 用エラーを投げる。
* **確認コマンド**:
  ```bash
  npx tsc --noEmit
  ```
* **期待結果**: コンパイルエラーが発生しないこと。
* **失敗時に最初に見る場所**: `todoModel` 呼出時の `await` 付け忘れ。

---

### 工程 6: バックエンド・コントローラー層 (`todoController.ts`) の作成

* **目的**: HTTP リクエストの解析、レスポンス形式 (`success`, `data`, `error`) の構築を行う。
* **対象ファイル**: `src/apps/todo/todoController.ts` (新規作成)
* **作業内容**:
  * `getTodos` (`GET /api/v1/todos`) -> `200 OK`
  * `createTodo` (`POST /api/v1/todos`) -> `201 Created` / `422 Unprocessable Entity` / `400 Bad Request`
  * `updateTodo` (`PATCH /api/v1/todos/:id`) -> `200 OK` / `400 Bad Request` / `404 Not Found` / `422 Unprocessable Entity`
  * `deleteTodo` (`DELETE /api/v1/todos/:id`) -> `204 No Content` / `400 Bad Request` / `404 Not Found`
* **確認コマンド**:
  ```bash
  npx tsc --noEmit
  ```
* **期待結果**: コンパイルエラーが発生しないこと。
* **失敗時に最初に見る場所**: HTTPレスポンスのステータスコードと JSON 構造（`02_design.md` の仕様と一致しているか）。

---

### 工程 7: バックエンド・ルーター統合モジュール (`todoRouter.ts`) の作成

* **目的**: 画面レンダリングルート (`/todo`) と API ルート (`/api/v1/todos`) を1つのルーターに集約する。
* **対象ファイル**: `src/apps/todo/todoRouter.ts` (新規作成)
* **作業内容**:
  ```typescript
  import { Router } from 'express';
  import * as todoController from './todoController';

  const router = Router();

  // 画面ルート
  router.get('/todo', (req, res) => {
    res.render('todo/index', { title: 'Todo 管理' });
  });

  // REST API ルート
  router.get('/api/v1/todos', todoController.getTodos);
  router.post('/api/v1/todos', todoController.createTodo);
  router.patch('/api/v1/todos/:id', todoController.updateTodo);
  router.delete('/api/v1/todos/:id', todoController.deleteTodo);

  export default router;
  ```
* **確認コマンド**:
  ```bash
  npx tsc --noEmit
  ```
* **期待結果**: ルーター定義が正常に型チェックを通過すること。
* **失敗時に最初に見る場所**: `todoController` からインポートした関数のシグネチャ。

---

### 工程 8: エントリーポイント (`src/index.ts`) への組み込み

* **目的**: 既存ルート（`/`, `/api/db-check`）を一切変更せず、`todoRouter` を追加登録する。
* **対象ファイル**: `src/index.ts`
* **作業内容**:
  1. `todoRouter` をインポート。
  2. 既存ルート定義の直下に `app.use('/', todoRouter);` を追加。
  ```typescript
  import express from 'express';
  import { pool } from './db';
  import todoRouter from './apps/todo/todoRouter'; // ★ 追加

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- 既存ルート (変更しない) ---
  app.get('/', (req, res) => { res.render('index', { title: 'Home' }); });
  app.get('/api/db-check', async (req, res) => { /* ... */ });

  // --- Todo 機能ルートの登録 ---
  app.use('/', todoRouter); // ★ 追加

  export default app;
  ```
* **確認コマンド**:
  ```bash
  npm run dev
  ```
  別ターミナルで cURL 実行:
  ```bash
  curl -i http://localhost:3000/api/v1/todos
  ```
* **期待結果**: 既存の `/` が動作しつつ、`GET /api/v1/todos` で `HTTP/1.1 200 OK` と `{"success":true,"data":[]}` が返ること。
* **失敗時に最初に見る場所**: `src/index.ts` で `app.use(express.json())` が `todoRouter` の登録より上部にあるか。

---

### 工程 9: 画面テンプレート (`views/todo/index.ejs`) の作成

* **目的**: Todo アプリのフロントエンド表示構造を定義する。
* **対象ファイル**: `views/todo/index.ejs` (新規作成)
* **作業内容**:
  * タイトル、タスク追加フォーム（入力テキスト + ボタン）、エラーメッセージ領域、Todo一覧表示要素 (`<ul id="todo-list"></ul>`) を配置。
  * `public/todo/app.js` を読み込む script タグを出力：
    `<script src="/todo/app.js" defer></script>`
* **確認コマンド**:
  ブラウザで `http://localhost:3000/todo` にアクセス。
* **期待結果**: HTML 構造が読み込まれ画面が表示されること。
* **失敗時に最初に見る場所**: `views/todo/index.ejs` のパスとファイル名。

---

### 工程 10: フロントエンド通信モジュール (`src/apps/todo/client/todoApi.ts`) の作成

* **目的**: ブラウザからの Fetch 通信処理を `TodoApi` クラスにカプセル化する。
* **対象ファイル**: `src/apps/todo/client/todoApi.ts` (新規作成)
* **作業内容**: `02_design.md` 節6に従い、`getAllTodos`, `createTodo`, `updateStatus`, `deleteTodo` メソッドを持つ `TodoApi` クラスを記述。
* **確認コマンド**:
  ファイル保存時構文チェック。
* **期待結果**: 通信メソッドが期待通りの型インターフェースを満たしていること。
* **失敗時に最初に見る場所**: `fetch` リクエスト時の `headers: { 'Content-Type': 'application/json' }` の指定漏れ。

---

### 工程 11: DOM操作ロジックの作成と `public/todo/app.js` の配置

* **目的**: DOM イベントハンドラを実装し、ブラウザで読み込み可能な JavaScript として `public/todo/app.js` に配置する。
* **対象ファイル**:
  * `src/apps/todo/client/app.ts` (ソース記述)
  * `public/todo/app.js` (配信ファイル)
* **作業内容**:
  1. `src/apps/todo/client/app.ts` を作成し、`TodoApi` インスタンスを用いた DOM 操作（一覧描画、登録、チェックボックス更新、削除）を実装。
  2. トランスパイル / バンドルを実施し、結果を `public/todo/app.js` として保存（または同等の機能を持つ Vanilla JS を生成・配置）。
* **確認コマンド**:
  ブラウザで `http://localhost:3000/todo` を開き、コンソールを確認。
* **期待結果**: DevTools の Console にエラーが出ず、初期化時に `GET /api/v1/todos` が自動実行されること。
* **失敗時に最初に見る場所**: `public/todo/app.js` へのアクセス (`http://localhost:3000/todo/app.js`) が `404` になっていないか。

---

### 工程 12: 統合・E2E 動作確認

* **目的**: 要件定義書 (`01_requirements.md`) の受け入れ条件を満たしていることを検証する。
* **対象環境**: ローカル環境 (`localhost:3000`) および Neon DB / Vercel Preview / Production
* **確認内容・手順**:
  1. **REQ-01 (一覧表示)**: 初期表示で登録済みの Todo 一覧が表示される（0件時は空リスト）。
  2. **REQ-02 (新規登録)**:
     * 有効値 (" テスト ") 送信 -> トリムされて保存・表示される。
     * 空白のみ/101文字以上送信 -> 画面にエラーメッセージが表示される (422)。
  3. **REQ-03 (状態更新)**: チェックボックス操作 -> チェック状態と文字装飾が切替わり、再読み込み後も保持される (200)。
  4. **REQ-04 (削除)**: 削除ボタン押下 -> 一覧から消去され、再読み込み後も存在しない (204)。
  5. **既存機能確認**: `/` および `/api/db-check` が問題なく動作すること。
* **確認コマンド**:
  ```bash
  npm run build && npm start
  ```
* **期待結果**: すべての操作が正常に動作し、Network タブでの各ステータスコードが設計通り返ること。
* **失敗時に最初に見る場所**: DevTools ネットワークタブのレスポンスボディ (`error.message`) およびサーバーの標準出力ログ。