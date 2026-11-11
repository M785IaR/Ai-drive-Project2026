# AI質問機能 基本・詳細設計書 (`docs/ai/spec.md`)

## 1. システムアーキテクチャ・役割分担

本機能は既存の Express / TypeScript Web アプリケーションに追加され、ユーザーからの質問をバックエンド経由で外部 Gemini API へ中継し、応答および履歴の保存を行います。

```
[ ブラウザ ] <--- (HTML/AJAX) ---> [ Express サーバー ] <--- (SDK/HTTPS) ---> [ Gemini API ]
                                            |
                                      (SQL / sqlite3)
                                            v
                                     [ SQLite DB ]
```

### コンポーネント別の役割分担
* **ブラウザ（フロントエンド）**:
  * TOP画面 / TODO画面内に配置された AI質問UIのレンダリング
  * ユーザー入力のバリデーション（空文字チェック、文字数制限チェック）
  * バックエンド API（`/api/ai/ask`）への非同期リクエスト（`fetch`）の送信
  * 応答待機（ローディング表示）および取得データの画面表示（XSS対策を施した安全なエスケープ表示）
* **Express サーバー（バックエンド）**:
  * ルーティング処理（`/ai`, `/api/ai/*`）
  * 受信リクエストの入力検証およびセキュリティチェック
  * 環境変数（`GEMINI_API_KEY`）を用いた外部 AI API（Gemini API）の呼び出し
  * 実行結果・ログの SQLite データベースへの非同期記録（`ai_qa_logs`）
  * グローバルエラーハンドラーと連携した例外捕捉と安全なレスポンス返却
* **Gemini API（外部サービス）**:
  * プロンプト（質問文）を受け取り、LLM による回答テキストを生成・返却
* **SQLite DB（データベース）**:
  * 質問内容、AI回答、ステータス、レスポンスタイム等の品質・監視用ログ（`ai_qa_logs`）の永続化

---

## 2. ディレクトリ構成とレイヤー責務

既存の `src/apps/todo/` の設計パターンに倣い、AI機能用ディレクトリ `src/apps/ai/` を独立させて新設します。

### ファイル配置
```
src/
├── apps/
│   └── ai/
│       ├── aiRouter.ts       # ルーティング定義
│       ├── aiController.ts   # HTTPリクエスト/レスポンス制御・バリデーション
│       ├── aiService.ts      # Gemini API呼び出し・ビジネスロジック
│       └── aiModel.ts        # DB操作 (ai_qa_logs テーブルへのアクセス)
public/
└── ai/
    └── ai.js                 # フロントエンド用スクリプト (DOM操作, Fetch通信)
views/
└── ai/
    └── _section.ejs          # TOP/TODO画面へ埋め込むAI質問セクションコンポーネント
```

### レイヤーの責務定義
| レイヤー | 担当ファイル | 主な責務 |
| :--- | :--- | :--- |
| **Router** | `aiRouter.ts` | パス（`/api/ai/ask`等）と Controller メソッドのマッピング定義。 |
| **Controller** | `aiController.ts` | リクエストデータの抽出・型検証・文字数バリデーション、Service呼び出し、HTTPステータスコードに応じたレスポンス整形、`next(err)` への例外ハンドリング伝播。 |
| **Service** | `aiService.ts` | 外部 Gemini API SDK との通信処理、タイムアウト制御、レスポンス解析、デモモード（ダミー応答）の制御、Model を呼び出してのログ保存要求。 |
| **Model** | `aiModel.ts` | SQLite データベースへの `ai_qa_logs` テーブル作成 (DDL) およびログレコードの挿入 (SQL実行)。 |

---

## 3. 画面設計とUI状態遷移

TOP画面およびTODO画面の下部に埋め込み可能なセクション (`views/ai/_section.ejs`) として実装します。

### 構成要素
1. **質問入力テキストエリア**: ユーザーが質問を入力（1〜1,000文字）
2. **文字数カウンター**: 入力文字数を動的表示（例: `0 / 1000`）
3. **送信ボタン**: クリック時にバックエンド API へ非同期リクエストを送信
4. **ステータス・エラー表示エリア**: メッセージやローディングインジケーターを表示
5. **回答表示エリア**: AIからの応答テキストを表示

