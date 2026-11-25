# AI質問アプリ V2 実装手順書

* **保存先**: `docs/ai/v2/implementation-plan.md`
* **対象システム**: AI質問アプリ V2（会話継続・話題別管理機能）
* **参照元**: `docs/ai/v2/requirements.md`、`docs/ai/v2/design.md`、V1リポジトリ構成
* **作成日**: 2026-11-25
* **運用ルール**:
  * 各作業（`TASK-V2-01` 〜 `TASK-V2-05`）は上から1つずつ順番に実施し、「次へ進む条件」を満たしてから次の作業へ進むこと。
  * 実測・判定欄は学生が実際に操作・検証を行った後に記入すること（未実施の項目を「合格」にしないこと）。

---

## 1. 全体タスク一覧

| タスクID | 対応REQ・DES | 作業概要 | 主な変更・確認対象 |
| :--- | :--- | :--- | :--- |
| **TASK-V2-01** | REQ-V2-06<br>DES-V2-05 | V1疎通確認、要確認事項の確定、作業ブランチ作成 | `package.json`, `index.ts`, `src/apps/ai/*`, `.env.example`, Gitブランチ |
| **TASK-V2-02** | REQ-V2-01, 02, 05<br>DES-V2-02, 03, 05 | V2専用DBテーブル作成、会話作成・一覧・履歴取得APIの実装 | `sql/ai/040_create_ai_conversations.sql`, `src/apps/ai/v2/*`, `index.ts` |
| **TASK-V2-03** | REQ-V2-03, 04, 05<br>DES-V2-02, 03, 04 | 文脈付き質問送信処理（最新5往復組立・Gemini呼出・1往復保存）の実装 | `src/apps/ai/v2/aiV2Model.ts`, `aiV2Service.ts`, `aiV2Controller.ts`, `aiV2Router.ts` |
| **TASK-V2-04** | REQ-V2-01 〜 05<br>DES-V2-01 | V2画面（`/ai/v2/`）の実装（一覧・切替・再開・送信・失敗時復帰） | `public/ai/v2/index.html`, `public/ai/v2/app.js`, `public/ai/v2/ai-v2.css`, `index.ts` |
| **TASK-V2-05** | REQ-V2-01 〜 06<br>DES-V2-01 〜 05 | 結合・受入テスト実施、`docs/ai/v2/test-results.md` 記録、提出 | `docs/ai/v2/test-results.md`, `README.md`, `docs/ai/ai-log.md`, GitHub PR/Push |

---

## 2. 実装手順（TASK-V2-01 〜 TASK-V2-05）

### TASK-V2-01：V1の疎通確認・要確認事項の確定・作業ブランチ作成
* **対応REQ・DES**: REQ-V2-06 / DES-V2-05
* **確認先・変更ファイル**:
  * `package.json`（起動スクリプト・型検査・ビルドコマンドの確認 — **要確認**）
  * `index.ts`（V1の `/ai` および `/api/ai` のマウント方法の確認 — **要確認**）
  * `src/apps/ai/aiService.ts`・`src/apps/ai/aiController.ts`（Geminiクライアント設定および `AI_DEMO_ENABLED` 判定の確認 — **要確認**）
  * `.env.example`・`.env`（環境変数名の確認 — **要確認**）
  * 作業ブランチ `feature/ai-app-v2` の作成
* **具体的な操作**:
  1. ローカル環境でV1サーバーを起動し（例：`npm run dev` ※`package.json` の実定義に従う）、`http://localhost:3000/ai` から質問を1回送信する。実際のGemini APIの回答が返り、HTTP `201` とデータベース（`ai_qa_logs`）への保存が行われることを確認する。
  2. `package.json` を開き、型チェックやビルドに使うコマンド名（例：`npx tsc --noEmit` または `npm run build`）を確認する。
  3. `index.ts`・`src/apps/ai/aiService.ts`・`src/apps/ai/aiController.ts`・`.env.example` を確認し、V2用のマウント位置と公開停止環境変数（`AI_V2_ENABLED` または `AI_DEMO_ENABLED`）の扱いを確定する。
  4. Gitで作業ブランチを作成し切り替える：
     ```bash
     git checkout -b feature/ai-app-v2
     ```
