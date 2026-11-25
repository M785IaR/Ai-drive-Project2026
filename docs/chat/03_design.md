# リアルタイムチャット機能 設計書 (`03_design.md`)

## 1. 設計項目と要件の対応表（`DES-CHAT-xxx` ↔ `REQ-CHAT-xxx`）

要件定義書（`02_requirements.md`）で定めた `REQ-CHAT-001` 〜 `REQ-CHAT-008` を漏れなく実現するため、設計項目を `DES-CHAT-001` 〜 `DES-CHAT-008` として定義する。

| 設計ID | 設計領域 | 対応要件ID | 設計の要点 |
| :--- | :--- | :--- | :--- |
| **DES-CHAT-001** | レイヤー責務・ルーティング・サーバー統合 | `REQ-CHAT-001`<br>`REQ-CHAT-008` | `src/apps/chat/`（Router / Controller / Service / Model）、`views/chat/index.ejs`、`public/chat/` に責務を分離し、`http.createServer(app)` に `Socket.IO` を統合する。既存の404・共通エラーハンドラーより前に安全にマウントする。 |
| **DES-CHAT-002** | HTTP エンドポイント・Socket イベント仕様 | `REQ-CHAT-001`<br>`REQ-CHAT-002`<br>`REQ-CHAT-005` | `GET /chat` 画面表示、`GET /api/chat/messages` 履歴取得、および Socket イベント（`chat:join`, `chat:send`, `chat:message`, `chat:presence`, `chat:error`）のペイロード・ack・エラー仕様を規定する。 |
| **DES-CHAT-003** | データベーススキーマ・SQLパラメータ化 | `REQ-CHAT-003`<br>`REQ-CHAT-008` | `chat_messages` および `chat_room_members` テーブルを定義し、全クエリでプレースホルダー（`$1, $2...`）を使用する。ルーム別最新20件の降順抽出・昇順表示クエリを確定する。 |
| **DES-CHAT-004** | 入室・履歴同期・配信・切断・再入室フロー | `REQ-CHAT-002`<br>`REQ-CHAT-003`<br>`REQ-CHAT-005` | 入室時の席確保から最新20件同期（履歴取得中の新着を `id` で重複排除統合）、投稿検証・保存・配信、切断時のイベントリスナー多重登録防止までの一連のシーケンスを規定する。 |
| **DES-CHAT-005** | マルチインスタンス同期・全台合計定員制御 | `REQ-CHAT-004`<br>`REQ-CHAT-005` | 共有 DB（`chat_room_members`）によるアトミックな席確保・TTLハートビート解放と、`@socket.io/redis-adapter`（または DB 定期ポーリングフォールバック）による複数台同期・確認手順を設計する。 |
| **DES-CHAT-006** | 入力バリデーション・リクエスト制限 | `REQ-CHAT-006` | フロント・サーバー双方で型（`string`）、前後空白除去（`trim()`）、Unicodeコードポイント数（ユーザー名 1〜20文字、コメント 1〜500文字）、JSON 16 KiB 上限を検証する。 |
| **DES-CHAT-007** | セキュリティ設計（XSS防止・秘密情報管理） | `REQ-CHAT-008` | EJS の `<%= ... %>` と JS の `textContent` のみで描画し `innerHTML` を排除する。`DATABASE_URL`・`REDIS_URL` 等はサーバー環境変数のみから参照し外部露出を防ぐ。 |
| **DES-CHAT-008** | 例外処理・障害ハンドリング設計 | `REQ-CHAT-007`<br>`REQ-CHAT-008` | HTTP 例外は `next(error)` で `index.ts` のグローバルエラーハンドラーへ委譲し、Socket イベント処理内は `try-catch` で捕捉して概要ログ出力・クライアントへ安全なエラー通知を返す。 |

---

## 2. アーキテクチャ・ファイル責務・ルーティング順序（`DES-CHAT-001`）

### 2.1. ファイル配置と責務分担

既存の `src/apps/todo/` および `src/apps/ai/` の設計パターンを踏襲し、機能単位でディレクトリを隔離する。