### 画面の状態定義
| 状態 | 表示仕様・トリガー | ボタン制御 |
| :--- | :--- | :--- |
| **1. 初期状態** | ページ読み込み完了時。入力エリアは空、回答・エラーエリアは非表示。 | 有効（入力時） |
| **2. 待機中 (Loading)** | 送信ボタン押下直後。スピナー表示「AIが考え中...」を表示。 | **無効 (disabled)** |
| **3. 成功 (Success)** | APIから200レスポンス取得時。取得した回答テキストを表示。 | 有効 |
| **4. 0件状態 (Empty response)** | AIからの回答テキストが空で返却された場合。「回答が得られませんでした」とインライン表示。 | 有効 |
| **5. 失敗 (Error)** | 通信エラー、4xx/5xxエラー時。赤文字でエラーメッセージを表示（既存入力テキストは保持）。 | 有効 |

---

## 4. API詳細仕様

### 質問送信・AI応答取得 API
* **URL**: `/api/ai/ask`
* **HTTP Method**: `POST`
* **Content-Type**: `application/json`

#### リクエストボディ
```json
{
  "question": "TypeScriptの利点を教えてください。"
}
```

#### レスポンス仕様

##### 1. 成功時 (`HTTP 200 OK`)
```json
{
  "success": true,
  "data": {
    "question": "TypeScriptの利点を教えてください。",
    "answer": "TypeScriptは静的型付けを提供し、コードの保守性と予測可能性を向上させます。",
    "createdAt": "2026-11-11T05:53:00.000Z"
  }
}
```

##### 2. バリデーションエラー時 (`HTTP 400 Bad Request`)
```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "質問メッセージは1文字以上、1000文字以内で入力してください。"
  }
}
```

##### 3. APIキー未設定 / 接続失敗時 (`HTTP 503 Service Unavailable` または `HTTP 500 Internal Server Error`)
```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_UNAVAILABLE",
    "message": "AIサービスの呼び出しに失敗しました。時間をおいて再度お試しください。"
  }
}
```

---

## 5. データベース設計 (`ai_qa_logs`)

データ保持はデバッグ・ログ目的とし、`ai_qa_logs` テーブルを作成します。

### テーブル定義 (DDL)
```sql
CREATE TABLE IF NOT EXISTS ai_qa_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT,
    status TEXT NOT NULL, -- 'SUCCESS', 'ERROR', 'TIMEOUT'
    error_message TEXT,
    response_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_created_at ON ai_qa_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_status ON ai_qa_logs(status);
```

### カラム制約と役割
* `id`: ログID（主キー、自動採番）
* `question`: 送信された質問内容（必須）
* `answer`: AIから返却された応答文（エラー時は `NULL` 許容）
* `status`: 処理結果ステータス (`SUCCESS`, `ERROR`, `TIMEOUT`)
* `error_message`: 失敗時に記録する内部エラー概要
* `response_time_ms`: API呼出開始から完了までの計測時間 (ミリ秒)
* `created_at`: ログ記録日時（デフォルト現在日時）

---

## 6. サーバー統合・ミドルウェア登録順序

`index.ts` におけるミドルウェア、ルーター、404ハンドラー、およびエラーハンドラーの順序は厳密に維持する必要があります。

### 登録順序仕様
1. **基本ミドルウェア群**:
   * `express.json()` / `express.urlencoded()`（Bodyパーサー）
   * 静的ファイル提供 (`express.static('public')`)
2. **アプリケーションルーター群**:
   * 既存TODOルーター (`app.use('/todo', todoRouter)`)
   * **新規AIルーター (`app.use('/api/ai', aiRouter)`)**  <-- 既存機能の前に安全に追加
3. **404 汎用ルーティングハンドラー**:
   * 未定義ルートへのアクセスを捕獲する `app.use((req, res, next) => ...)`
4. **グローバルエラーハンドラー (最下部)**:
   * 4つの引数を持つ例外捕捉ミドルウェア `app.use((err, req, res, next) => ...)`

---

## 7. セキュリティ設計

1. **秘密情報の保護**:
   * APIキーはソースコード内に直書きせず、`process.env.GEMINI_API_KEY` より取得。
   * `.env` ファイルは `.gitignore` に指定し、バージョン管理から厳格に除外。