* **期待する結果**:
  * V1で模擬回答ではなく実Gemini APIの応答とDB保存（`201`）が確認できること。
  * ブランチが `feature/ai-app-v2` に切り替わり、要確認だったコマンド名・マウント記述・環境変数方針が確定していること。
* **次へ進む条件**:
  * V1の実Gemini疎通と保存が確認でき、`feature/ai-app-v2` ブランチ上で作業を開始できる状態であること。

---

### TASK-V2-02：V2専用テーブル作成と会話作成・一覧・履歴取得APIの実装
* **対応REQ・DES**: REQ-V2-01, REQ-V2-02, REQ-V2-05 / DES-V2-02, DES-V2-03, DES-V2-05
* **変更ファイル**:
  * 新規：`sql/ai/040_create_ai_conversations.sql`
  * 新規：`src/apps/ai/v2/aiV2Model.ts`
  * 新規：`src/apps/ai/v2/aiV2Controller.ts`
  * 新規：`src/apps/ai/v2/aiV2Router.ts`
  * 追記：`index.ts`（`/api/ai/v2` のマウント）
  * 追記：`.env.example`・ローカル `.env`（V2有効化フラグが必要な場合）
* **具体的な操作**:
  1. `sql/ai/040_create_ai_conversations.sql` を作成し、`ai_conversations` テーブル（`id`, `title`, `created_at`）と `ai_conversation_turns` テーブル（`id`, `conversation_id` 外部キー, `prompt`, `response_text`, `created_at`）およびインデックスのDDLを記述する。
  2. Neon（授業用PostgreSQL）に対して `sql/ai/040_create_ai_conversations.sql` を実行し、テーブルを作成する（既存の `ai_qa_logs` には触れない）。
  3. `src/apps/ai/v2/aiV2Model.ts` に以下のパラメータ化SQL処理を実装する：
     * 会話作成（`INSERT INTO ai_conversations ... RETURNING id, title, created_at`）
     * 会話一覧取得（`SELECT ... FROM ai_conversations ORDER BY id DESC LIMIT 50`）
     * 会話存在確認（`SELECT id FROM ai_conversations WHERE id = $1`）
     * 画面表示用の履歴取得（指定 `conversation_id` の最新20往復を `id DESC LIMIT 20` で取得し、`id ASC` の古い順へ並べ替え）
  4. `src/apps/ai/v2/aiV2Router.ts` と `aiV2Controller.ts` に、以下の順序と検証を実装する：
     * V2公開停止判定ミドルウェア（停止時は `503 DEMO_DISABLED` を即返却）
     * `express.json({ limit: '16kb' })`（16 KiB超過時は `413` / `400` 固定JSONエラー）
     * `GET /api/ai/v2/conversations`（`200` と `items`、0件なら `items: []`）
     * `POST /api/ai/v2/conversations`（`title` 前後空白除去後 `1〜50` Unicodeコードポイント検証 → `201` と `item`、不正時は `400`）
     * `GET /api/ai/v2/conversations/:id/turns`（`:id` 正整数検証 → `400`、会話未存在 → `404`、正常時は `200` と `items`、空なら `items: []`）
  5. `index.ts` に `/api/ai/v2` ルーターを登録し、サーバー起動後に `curl` やAPIクライアントで会話「話題A」「話題B」を作成し、一覧取得（`200`）と各会話の空履歴取得（`200`, `items: []`）を実行する。
* **期待する結果**:
  * 会話A・会話Bが別々の会話IDで作成され（HTTP `201`）、一覧APIで両方取得でき、それぞれの履歴APIが `200` かつ `items: []` を返すこと。
  * 存在しない会話IDへの履歴取得が `404`、不正IDや51文字以上の会話名が `400` を返すこと。
* **次へ進む条件**:
  * 会話A・Bの両方の会話IDが確認でき、一覧・空履歴・異常系ステータス（`400` / `404`）が期待どおり動作していること。

---