| 区分 | ファイルパス | 主な責務 |
| :--- | :--- | :--- |
| **サーバー統合** | `index.ts` | `http.createServer(app)` を生成して Express アプリと `Socket.IO` サーバー（`initChatSocket(httpServer)`）を同一ポートへ統合する。ルーターを404ハンドラーの前にマウントする。 |
| **ルーター** | `src/apps/chat/chatRouter.ts` | 画面表示用ルーター（`chatViewRouter`: `GET /`）と API 用ルーター（`chatApiRouter`: `GET /messages`）を定義する。 |
| **コントローラー** | `src/apps/chat/chatController.ts` | HTTP リクエストの検証、満席判定に基づく EJS 描画分岐（通常画面 / 満席画面）、入室済み資格の検証、サービス呼び出し、例外時の `next(error)` 伝播を行う。 |
| **サービス** | `src/apps/chat/chatService.ts` | `Socket.IO` の接続・イベント制御、ルーム入室（定員5名チェック）・退室・ハートビート更新、投稿バリデーション、DB保存後のルームブロードキャストを行う。 |
| **モデル** | `src/apps/chat/chatModel.ts` | `db.ts` の `pool` を利用し、`chat_messages`（メッセージ保存・最新20件取得）および `chat_room_members`（共有DB上の席確保・解放・カウント）のパラメータ化 SQL を実行する。 |
| **ビュー** | `views/chat/index.ejs` | チャット画面のサーバーサイドテンプレート。サーバーから渡された `isFull` フラグ等に応じ、通常チャットUIまたは満席制限画面を `<%= ... %>` エスケープで描画する。 |
| **クライアントJS** | `public/chat/chat.js` | `Socket.IO` クライアント接続管理、多重リスナー防止、`chat:join` 実行、履歴取得と新着の `id` マージ描画（`textContent` のみ使用）、再接続同期を行う。 |
| **スタイルシート** | `public/chat/chat.css` | チャット画面・メッセージ一覧・入力フォーム・満席案内バナーのレイアウト定義を行う。 |
| **DB定義SQL** | `sql/chat/040_create_chat_messages.sql` | `chat_messages` および `chat_room_members` テーブルとインデックスを作成する DDL。 |

### 2.2. 実URL一覧とミドルウェア・ルーター登録順序

`index.ts` における登録順序は以下のとおりとし、既存の静的ファイル配信・TODO・AI機能・404・グローバルエラーハンドラーへ影響を与えない。

1. `app.use(express.json())` / `app.use(express.urlencoded({ extended: true }))`（既存）
2. `app.use(express.static(path.join(process.cwd(), 'public')))`（既存：これにより `/chat/chat.js` と `/chat/chat.css` が自動配信される）
3. `app.set('view engine', 'ejs')` / `app.set('views', ...)`（既存）
4. `app.get('/', ...)` / `app.get('/api/db-check', ...)` / `app.get('/db-sample', ...)`（既存）
5. `app.use('/', todoRouter)`（既存）
6. `app.use('/ai', aiViewRouter)` / `app.use('/api/ai', aiRouter)` / `app.use('/api/ai/v2', aiV2Router)`（既存）
7. **`app.use('/chat', chatViewRouter)`**（新規追加：画面表示 `GET /chat`）
8. **`app.use('/api/chat', chatApiRouter)`**（新規追加：履歴取得 `GET /api/chat/messages`）
9. 汎用 404 ハンドラー `app.use((req, res) => ...)`（既存：未定義ルートは従来どおり JSON `404` を返す）
10. グローバルエラーハンドラー `app.use((err, req, res, next) => ...)`（既存：HTTP 例外は従来どおり JSON `500` を返す）

**実URLマッピング**:
* `GET /chat` → `views/chat/index.ejs` レンダリング結果
* `GET /api/chat/messages` → 参加資格検証後の最新20件メッセージ JSON
* `GET /chat/chat.js` → `public/chat/chat.js`
* `GET /chat/chat.css` → `public/chat/chat.css`
* `/socket.io/*` → `Socket.IO` サーバーハンドラー（`http.Server` レベルで処理）

---

## 3. HTTP API および Socket.IO イベント仕様（`DES-CHAT-002`）

### 3.1. 接続とルーム参加の区別
* **Socket 接続（`connection`）**: ブラウザが `/chat` 画面を開いた後に確立するトランスポート層（WebSocket / Polling）の接続状態。この時点ではまだルーム定員枠を消費せず、履歴閲覧やメッセージ受信・投稿の権限を持たない。
* **ルーム参加（`chat:join`）**: クライアントが `memberToken`（初期画面描画時にサーバーが発行する一時参加トークン）を伴って明示的に入室要求を行い、共有 DB 上で定員5名以内の席を確保した状態。**この状態になって初めてルーム宛て配信の受信・履歴API参照・投稿が可能になる。**

