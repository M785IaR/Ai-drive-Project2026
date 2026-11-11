# AI質問機能 実装計画書 (`docs/ai/tasks.md`)

本ドキュメントは、要件定義書（`docs/ai/requirements.md`）および基本・詳細設計書（`docs/ai/spec.md`）に基づき、AI質問機能を追加するための段階的な実装手順を定義したタスク計画書です。

---

## 1. 課題区分の整理

授業時間内での着実な完了を目指し、タスクを「**標準課題**」と「**発展課題**」に分離して実装を進めます。

* **標準課題（必須）**: 
  * 既存アプリ構造への影響ゼロでのAIルーター・コントローラー・サービス構築
  * DBテーブル（`ai_qa_logs`）の自動生成とログ保存
  * 質問送信API（`/api/ai/ask`）とAI応答（実APIおよびデモ応答）の取得・画面表示
  * 入力バリデーション・タイムアウト・エラーハンドリングの適用
* **発展課題（拡張）**: 
  * 過去ログ一覧表示用 API（`/api/ai/logs`）および履歴表示UIセクションの実装
  * 高度なログフィルタリングや表示形式拡張

※ **注意事項**: 本計画書に基づく実装作業（コード変更）は、本計画の確認・承認後に開始します。

---

## 2. 段階的実装タスク一覧

### Phase 1: 共通準備 (Preparations)

#### TASK-01: ディレクトリ構造および環境変数定義の追加
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-N001`, `REQ-AI-N002` / `DES-AI-005`, `DES-AI-006`
* **変更対象ファイル**:
  * `src/apps/ai/` (新規ディレクトリを作成)
  * `.env.example`
  * `.gitignore`
* **作業内容**:
  1. `src/apps/ai/` ディレクトリを作成する。
  2. `.env.example` に `GEMINI_API_KEY=` を追記する。
  3. `.gitignore` に `.env` が含まれており、環境変数がバージョン管理外となることを確認する。
* **確認方法**: `git status` で `.env` が追記対象外となっていることを確認し、ディレクトリ構造を確認する。
* **期待結果**: AI機能用のディレクトリが準備され、機密情報がリポジトリに含まれない安全な構成となること。

#### TASK-02: 基本ルーティングとサーバー統合の初期設定
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-N001`, `REQ-AI-N003` / `DES-AI-005`, `DES-AI-007`
* **変更対象ファイル**:
  * `src/apps/ai/aiRouter.ts` (新規)
  * `src/apps/ai/aiController.ts` (新規)
  * `index.ts`
* **作業内容**:
  1. `aiController.ts` に動作確認用のダミーハンドラー（例: `healthCheck`）を作成する。
  2. `aiRouter.ts` を作成し、`/health` ルートを定義する。
  3. `index.ts` 内の既存TODOルーターの後ろ、かつ汎用404ハンドラーの前に `app.use('/api/ai', aiRouter)` を登録する。
* **確認方法**: サーバーを起動（`npm run dev`）し、`GET /api/ai/health` および既存のTODO機能（`/todo`）ヘアクセスする。
* **期待結果**: `/api/ai/health` で 200 OK が返り、かつ既存のTODO機能や404ハンドリングに影響がないこと。

---

### Phase 2: DB設計とログテーブル作成 (Database Setup)

#### TASK-03: `ai_qa_logs` テーブル作成モジュールの実装
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-D001` / `DES-AI-008`
* **変更対象ファイル**:
  * `src/apps/ai/aiModel.ts` (新規)
  * `index.ts` (またはDB初期化スクリプト)
* **作業内容**:
  1. `aiModel.ts` を作成し、`ai_qa_logs` テーブル（カラム: `id`, `question`, `answer`, `status`, `error_message`, `response_time_ms`, `created_at`）の DDL 実行関数 `initAiDatabase()` を実装する。
  2. 既存の SQLite データベース接続ロジック（`sqlite3` / `sqlite`）を利用してテーブルおよびインデックスを作成する。
  3. アプリケーション起動時に `initAiDatabase()` が呼び出されるよう統合する。
* **確認方法**: サーバー起動後、SQLite クライアントコマンドまたは GUI ツールで DB ファイルを開き、テーブル構造を確認する。
* **期待結果**: `ai_qa_logs` テーブルおよび `idx_ai_qa_logs_created_at`, `idx_ai_qa_logs_status` インデックスが正常に生成されること。

---

### Phase 3: 履歴APIの実装 (History API - 発展)

#### TASK-04: QAログ取得 Model / Controller の実装
* **区分**: 発展課題
* **対応REQ / DES**: `REQ-AI-D001` / `DES-AI-008`
* **変更対象ファイル**:
  * `src/apps/ai/aiModel.ts`
  * `src/apps/ai/aiController.ts`
  * `src/apps/ai/aiRouter.ts`
* **作業内容**:
  1. `aiModel.ts` に最新のログを最大10件取得する SQL 関数 `getRecentLogs(limit: number)` を実装する。
  2. `aiController.ts` に `getLogs` ハンドラーを作成し、`GET /api/ai/logs` で JSON レスポンスを返却する処理を記述する。
  3. `aiRouter.ts` に `router.get('/logs', aiController.getLogs)` を登録する。
* **確認方法**: cURL またはブラウザから `GET http://localhost:3000/api/ai/logs` を実行する。
* **期待結果**: HTTP 200 OK で空配列 `[]`（または既存ログの一覧）が JSON 形式で正しく取得できること。