### TASK-V2-03：文脈付き質問送信と1往復保存APIの実装
* **対応REQ・DES**: REQ-V2-03, REQ-V2-04, REQ-V2-05 / DES-V2-02, DES-V2-03, DES-V2-04
* **変更ファイル**:
  * 新規：`src/apps/ai/v2/aiV2Service.ts`
  * 追記：`src/apps/ai/v2/aiV2Model.ts`
  * 追記：`src/apps/ai/v2/aiV2Controller.ts`
  * 追記：`src/apps/ai/v2/aiV2Router.ts`
* **具体的な操作**:
  1. `aiV2Model.ts` に以下の関数を追加する：
     * Gemini文脈用の履歴取得（指定 `conversation_id` の保存済み最新5往復を `id DESC LIMIT 5` で取得し、`id ASC` の古い順へ並べ替え）
     * 1往復保存（`INSERT INTO ai_conversation_turns (conversation_id, prompt, response_text) VALUES ($1, $2, $3) RETURNING ...`）
  2. `aiV2Service.ts` に、過去履歴（0〜5往復）を古い順に `{ role: 'user', parts: [{ text: prompt }] }` → `{ role: 'model', parts: [{ text: responseText }] }` へ展開し、末尾に今回の質問 `{ role: 'user', parts: [{ text: currentPrompt }] }` を追加する `contents` 組立関数と、Gemini API 呼び出し処理を実装する（V1同様、自動再試行なし・空回答時はエラー送出）。
  3. `aiV2Controller.ts` および `aiV2Router.ts` に `POST /api/ai/v2/conversations/:id/turns` を実装する。処理順序は必ず以下を守る：
     1. `:id` の正整数検証（不正なら `400`）および `prompt` の前後空白除去後 `1〜2,000` Unicodeコードポイント検証（不正なら `400`）
     2. 会話の存在確認（存在しなければ `404`、Geminiは呼ばない）
     3. 同じ会話の保存済み最新5往復を取得
     4. `contents` 配列を組み立てて Gemini API を呼び出し（失敗・空回答時は保存せず `502`）
     5. 有効な回答を得た後にのみDBへ1往復として保存（保存失敗時は `500`）
     6. 保存完了後に HTTP `201` と保存済み `item` を返却
  4. APIテストで以下を確認する：
     * 会話Aの1回目に架空の合言葉（例：「合言葉は『しろくま47』です。」）を送信し、`201` を確認。
     * 会話Aの2回目に「さっきの合言葉は何ですか？」を送信し、文脈（`[user, model, user]`）が渡って『しろくま47』を踏まえた回答と `201` が返ることを確認。
     * 会話Bの初回に「さっきの合言葉は何ですか？」を送信し、文脈が今回の質問のみ（`[user]`）で会話Aの合言葉が混入しないことを確認。
* **期待する結果**:
  * 会話Aの2回目では1回目の内容を記憶した回答が返り、新規会話Bの初回では会話Aの履歴が一切参照されないこと。
  * 入力不正（`400`）・会話未存在（`404`）・AI失敗や空回答（`502`）時にDBへ保存されず `201` が返らないこと。
* **次へ進む条件**:
  * API単体で会話内文脈継続、別会話への混入防止、および保存整合性（成功時のみ `201`）が確認できていること。

---

### TASK-V2-04：V2画面（`/ai/v2/`）の実装
* **対応REQ・DES**: REQ-V2-01 〜 REQ-V2-05 / DES-V2-01
* **変更ファイル**:
  * 新規：`public/ai/v2/index.html`
  * 新規：`public/ai/v2/app.js`
  * 新規：`public/ai/v2/ai-v2.css`
  * 追記：`index.ts`（`/ai/v2` および `/ai/v2/` で `public/ai/v2/index.html` を配信する設定 — **要確認**）