### 3.2. HTTP エンドポイント一覧

| メソッド | パス | 認可・参加資格検証 | 正常応答 | エラー応答 |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/chat` | 認証不要。共有 DB で有効な参加人数（期限切れ除く）を集計し、5名未満なら入室用一時トークン（`memberToken`）を発行して画面へ埋め込む。5名以上なら `isFull = true` として満席画面を描画する。 | `200 OK` (`text/html`)<br>`views/chat/index.ejs` | `500`（DB障害時はグローバルエラーハンドラーへ委譲） |
| **GET** | `/api/chat/messages` | **必須（参加資格検証）**: リクエストヘッダー `X-Chat-Member-Token`（またはクエリ `token`）を受け取り、`chat_room_members` テーブル上に有効期限内のレコードが存在し、かつ対象ルーム（`default`）に在籍中であることを DB 照会で検証する。未在籍・期限切れ・不正トークンの場合は閲覧を拒否する。 | `200 OK` (`application/json`)<br>`{ "success": true, "items": [...], "memberCount": 3, "maxMembers": 5 }` | `400` (`INVALID_INPUT`: トークン形式不正)<br>`403` (`FORBIDDEN_NOT_JOINED`: 未入室または満席拒否)<br>`500`（DB障害時） |

### 3.3. Socket.IO イベント一覧

| イベント名 | 方向（送信元 → 受信先） | Payload 仕様 | Ack（応答コールバック） | 失敗時の挙動 |
| :--- | :--- | :--- | :--- | :--- |
| **`chat:join`** | Client → Server | `{ "roomId": "default", "memberToken": "<UUID>" }` | `{ "ok": true, "memberCount": 3, "maxMembers": 5 }` または `{ "ok": false, "code": "ROOM_FULL" \| "INVALID_TOKEN", "message": "..." }` | 定員超過（5名到達済み）の場合は `ok: false`（`code: "ROOM_FULL"`）を返し、ソケットをルームへ入れず切断する。クライアントは満席制限UIへ切り替える。 |
| **`chat:send`** | Client → Server | `{ "roomId": "default", "userName": "太郎", "message": "こんにちは" }` | `{ "ok": true, "item": { "id": 101, "userName": "太郎", "message": "こんにちは", "createdAt": "..." } }` または `{ "ok": false, "code": "INVALID_INPUT" \| "NOT_JOINED" \| "DB_ERROR", "message": "..." }` | 未入室・バリデーション違反・DB保存失敗時は配信を行わず `ok: false` を返す。クライアントはコメント入力欄の文字を保持したままエラー通知を表示する。 |
| **`chat:message`** | Server → Room内全Client | `{ "id": 101, "roomId": "default", "userName": "太郎", "message": "こんにちは", "createdAt": "2026-11-25T06:30:00.000Z" }` | なし（ブロードキャスト配信） | 配信対象は `socket.join(roomId)` 済みの正規参加者のみ。満席拒否された6人目には一切送信しない。 |
| **`chat:presence`** | Server → Room内全Client | `{ "roomId": "default", "memberCount": 4, "maxMembers": 5 }` | なし（入退室時の人数通知） | 入室確定時・退室検知時にルーム内全員へ現在の参加人数を通知する。 |
| **`chat:heartbeat`** | Client → Server | `{ "roomId": "default", "memberToken": "<UUID>" }` | `{ "ok": true }` | 20秒ごとに送信し、サーバー側で `last_seen_at` を延長する。無効トークンの場合は切断する。 |
| **`chat:error`** | Server → 対象Client | `{ "code": "INTERNAL_ERROR" \| "SESSION_EXPIRED", "message": "エラーが発生しました。" }` | なし | サーバー側イベント処理内で予期しない例外が発生した際に送信元クライアントへ通知する。 |

---

## 4. データベース設計（`DES-CHAT-003`）

### 4.1. テーブル定義（`sql/chat/040_create_chat_messages.sql`）

#### (1) `chat_messages`（チャットメッセージ履歴）
| カラム名 | データ型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | メッセージ一意ID（時系列順・重複排除の基準） |
| `room_id` | `VARCHAR(50)` | `NOT NULL DEFAULT 'default'` | ルーム識別子（初版は `'default'` 固定） |
| `user_name` | `VARCHAR(80)` | `NOT NULL` | 投稿者名（前後空白除去後 1〜20コードポイント） |
| `message` | `TEXT` | `NOT NULL` | コメント本文（前後空白除去後 1〜500コードポイント） |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | 投稿日時 |

* **インデックス**: `CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_id ON chat_messages (room_id, id DESC);`

#### (2) `chat_room_members`（全台共有の同時参加席管理）
| カラム名 | データ型 | 制約 | 説明 |
| :--- | :--- | :--- | :--- |
| `member_token` | `VARCHAR(64)` | `PRIMARY KEY` | 画面表示・接続単位の一意トークン（UUID v4） |
| `room_id` | `VARCHAR(50)` | `NOT NULL DEFAULT 'default'` | 参加ルーム識別子 |
| `socket_id` | `VARCHAR(64)` | `NULL` | 現在紐付いている Socket ID（リロード・再接続時に更新） |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | 席の有効期限（ハートビートごとに現在時刻 + 60秒へ更新） |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | 入室日時 |

* **インデックス**: `CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_expires ON chat_room_members (room_id, expires_at);`

### 4.2. パラメータ化クエリと「最新20件を古い順に表示」する取得方法
* **SQLインジェクション対策**: すべての `SELECT / INSERT / UPDATE / DELETE` で `pool.query(sql, [param1, param2])` の形式を使用し、文字列結合は一切行わない。
* **最新20件の取得と古い順並べ替え（サブクエリ方式）**:
  ```sql
  SELECT id, room_id, user_name, message, created_at
  FROM (
    SELECT id, room_id, user_name, message, created_at
    FROM chat_messages
    WHERE room_id = $1
    ORDER BY id DESC
    LIMIT 20
  ) AS recent_messages
  ORDER BY id ASC;
  ```
  * 内側のクエリで対象ルームの最新20件（`ORDER BY id DESC LIMIT 20`）を高速に抽出し、外側のクエリで `ORDER BY id ASC` に並べ替えることで、画面上から下へ古い順（時系列順）で描画できる。

---

## 5. シーケンス・状態管理・クライアント同期設計（`DES-CHAT-004`）

### 5.1. 一連の処理順序（入室〜投稿〜切断〜再入室）

1. **画面初期表示（`GET /chat`）**:
   * サーバーは `chat_room_members` の期限切れレコード（`expires_at <= NOW()`）を削除したうえで現在の在籍数をカウントする。
   * 5名以上なら `isFull: true` で満席画面を返す。5名未満なら新しい `memberToken` を生成し、`views/chat/index.ejs` に埋め込んで返す。
2. **Socket 接続とルーム参加（`chat:join`）**:
   * クライアントは初回のみ Socket インスタンスを生成し、`chat:join`（`{ roomId, memberToken }`）を送信する。
   * サーバーは共有 DB 上でトランザクション／排他制御を用いて席を確保（最大5名）し、ソケットを `socket.join(roomId)` へ登録して ack（`ok: true`）を返す。満席時は `ok: false` を返して制限画面へ切り替える。
3. **履歴取得（`GET /api/chat/messages`）と新着の `id` 統合**:
   * `chat:join` の成功 ack を受け取った直後、クライアントは `GET /api/chat/messages` を呼び出して最新20件を取得する。
   * **履歴取得中の新着統合（競合防止）**: HTTP で最新20件を取得している最中に `chat:message` でリアルタイム新着が届いた場合でも、クライアント側はメモリ上でメッセージ配列を `Map<number, ChatMessage>`（キーは `id`）で管理し、履歴レスポンスとリアルタイム受信イベントを `id` 昇順でマージしたうえで末尾20件（`slice(-20)`）のみを DOM に描画する。これにより**メッセージの欠落や二重表示を完全に防ぐ**。
4. **投稿検証 → DB保存 → ルーム配信（`chat:send`）**:
   * クライアントが `chat:send` を送信 → サーバーが入室資格検証・入力検証 → `chat_messages` へ `INSERT` → DB保存成功後に `io.to(roomId).emit('chat:message', savedItem)` でルーム全員へ配信し、送信元へ ack（`ok: true`）を返す。
5. **切断（`disconnect`）と再入室（`reconnect`）**:
   * **切断時**: サーバーの `disconnect` ハンドラーが `chat_room_members` から該当 `socket_id` の行を削除し、残りのルーム参加者へ `chat:presence` で減少後の人数を通知する。
   * **再接続・再入室時**: クライアントは同じ `memberToken` を用いて再度 `chat:join` を送信する。自身の `memberToken` がまだ有効期限内であれば同一枠を更新して復帰でき、期限切れ後に他者で満席になっていた場合は満席案内画面へ遷移する。復帰成功時は再度 `GET /api/chat/messages` を呼んで切断中の取りこぼしを補完する。

### 5.2. 切断後にイベントリスナーが増えない設計（多重登録防止）
* `public/chat/chat.js` では `io()` の初期化とイベントリスナー登録（`socket.on('connect', ...)`, `socket.on('chat:message', ...)`, `socket.on('chat:presence', ...)`, `socket.on('disconnect', ...)`）を**ページ読み込み時の初期化関数内で1回だけ**実行する。
* `connect`（初回接続および再接続の双方で発火する単一イベント）の内部で新たに `socket.on(...)` を登録することは**厳禁**とし、`connect` ハンドラー内では `chat:join` の送信のみを行う。これにより、切断と再接続を何度繰り返してもイベントリスナーが重複登録されず、メッセージが2重・3重に描画されるバグを防止する。

---

## 6. 1台・複数台構成の定員管理とメッセージ同期設計（`DES-CHAT-005`）

### 6.1. 共有状態による定員管理（1台・複数台共通）
* 1台構成であっても複数台構成であっても、インメモリ変数ではなく **PostgreSQL（Neon DB）の `chat_room_members` テーブル** を唯一の定員管理ストアとして使用する。
* **アトミックな席確保手順（トランザクション＋アドバイザリロック）**:
  1. `BEGIN` でトランザクションを開始し、`SELECT pg_advisory_xact_lock(hashtext($1))`（`$1 = roomId`）でルーム単位の排他ロックを取得する（複数インスタンスから同時に5人目・6人目が来ても直列化される）。
  2. `DELETE FROM chat_room_members WHERE room_id = $1 AND expires_at <= NOW()` で期限切れセッションを掃除する。
  3. 同一 `member_token` が既に存在する場合は `expires_at` と `socket_id` を更新して許可する。
  4. 新規トークンの場合、`SELECT COUNT(*) FROM chat_room_members WHERE room_id = $1` を取得し、`count >= 5` であれば `ROLLBACK` して満席（`ROOM_FULL`）を返す。`count < 5` であれば `INSERT` して `COMMIT` する。
* **異常終了時の席回収**:
  * 通常切断時は `disconnect` イベントで即座に `DELETE` する。
  * サーバー再起動・ネットワーク断・ブラウザ強制終了で `disconnect` が届かない場合でも、クライアントからの `chat:heartbeat`（20秒間隔）が途絶えると `expires_at`（60秒後）を超過し、次回アクセス時の掃除クエリで自動的に席が回収される。

### 6.2. 複数台間のメッセージ同期方式の選定と障害時の扱い
* **選定方式**: **`@socket.io/redis-adapter`（方式A）を第一選択**とし、`REDIS_URL` が未設定または Redis 障害時には **DB 定期同期フォールバック（方式B：クライアント側 5秒間隔の差分／最新20件ポーリング）** へ自動切り替えできる構成を採用する。
* **障害時の扱い**:
  * **Redis 一時障害時**: Redis Adapter の接続エラーはログ出力にとどめ、サーバープロセスは停止させない。各インスタンスはローカル接続中のクライアントへ配信しつつ、クライアント側の定期同期（または再接続取得）により Neon DB 経由で他インスタンスの投稿を補完する。
  * **Neon DB 障害時**: 席確保・保存・履歴取得のいずれかで DB エラーが発生した場合は `try-catch` で捕捉し、定員超過の誤許可（フェイルオープン）はせず安全側（エラー通知）へ倒す。

### 6.3. 接続先が別の2台を使う確認方法
1. 同一の `DATABASE_URL` および `REDIS_URL` を設定した状態で、ターミナル1で `PORT=3000 npm run dev`、ターミナル2で `PORT=3001 npm run dev` を起動する（ローカル2インスタンス構成、または複数デプロイ先URL 2系統）。
2. ブラウザ3つを `http://localhost:3000/chat` に接続し、別のブラウザ2つを `http://localhost:3001/chat` に接続する（合計5名）。
3. `3000` 番側のユーザー1が投稿したメッセージが、`3001` 番側のユーザー4・5の画面へリロードなしでリアルタイム表示されること、およびその逆も成立することを確認する。
4. 合計5名が参加中の状態で、6つ目のブラウザから `http://localhost:3000/chat` と `http://localhost:3001/chat` のどちらへアクセスしても満席画面となり、入室・閲覧・投稿が拒否されることを確認する。