---

### Phase 4: 模擬回答の保存とサービスロジック基盤 (Mock Response & Storage)

#### TASK-05: ログ保存処理とデモ用 AI サービスの実装
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-F002`, `REQ-AI-D001` / `DES-AI-002`, `DES-AI-008`
* **変更対象ファイル**:
  * `src/apps/ai/aiModel.ts`
  * `src/apps/ai/aiService.ts` (新規)
  * `src/apps/ai/aiController.ts`
  * `src/apps/ai/aiRouter.ts`
* **作業内容**:
  1. `aiModel.ts` に QA ログを1件挿入する `createLog(data)` 関数を実装する。
  2. `aiService.ts` を作成し、デモ用レスポンス（「[デモ応答] 質問を受信しました: 〜」）を生成して DB ログ保存（`status: 'DEMO'`）を行う `askQuestion` 関数の骨組みを実装する。
  3. `aiController.ts` に `postAsk` ハンドラーを実装し、`POST /api/ai/ask` での呼び出しを受け付ける。
* **確認方法**: API クライアント（Postman や cURL）等から `POST /api/ai/ask` に `{"question": "テスト質問"}` を送信する。
* **期待結果**: HTTP 200 OK でデモ応答が返却され、DB 内の `ai_qa_logs` にレコードが1件正常に追加されること。

---

### Phase 5: 実 AI (Gemini API) 連携の実装 (Real AI Integration)

#### TASK-06: Google Gen AI SDK の組み込みとタイムアウト制御
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-F002`, `REQ-AI-N002` / `DES-AI-002`, `DES-AI-006`
* **変更対象ファイル**:
  * `package.json`
  * `src/apps/ai/aiService.ts`
* **作業内容**:
  1. `@google/genai` パッケージをインストールする。
  2. `aiService.ts` 内で `process.env.GEMINI_API_KEY` を判定し、未設定の場合はデモモード、設定済みの場合は `GoogleGenAI` クライアントを呼び出す処理を分岐実装する。
  3. 呼び出し時に `AbortController` 等を用いた **10秒間のタイムアウト制限** および自動再試行無効化の設定を入れる。
  4. 正常応答時は DB ログのステータスを `'SUCCESS'` として記録し、レスポンスタイム（`response_time_ms`）を計測・保存する。
* **確認方法**: `.env` に有効な API キーを設定し、`POST /api/ai/ask` リクエストを送信する。
* **期待結果**: Gemini API からのリアルな回答テキストが JSON で返却され、DB ログに `status: 'SUCCESS'` および応答時間が記録されること。

---

### Phase 6: 履歴 UI セクションの実装 (History UI - 発展)

#### TASK-07: 過去ログ表示用 EJS / フロント JavaScript の実装
* **区分**: 発展課題
* **対応REQ / DES**: `REQ-AI-F001` / `DES-AI-001`
* **変更対象ファイル**:
  * `views/ai/_section.ejs` (新規)
  * `public/ai/ai.js` (新規)
* **作業内容**:
  1. `views/ai/_section.ejs` に「過去の質問履歴」表示エリアを追加する。
  2. `public/ai/ai.js` に `fetchLogs()` 関数を実装し、画面読み込み時に `/api/ai/logs` から履歴を取得してリスト表示する処理を記述する。
  3. 取得テキスト描画時には `textContent` を使用し XSS 対策を徹底する。
* **確認方法**: ブラウザで画面を開き、過去に送信した質問・回答の履歴一覧が表示されることを確認する。
* **期待結果**: 過去の質問と回答の履歴が安全にエスケープされて画面上に一覧表示されること。

---

### Phase 7: 送信 UI セクションの実装 (Send UI & State Management)