2. **XSS (Cross-Site Scripting) 対策**:
   * フロントエンド (`public/ai/ai.js`) で取得したAI応答テキストを HTML に挿入する際、`innerHTML` は使用せず `textContent` を使用して自動エスケープを実施。
3. **SQL インジェクション対策**:
   * SQLite 操作時は必ずプレースホルダー (`?`) を使用したパラメータ化クエリを実行。
4. **ログの機密性確保**:
   * サーバーログや `ai_qa_logs` には APIキーやヘッダーの認証情報を含めない。

---

## 8. エラーハンドリング・タイムアウト・再試行

1. **タイムアウト制御**:
   * 外部 Gemini API 通信には **10秒** のタイムアウト制限（`AbortController` 等を利用）を設定。制限超過時は HTTP 504 (Gateway Timeout) 相当のエラーコードを返却。
2. **SDKの自動再試行（Retry）無効化**:
   * APIクライアントの自動再試行機能はオフとし、ネットワーク断や一時的障害発生時も即座にエラーレスポンスを返却。
3. **部分成功の扱い**:
   * AIからの応答が途中で切れた場合や空文字の場合、`status = 'ERROR'` または空文字検知として処理し、クライアントには安全なエラーメッセージを提示。
4. **グローバルエラーハンドラーへの伝播**:
   * コントローラー内の `try-catch` ブロックで例外を捕獲した場合は、必ず `next(error)` を呼び出して Express 共通エラー処理へ引き渡す。

---

## 9. 動作環境・運用 (Preview / Production)

* **開発・プレビュー環境 (Preview)**:
  * `.env` ファイルにテスト用 APIキーを設定。
  * `GEMINI_API_KEY` 未設定時は「デモモード」として動作させ、事前定義された定型レスポンスを返却可能とする（開発遅延防止）。
* **本番運用環境 (Production)**:
  * クラウドプラットフォーム（Vercel, Render, Heroku等）の環境変数設定画面にて `GEMINI_API_KEY` を安全に注入。
  * APIキー未設定状態でのリクエストに対しては、システムログに警告を出力し、クライアントには `HTTP 503` (Service Unavailable) を返却。

---

## 10. 要件・設計対応表および確認方法 (REQ / DES)

| 要件ID | 設計ID | 対応する設計内容 | 検証・テスト確認方法 |
| :--- | :--- | :--- | :--- |
| **REQ-AI-F001** | **DES-AI-001** | 画面要素およびUI状態遷移（第3章） | ブラウザで画面を開き、入力フォームおよび文字数カウンターが存在することを確認。 |
| **REQ-AI-F002** | **DES-AI-002** | API詳細仕様およびレスポンス形式（第4章） | 質問を送信し、非同期でAI応答が画面に表示されること、通信中は送信ボタンが非活性化されることを確認。 |
| **REQ-AI-F003** | **DES-AI-003** | 入力検証とエラーメッセージ（第3, 4章） | 空文字および1,000文字超の質問送信時に、400エラーと警告メッセージが表示されることを確認。 |
| **REQ-AI-F004** | **DES-AI-004** | 例外ハンドリングと Express エラー連携（第6, 8章） | 意図的に例外を発生させ、サーバーがクラッシュせず `next(err)` 経由でエラーログが記録されることを確認。 |
| **REQ-AI-N001** | **DES-AI-005** | ルーティングとモジュール分離（第2, 6章） | `src/apps/ai/` 配下に構成ファイルが分離され、`aiRouter` が正しく組み込まれていることを確認。 |
| **REQ-AI-N002** | **DES-AI-006** | 環境変数による秘密情報保護（第7章） | `.gitignore` に `.env` が設定され、コード内にAPIキーが直接記述されていないことを確認。 |
| **REQ-AI-N003** | **DES-AI-007** | 既存機能への影響ゼロ（第6章） | AI機能追加後も既存TODOのCRUD機能、既存DB接続、404ハンドリングが問題なく動作することを確認。 |
| **REQ-AI-D001** | **DES-AI-008** | DBスキーマ `ai_qa_logs`（第5章） | SQLite DB内に `ai_qa_logs` テーブルが生成され、質問・回答ログが正常にインサートされることを確認。 |