---

## 7. セキュリティ・入力検証・エラーハンドリング設計（`DES-CHAT-006`, `007`, `008`）

### 7.1. 入力検証ルール（フロント・バックエンド共通）
| 項目 | 検証ルール | 違反時の扱い |
| :--- | :--- | :--- |
| **ユーザー名（`userName`）** | `typeof === 'string'` であり、`trim()` 後の Unicode コードポイント数（`Array.from(trimmed).length`）が **1〜20文字** であること。 | 送信・保存・配信を行わず、`INVALID_INPUT` エラーを画面表示（入力値は保持）。 |
| **コメント（`message`）** | `typeof === 'string'` であり、`trim()` 後の Unicode コードポイント数が **1〜500文字** であること。 | 送信・保存・配信を行わず、`INVALID_INPUT` エラーを画面表示（入力値は保持）。 |
| **リクエストサイズ** | HTTP API の JSON ボディ上限を `16 KiB` とする。 | 超過時は `413`（`PAYLOAD_TOO_LARGE`）を返却。 |

### 7.2. 画面エスケープと秘密情報管理
* **XSS 防止**:
  * `views/chat/index.ejs`: サーバー値の埋め込みはすべて `<%= ... %>` を使用し、`<%- ... %>` は禁止する。
  * `public/chat/chat.js`: ユーザー名・コメント・日時の描画はすべて `document.createElement` と `textContent` のみを使用し、`innerHTML` / `insertAdjacentHTML` は禁止する。