#### TASK-08: AI 質問入力フォームの UI / イベント連携実装
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-F001`, `REQ-AI-F002` / `DES-AI-001`, `DES-AI-002`
* **変更対象ファイル**:
  * `views/ai/_section.ejs`
  * `public/ai/ai.js`
  * `views/index.ejs` (または既存TODOビュー)
* **作業内容**:
  1. `views/ai/_section.ejs` に質問テキストエリア、リアルタイム文字数カウンター（`0 / 1000`）、送信ボタン、回答表示エリア、エラー表示領域を作成する。
  2. 既存の TOP 画面または TODO 画面のビューに `_section.ejs` を include で埋め込む。
  3. `public/ai/ai.js` にて送信ボタンイベントハンドラーを記述し、Fetch API で `POST /api/ai/ask` へ非同期送信する。
  4. 通信中は **送信ボタンを無効化 (disabled)** し、「AIが考え中...」の待機中状態（Loading）を表示する。
  5. 成功レスポンス受領後、回答領域に `textContent` を用いて描画する。
* **確認方法**: ブラウザから質問を入力して送信ボタンを押し、UIの状態遷移（待機中 → 成功表示）を確認する。
* **期待結果**: ボタン連打が防止され、応答受領後にスムーズに回答テキストが画面に表示されること。

---

### Phase 8: 異常系ハンドリングとバリデーション (Error Handling & Edge Cases)

#### TASK-09: バリデーション、タイムアウト、例外伝播の強化
* **区分**: 標準課題
* **対応REQ / DES**: `REQ-AI-F003`, `REQ-AI-F004` / `DES-AI-003`, `DES-AI-004`
* **変更対象ファイル**:
  * `public/ai/ai.js`
  * `src/apps/ai/aiController.ts`
  * `src/apps/ai/aiService.ts`
* **作業内容**:
  1. **入力バリデーション**: フロントエンドおよび `aiController.ts` で文字数チェック（1〜1,000文字）を実装し、違反時に HTTP 400 および「1文字以上1000文字以内で入力してください」を返却する。
  2. **例外ハンドリングの伝播**: `aiController.ts` の `try-catch` 内で予期せぬエラーが発生した場合、`next(error)` を呼び出して Express 共通エラーハンドラーへ渡す。
  3. **DB保存失敗時のフォールバック**: Gemini API の呼び出しが成功していれば、DB保存で例外が発生してもクライアントには HTTP 200 で回答を返却し、エラーは `console.error` でログ出力する。
  4. **エラー画面表示**: 4xx / 5xx エラー時、フロントエンドの入力テキストを保持したまま赤文字でエラーメッセージを表示する。
* **確認方法**: 
  - 空文字および 1,001 文字の入力で送信する。
  - 無効な API キーを設定して送信する。
* **期待結果**: バリデーションエラーおよびAPI通信エラー時に、サーバーがクラッシュせず適切にユーザー向けエラーメッセージが表示されること。

---

### Phase 9: Preview 確認と全体検証 (Preview Testing & Verification)

#### TASK-10: 全要件受入条件の最終検証
* **区分**: 標準課題
* **対応REQ / DES**: 全 `REQ-AI-*` / 全 `DES-AI-*`
* **変更対象ファイル**: なし（テスト・検証作業）
* **作業内容**:
  1. デモモード環境（`GEMINI_API_KEY` 未設定）での動作確認。
  2. 実 API 環境（`.env` に鍵設定）での 1問1答レスポンス動作確認。
  3. 既存の TODO CRUD 機能、既存DB接続、および未定義ルートヘの 404 ハンドリングが正常動作することの回帰テスト実施。
  4. XSS 攻撃用文字列（`<script>alert(1)</script>` 等）を質問・回答に入力し、安全にエスケープ表示されることを確認する。
* **確認方法**: 設計書 `spec.md` 第10章の検証・テスト確認方法に従い全項目を手動テストする。
* **期待結果**: `REQ-AI-F001`〜`REQ-AI-D001` のすべての受入条件を満たしていることが確認できること。

---

## 3. タスク進捗管理チェックリスト

- [ ] **Phase 1: 共通準備** (TASK-01, TASK-02)
- [ ] **Phase 2: DB設計** (TASK-03)
- [ ] **Phase 3: 履歴API (発展)** (TASK-04)
- [ ] **Phase 4: 模擬回答の保存** (TASK-05)
- [ ] **Phase 5: 実 AI 連携** (TASK-06)
- [ ] **Phase 6: 履歴 UI (発展)** (TASK-07)
- [ ] **Phase 7: 送信 UI** (TASK-08)
- [ ] **Phase 8: 異常系ハンドリング** (TASK-09)
- [ ] **Phase 9: Preview 確認** (TASK-10)