* **具体的な操作**:
  1. `public/ai/v2/index.html` と `ai-v2.css` を作成し、新規会話作成フォーム（会話名入力・作成ボタン）、会話一覧リスト、選択中会話タイトル、履歴表示エリア、質問送信フォーム（質問入力・送信ボタン・待機表示・エラー表示領域）、および V1（`/ai`）・TOP（`/`）への戻りリンクを配置する。
  2. `public/ai/v2/app.js` を作成し、以下を実装する：
     * 初期読み込み時に `GET /api/ai/v2/conversations` で会話一覧を取得し、URLクエリ等の選択状態に応じて `GET /api/ai/v2/conversations/:id/turns` で履歴を取得する。
     * 会話一覧のクリック時に選択会話IDを切り替え、該当会話の履歴を再取得して描画する。
     * 会話名（1〜50コードポイント）と質問文（1〜2,000コードポイント）の送信前フロント検証を行う。
     * すべての文字列（会話名・質問・AI回答・日時）を `textContent` のみで描画する（`innerHTML` 禁止）。
     * 通信中は `isBusy` フラグと `disabled` / `aria-busy="true"` で二重操作を抑止し、`AbortController` によるタイムアウトを設定し、ループ自動再送は行わない。
     * 失敗時は入力欄（会話名・質問文）の文字列を保持し、`finally` ブロックで必ず操作ロックを解除する。
  3. ブラウザで `http://localhost:3000/ai/v2/` を開き、会話A・Bの作成、一覧切替（A → B → A）、追加質問、F5再読み込み後の会話選択と再開、およびエラー時の入力保持を確認する。
* **期待する結果**:
  * 画面操作だけで話題別の会話作成・切り替え・文脈付き対話・再読み込み後の再開が一通り完結すること。
  * エラー時に入力した文章が消えず、再送信可能な状態に復帰すること。
* **次へ進む条件**:
  * 型チェック（`npx tsc --noEmit` 等 — **要確認**）がエラーなしで通過し、ブラウザ上でV2画面の基本動作が完了していること。

---

### TASK-V2-05：テスト実施・記録作成と提出準備
* **対応REQ・DES**: REQ-V2-01 〜 REQ-V2-06 / DES-V2-01 〜 DES-V2-05
* **変更・作成ファイル**:
  * 新規：`docs/ai/v2/test-results.md`
  * 追記：`docs/ai/ai-log.md`（V2開発における主な設計・実装判断の記録）
  * 追記：`README.md`（V2の概要・URL・停止条件・確認状況の追記）
* **具体的な操作**:
  1. `docs/ai/v2/test-results.md` を作成し、下記「3. テスト記録表」の全項目（`T-V2-01` 〜 `T-V2-14`）についてローカル環境（および公開停止確認）で検証を実施し、「実測」と「判定」を記入する。
  2. V2停止設定（`AI_V2_ENABLED=false` 等）にした状態でサーバーを再起動し、V2 APIが `503` を返すこと、およびその状態でも V1（`/ai`）・TOP（`/`）・TODO が正常に動くことを確認する（確認後はローカル検証設定へ戻す）。
  3. `git status` と `git diff` を確認し、`.env` や秘密情報、一時的な模擬コードが残っていないことを確認したうえでコミット・プッシュする：
     ```bash
     git add .
     git commit -m "Add AI conversation app V2 with context history and tests"
     git push -u origin feature/ai-app-v2
     ```
  4. 授業指定の提出フォーム・PR等に、ブランチ／コミットURLとテスト結果を添えて提出する。
* **期待する結果**:
  * 必須要件（REQ-V2-01 〜 REQ-V2-06）に対応する全テスト項目の実測結果が記録され、既存機能への悪影響や秘密情報混入がないこと。
* **次へ進む条件**:
  * `docs/ai/v2/test-results.md` の記録完了、プッシュ完了、および提出完了をもって本実習完了とする。

---

## 3. テスト記録表（`docs/ai/v2/test-results.md` 用テンプレート）

※ 実行後に「実測」欄へ実際のHTTPステータス・エラーコード・画面状態を記入し、「判定」欄を `合格` または `不合格` に更新してください。