* **秘密情報管理**:
  * `DATABASE_URL`、`DATABASE_URL_POOLED`、`REDIS_URL` はサーバー側の `process.env` からのみ参照し、EJS テンプレート変数・HTML・クライアント JS・エラーレスポンスには一切渡さない。

### 7.3. エラーハンドリングの連携経路
* **HTTP ルート（`chatController.ts`）**: すべての非同期処理を `try { ... } catch (error) { next(error); }` で囲み、予期しない例外は `index.ts` 最下部のグローバルエラーハンドラーへ渡して HTTP `500` JSON を返却する（プロセスをクラッシュさせない）。
* **Socket.IO イベント（`chatService.ts`）**: `socket.on('chat:join', ...)`・`socket.on('chat:send', ...)`・`socket.on('disconnect', ...)` 内のすべての非同期処理を `try-catch` で囲み、例外発生時は秘密情報を含まない概要のみ `console.error('[Chat Socket Error]', ...)` へ出力したうえで、ack（`{ ok: false, message: '...' }`）または `chat:error` イベントで画面のエラー通知領域へメッセージを表示する。

---

## 8. 前提および未確定事項まとめ

本設計書では要件定義書（`02_requirements.md`）第6章の提案案を基準に設計を具体化しているが、実装着手前に以下の前提・未確定事項を確認対象として明記する。

1. **文字数上限（前提値採用）**: ユーザー名は前後空白除去後 **1〜20文字**、コメントは **1〜500文字**（Unicodeコードポイント数基準）を設計基準値として採用した。運用上の変更希望がある場合は定数定義で調整する。
2. **参加人数のカウント単位（前提値採用）**: 同一ブラウザで複数タブを開いた場合も **1タブ（1画面表示・1 Socket 接続）＝1名** としてカウントする設計を採用した。
3. **ルーム数（前提値採用）**: 初版は固定1ルーム（`room_id = 'default'`）のみを提供する。将来複数ルームへ拡張できるよう DB テーブルには `room_id` カラムを保持する。
4. **満席時の再試行方法（前提値採用）**: 満席画面では自動ポーリングを行わず、利用者が「空き状況を再確認」ボタン（ページ再読み込み）を押下する手動再試行方式を採用した。
5. **デプロイ環境と `REDIS_URL` の有無（要環境確認）**:
   * ローカル環境や単一サーバー環境では `REDIS_URL` が未設定でも Neon DB（`chat_room_members`）による定員管理と履歴同期で動作する設計としている。
   * 複数インスタンス構成でリアルタイムブロードキャストを行う場合は、`REDIS_URL` を設定して `@socket.io/redis-adapter` を有効化することを前提とする（Vercel 等の常時 WebSocket 非対応環境へデプロイする場合は、別途ホスティング先の選定確認が必要）。