| テストID | 対応REQ・DES | 対象環境 | 操作 | 期待結果 | 実測 | 判定 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T-V2-01** | REQ-V2-01<br>DES-V2-01, 02 | Local | 会話名「話題A」「話題B」を順に作成し、会話一覧を取得・切替する | 異なる会話IDでそれぞれ `201` 保存され、一覧に両方表示され、クリックで選択状態を切り替えられる | | 未実施 |
| **T-V2-02** | REQ-V2-02, 04<br>DES-V2-01, 02 | Local | 新規作成した空の会話Bを選択する（履歴0件） | エラーにならず `200`（`items: []`）が返り、「この会話の履歴はまだありません。」と正常表示され、会話Aの履歴は表示されない | | 未実施 |
| **T-V2-03** | REQ-V2-03<br>DES-V2-03, 04 | Local | 会話Aの1回目で架空の合言葉（例：「合言葉は『しろくま47』です」）を送り、2回目で「さっきの合言葉は何ですか？」と質問する | 1回目・2回目とも `201` で保存され、2回目の送信文脈が `[user, model, user]` となり、合言葉を踏まえた回答が返る | | 未実施 |
| **T-V2-04** | REQ-V2-04<br>DES-V2-03, 04 | Local | 会話Aに合言葉がある状態で、新規会話Bの初回送信として「さっきの合言葉は何ですか？」を送る | Bの送信文脈は今回の質問のみ（`[user]`）であり、会話Aの合言葉が混入した回答にならない | | 未実施 |
| **T-V2-05** | REQ-V2-02<br>DES-V2-01, 02 | Local | 会話Aでやり取りを保存した後、ブラウザを再読み込み（F5）し、一覧から会話Aを選択して追加質問する | 一覧と履歴（最新20往復・古い順）が再取得されて表示され、続けて文脈付き質問ができる | | 未実施 |
| **T-V2-06** | REQ-V2-02, 03<br>DES-V2-03, 04 | Local | 6往復以上（および21往復以上）の履歴がある会話で表示件数と送信文脈を確認する | 画面表示は最新20往復（古い順）に制限され、Geminiへの送信文脈は最新5往復（古い順）＋今回の質問に制限される | | 未実施 |
| **T-V2-07** | REQ-V2-05<br>DES-V2-02 | Local | 空白のみの会話名、51コードポイント以上の会話名、空白のみの質問、2,001コードポイント以上の質問、16 KiB超JSONを送る | いずれも `400`（または `413`）となり、Gemini APIは呼ばれず、画面の入力欄の文字列が保持される | | 未実施 |
| **T-V2-08** | REQ-V2-05<br>DES-V2-02 | Local | 不正な会話ID（`abc`, `0`）や存在しない会話ID（`999999`）で履歴取得・質問送信を行う | 不正IDは `400`（`INVALID_ID`）、存在しないIDは `404`（`NOT_FOUND`）が返り、Gemini APIは呼ばれない | | 未実施 |
| **T-V2-09** | REQ-V2-05<br>DES-V2-01, 04 | Local | Gemini API失敗・空回答・タイムアウト発生時の挙動を確認する | `201` は返らず `502`（またはタイムアウト案内）となり、不完全データはDB保存されず、自動再送せず入力保持とUI操作復帰が行われる | | 未実施 |
| **T-V2-10** | REQ-V2-05<br>DES-V2-01, 04 | Local | DB保存失敗時の挙動を確認する | `201` は返らずエラー応答となり、画面の入力欄のテキストが残ったまま再操作できる状態に戻る | | 未実施 |
| **T-V2-11** | REQ-V2-05<br>DES-V2-01 | Local | 会話名・質問・AI回答に `<script>alert(1)</script>` 等のHTMLタグ文字列を含めて保存・表示する | `textContent` により文字列のまま安全に表示され、スクリプトは実行されない | | 未実施 |
| **T-V2-12** | REQ-V2-06<br>DES-V2-05 | Local / 公開設定 | V2 API停止設定を有効（`AI_V2_ENABLED=false` 等）にしてV2のAPIへアクセスする | V2全APIが `503`（`DEMO_DISABLED`）を返し、外部AI呼び出しやDB更新を行わない | | 未実施 |
| **T-V2-13** | REQ-V2-06<br>DES-V2-05 | Local | V2実装後（およびV2停止中）に、V1（`/ai`）、TOP（`/`）、TODO画面を操作する | V1の質問送信・履歴表示、TOP画面、TODO機能がすべて従来どおり正常動作する | | 未実施 |
| **T-V2-14** | REQ-V2-06<br>DES-V2-05 | Local | `git status` / `git diff` およびブラウザDevToolsで秘密情報の露出有無を確認する | `.env` やAPIキー、DB接続文字列がGitやクライアント応答・ソースコードに一切含まれていない | | 未実施 |