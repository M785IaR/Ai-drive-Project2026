# リアルタイムチャット機能 実装計画書 (`04_implementation.md`)

本ドキュメントは、要件定義書（`02_requirements.md`）および設計書（`03_design.md`）に基づき、既存の Express / TypeScript アプリケーションへリアルタイムチャット機能（`/chat`）を段階的に実装・検証するための手順書である。

---

## 0. 実装前の確認事項・既存構成の根拠

実装に入る前に、既存プロジェクトのファイル・設定を以下の手順で確認し、既存接続とサーバー起動処理を再利用する。

1. **既存起動スクリプト・依存パッケージの確認（`package.json`）**
   * 確認コマンド: `Get-Content package.json`（PowerShell）またはエディタで開く。
   * 既存実績: `"dev": "tsx watch ./index.ts"` を使用する。`build` や `start` スクリプト名も `package.json` の `scripts` 欄で確認する。
2. **既存 DB 接続方法の確認（`db.ts`）**
   * 確認コマンド: `Get-Content db.ts`
   * 既存実績: `index.ts` や `aiV2Model.ts` から `import { pool } from './db'`（または相対パス `'../../../db'`）で `pg.Pool` インスタンスを共有利用している。`db.ts` 内で `DATABASE_URL_POOLED` / `DATABASE_URL` のどちらを読み込んでいるかを確認し、チャット機能でも新規に `Pool` を作らず既存の `pool` をそのまま再利用する。
3. **既存サーバー起動と二重待機防止（`index.ts`）**
   * 確認コマンド: `Get-Content index.ts`
   * 既存実績: `index.ts` 末尾に `if (process.env.NODE_ENV !== 'test') { app.listen(port, ...); }` が直接記述されている。`Socket.IO` を統合する際は `app.listen(...)` を残したまま別に `httpServer.listen(...)` を呼ぶと **`EADDRINUSE`（ポート3000の二重待機エラー）** になるため、必ず `const httpServer = http.createServer(app);` に一本化して `httpServer.listen(port, ...)` へ置き換える。
4. **セキュリティ・描画原則（全工程共通）**
   * **EJS テンプレート（`views/chat/index.ejs`）**: サーバー値は必ず `<%= ... %>` でエスケープ出力し、`<%- ... %>` は禁止する。
   * **ブラウザ JS（`public/chat/chat.js`）**: DOM 描画は `document.createElement` と `textContent` のみを使用し、`innerHTML` は禁止する。
   * **秘密情報**: `DATABASE_URL`・`REDIS_URL` 等はサーバー側（`db.ts` / `chatService.ts`）のみで `process.env` から読み込み、クライアント側へ渡さない。

---

## 工程 A：既存アプリの動作確認、ブランチ作成、`socket.io` の追加、`/chat` と接続ログの確認

### 1. 目的と対応ID
* **目的**: 既存機能（TOP・TODO・AI）が正常に動くベースラインを確認したうえで作業ブランチを切り、`socket.io` の導入と `/chat` の最小画面・WebSocket接続ログ疎通を完了させる。
* **対応 REQ / DES**: `REQ-CHAT-001`, `REQ-CHAT-008` / `DES-CHAT-001`, `DES-CHAT-002`, `DES-CHAT-007`

### 2. 変更・新規作成ファイル
* `package.json` / `package-lock.json`（`socket.io` 追加）
* `src/apps/chat/chatRouter.ts`（新規）
* `src/apps/chat/chatController.ts`（新規）
* `src/apps/chat/chatService.ts`（新規）
* `views/chat/index.ejs`（新規）
* `public/chat/chat.js`（新規）
* `public/chat/chat.css`（新規）
* `index.ts`（`http.createServer(app)` への一本化、`initChatSocket` 呼び出し、`/chat` ルーターマウント）

### 3. 追加・変更する処理（最小実装例）

#### (1) `src/apps/chat/chatController.ts`（初期画面表示の最小骨格）
```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export class ChatController {
  static async renderChatPage(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const memberToken = crypto.randomUUID();
      res.status(200).render('chat/index', {
        roomId: 'default',
        isFull: false,
        memberToken,
        memberCount: 0,
        maxMembers: 5,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

#### (2) `src/apps/chat/chatRouter.ts`
```typescript
import { Router } from 'express';
import { ChatController } from './chatController';

export const chatViewRouter = Router();
chatViewRouter.get('/', ChatController.renderChatPage);
```

#### (3) `src/apps/chat/chatService.ts`（接続・切断ログ確認の最小骨格）
```typescript
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export function initChatSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer);

  io.on('connection', (socket) => {
    console.log(`[Chat] Client connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      console.log(`[Chat] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}
```

#### (4) `views/chat/index.ejs`（最小骨組み・`<%= ... %>` 使用）
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>リアルタイムチャット</title>
  <link rel="stylesheet" href="/chat/chat.css" />
</head>
<body data-room-id="<%= roomId %>" data-member-token="<%= memberToken %>" data-is-full="<%= isFull %>">
  <h1>リアルタイムチャット（<%= roomId %>）</h1>
  <p id="connection-status">接続待機中...</p>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/chat/chat.js" defer></script>
</body>
</html>
```

#### (5) `public/chat/chat.js`（多重リスナー防止・`textContent` 使用）
```javascript
(() => {
  'use strict';
  const statusEl = document.getElementById('connection-status');
  const socket = io(); // 初期化時に1回だけ生成

  socket.on('connect', () => {
    if (statusEl) statusEl.textContent = 'サーバーに接続しました';
  });

  socket.on('disconnect', () => {
    if (statusEl) statusEl.textContent = 'サーバーから切断されました';
  });
})();
```

#### (6) `index.ts` の変更箇所（二重待機防止のため `app.listen` を `httpServer.listen` へ置換）
```typescript
import http from 'http';
import { chatViewRouter } from './src/apps/chat/chatRouter';
import { initChatSocket } from './src/apps/chat/chatService';

// ルーティング部分（既存AIルーターの下、404ハンドラーの前）
app.use('/chat', chatViewRouter);

// サーバー起動部分（app.listen の代わりに httpServer を使用）
const httpServer = http.createServer(app);
initChatSocket(httpServer);

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, (): void => {
    console.log(`Server started: http://localhost:${port}`);
  });
}
```

### 4. コマンドと実行場所
* **実行場所**: プロジェクトルート（`C:\Ai-drive-Project2026`）の PowerShell ターミナル
* **コマンド**:
  ```powershell
  git checkout -b feature/chat-app
  npm install socket.io
  npx tsc --noEmit
  npm run dev
  ```

### 5. 確認操作と期待結果
1. ブラウザで `http://localhost:3000/`、`http://localhost:3000/todo`、`http://localhost:3000/ai` を開き、既存画面が従来どおり表示されること。
2. ブラウザで `http://localhost:3000/chat` を開き、画面に「サーバーに接続しました」と表示され、サーバー側のターミナルに `[Chat] Client connected: ...` が出力されること。
3. タブを閉じるとサーバー側のターミナルに `[Chat] Client disconnected: ...` が出力されること。

### 6. つまずいたときの切り分け
* **`Error: listen EADDRINUSE: address already in use :::3000`**:
  * 古い Node プロセスが残っているか、`index.ts` 内に `app.listen` と `httpServer.listen` の両方が残っている。VS Code 右側のターミナル一覧で古いプロセスを `Ctrl + C` で停止し、`index.ts` の `app.listen` が削除されているか確認する。
* **`GET /socket.io/socket.io.js` が 404 になる**:
  * `initChatSocket(httpServer)` が呼ばれていないか、`app` と別の `httpServer` にアタッチされている。`http.createServer(app)` を渡しているか確認する。

---

## 工程 B：検証用 Neon への SQL 適用、Model での投稿保存と最新20件取得

### 1. 目的と対応ID
* **目的**: 検証用 Neon DB にチャット専用テーブル（`chat_messages`, `chat_room_members`）を作成し、パラメータ化 SQL による投稿保存と「最新20件を取得して古い順に表示する」データアクセス層を完成させる。
* **対応 REQ / DES**: `REQ-CHAT-003`, `REQ-CHAT-008` / `DES-CHAT-003`, `DES-CHAT-007`

### 2. 変更・新規作成ファイル
* `sql/chat/040_create_chat_messages.sql`（新規）
* `src/apps/chat/chatModel.ts`（新規）
* `src/apps/chat/chatController.ts`（`GET /api/chat/messages` ハンドラー追加）
* `src/apps/chat/chatRouter.ts`（`chatApiRouter` 追加）
* `index.ts`（`app.use('/api/chat', chatApiRouter)` 追加）

### 3. 追加・変更する処理（最小実装例）

#### (1) `sql/chat/040_create_chat_messages.sql`
```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL DEFAULT 'default',
  user_name VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_id
  ON chat_messages (room_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_room_members (
  member_token VARCHAR(64) PRIMARY KEY,
  room_id VARCHAR(50) NOT NULL DEFAULT 'default',
  socket_id VARCHAR(64) NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room_expires
  ON chat_room_members (room_id, expires_at);
```

#### (2) `src/apps/chat/chatModel.ts`（保存と最新20件・古い順取得）
```typescript
import { pool } from '../../../db';

export interface ChatMessageRow {
  id: number;
  roomId: string;
  userName: string;
  message: string;
  createdAt: string;
}

export class ChatModel {
  static async createMessage(
    roomId: string,
    userName: string,
    message: string
  ): Promise<ChatMessageRow> {
    const sql = `
      INSERT INTO chat_messages (room_id, user_name, message)
      VALUES ($1, $2, $3)
      RETURNING id, room_id, user_name, message, created_at
    `;
    const result = await pool.query(sql, [roomId, userName, message]);
    const row = result.rows[0];
    return {
      id: Number(row.id),
      roomId: row.room_id,
      userName: row.user_name,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  static async getRecentMessages(roomId: string, limit = 20): Promise<ChatMessageRow[]> {
    const sql = `
      SELECT id, room_id, user_name, message, created_at
      FROM (
        SELECT id, room_id, user_name, message, created_at
        FROM chat_messages
        WHERE room_id = $1
        ORDER BY id DESC
        LIMIT $2
      ) AS recent_messages
      ORDER BY id ASC
    `;
    const result = await pool.query(sql, [roomId, limit]);
    return result.rows.map((row) => ({
      id: Number(row.id),
      roomId: row.room_id,
      userName: row.user_name,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }
}
```

### 4. コマンドと実行場所
* **実行場所**:
  1. Neon コンソールの SQL Editor（`sql/chat/040_create_chat_messages.sql` を貼り付けて実行）
  2. プロジェクトルート（`C:\Ai-drive-Project2026`）の PowerShell ターミナル
* **コマンド**:
  ```powershell
  npx tsc --noEmit
  npm run dev
  ```

### 5. 確認操作と期待結果
1. Neon DB 上に `chat_messages` と `chat_room_members` テーブルが作成されていること。
2. 初期状態で `GET /api/chat/messages` を確認し、0件でもエラーにならず空配列が返ること（工程 D で入室トークン検証を追加するまでは疎通確認用として挙動を確認）。

### 6. つまずいたときの切り分け
* **`relation "chat_messages" does not exist`**:
  * `.env` の `DATABASE_URL`（または `db.ts` が参照する接続先）と、SQL Editor で実行した Neon プロジェクト／ブランチが一致しているか確認する。

---

## 工程 C：投稿フォーム、サーバー検証、保存後の同一ルーム配信、2タブでの確認

### 1. 目的と対応ID
* **目的**: ユーザー名とコメントの入力フォーム、前後空白除去・文字数検証（ユーザー名 1〜20文字、コメント 1〜500文字）、DB保存後の同一ルームリアルタイム配信、および履歴取得中の新着 `id` 重複排除マージを実装する。
* **対応 REQ / DES**: `REQ-CHAT-001`, `REQ-CHAT-002`, `REQ-CHAT-003`, `REQ-CHAT-006`, `REQ-CHAT-008` / `DES-CHAT-002`, `DES-CHAT-004`, `DES-CHAT-006`, `DES-CHAT-007`

### 2. 変更・新規作成ファイル
* `views/chat/index.ejs`（履歴エリア・入力フォーム・エラー表示領域を追加）
* `public/chat/chat.css`（レイアウト整備）
* `public/chat/chat.js`（フォーム送信・`Map<number, ChatMessage>` による `id` 昇順マージ描画・XSS防止 `textContent`）
* `src/apps/chat/chatService.ts`（`chat:send` イベント受付・入力検証・DB保存・`io.to(roomId).emit('chat:message', ...)`）

### 3. 追加・変更する処理（最小実装例）

#### (1) `src/apps/chat/chatService.ts`（検証 → DB保存 → ルーム配信）
```typescript
function validateChatInput(userName: unknown, message: unknown): { userName: string; message: string } | null {
  if (typeof userName !== 'string' || typeof message !== 'string') return null;
  const trimmedName = userName.trim();
  const trimmedMsg = message.trim();
  const nameLen = Array.from(trimmedName).length;
  const msgLen = Array.from(trimmedMsg).length;
  if (nameLen < 1 || nameLen > 20) return null;
  if (msgLen < 1 || msgLen > 500) return null;
  return { userName: trimmedName, message: trimmedMsg };
}

// socket.on('chat:send', ...) 内の処理順序
socket.on('chat:send', async (payload, ack) => {
  try {
    const valid = validateChatInput(payload?.userName, payload?.message);
    if (!valid) {
      if (typeof ack === 'function') {
        ack({ ok: false, code: 'INVALID_INPUT', message: 'ユーザー名(1〜20文字)とコメント(1〜500文字)を入力してください。' });
      }
      return;
    }

    const saved = await ChatModel.createMessage('default', valid.userName, valid.message);
    io.to('default').emit('chat:message', saved);
    if (typeof ack === 'function') ack({ ok: true, item: saved });
  } catch (error) {
    console.error('[Chat] chat:send failed:', error);
    if (typeof ack === 'function') {
      ack({ ok: false, code: 'DB_ERROR', message: 'メッセージの送信に失敗しました。時間をおいて再度お試しください。' });
    }
  }
});
```

#### (2) `public/chat/chat.js`（`id` 重複排除統合と `textContent` 描画）
```javascript
const messageMap = new Map(); // key: message.id, value: message

function mergeAndRenderMessages(items) {
  for (const item of items) {
    if (item && typeof item.id === 'number') {
      messageMap.set(item.id, item);
    }
  }
  const sorted = Array.from(messageMap.values())
    .sort((a, b) => a.id - b.id)
    .slice(-20);

  messagesListEl.textContent = '';
  for (const msg of sorted) {
    const li = document.createElement('li');
    const header = document.createElement('div');
    header.textContent = `${msg.userName} (${new Date(msg.createdAt).toLocaleString('ja-JP')})`;
    const body = document.createElement('p');
    body.textContent = msg.message; // XSS防止のため必ず textContent を使用
    li.appendChild(header);
    li.appendChild(body);
    messagesListEl.appendChild(li);
  }
}
```

### 4. コマンドと実行場所
* **実行場所**: プロジェクトルートの PowerShell ターミナル
* **コマンド**:
  ```powershell
  npx tsc --noEmit
  npm run dev
  ```

### 5. 確認操作と期待結果
1. ブラウザで2つのタブ（タブA・タブB）を開き、双方で `http://localhost:3000/chat` にアクセスする。
2. タブAでユーザー名「太郎」、コメント「こんにちは」を送信すると、リロードなしでタブA・タブB双方に即座に表示されること。
3. `<script>alert(1)</script>` をコメントに入力して送信した際、アラートが実行されず文字列のまま表示されること。
4. 空白のみの入力や 21文字以上のユーザー名・501文字以上のコメント送信時、DBに保存されずエラーメッセージが表示され、入力欄の文字列が保持されること。
5. タブAを F5 で再読み込みした際、保存済みの最新20件が古い順に表示されること。

### 6. つまずいたときの切り分け
* **送信した自分のタブにだけ表示され、もう一方のタブに届かない**:
  * サーバー側で `socket.join('default')` が呼ばれていないか、`socket.emit`（送信元のみ）になっており `io.to('default').emit` になっていない箇所を確認する。
* **再接続のたびにメッセージが2重・3重に表示される**:
  * `socket.on('chat:message', ...)` を `socket.on('connect', ...)` の内側に書いていないか確認する（必ず `connect` の外側で1回だけ登録する）。

---

## 工程 D：5人制限、切断時の席解放、再入室と履歴同期、画面への例外表示

### 1. 目的と対応ID
* **目的**: 1ルーム最大5名の定員制限（6人目の画面表示制限・入室拒否・履歴API閲覧拒否・投稿拒否）、切断時の席解放、再接続時の履歴再同期、および通信・DB障害時の安全な例外表示を実装する。
* **対応 REQ / DES**: `REQ-CHAT-003`, `REQ-CHAT-005`, `REQ-CHAT-007` / `DES-CHAT-002`, `DES-CHAT-003`, `DES-CHAT-004`, `DES-CHAT-008`

### 2. 変更・新規作成ファイル
* `src/apps/chat/chatModel.ts`（`pg_advisory_xact_lock` を用いた席確保 `tryJoinRoom`、席解放 `leaveRoom`、有効トークン検証 `isValidMember`、有効人数取得 `countActiveMembers` を追加）
* `src/apps/chat/chatController.ts`（`GET /chat` での満席判定分岐 `isFull`、`GET /api/chat/messages` での `X-Chat-Member-Token` 検証と未入室 `403` 拒否）
* `src/apps/chat/chatService.ts`（`chat:join` での定員5名チェック・`ROOM_FULL` 切断、`chat:send` での入室済み検証、`chat:heartbeat` の20秒更新、`disconnect` での席削除と `chat:presence` 通知）
* `views/chat/index.ejs`（`isFull === true` 時の満席制限画面と、通常時の参加人数表示 `X / 5 人`）
* `public/chat/chat.js`（`chat:join` 成功後の履歴取得、満席時の制限表示切替、20秒ハートビート、`connect_error` / `disconnect` 時のエラー表示）

### 3. 追加・変更する処理（最小実装例）

#### (1) `src/apps/chat/chatModel.ts`（トランザクション＋アドバイザリロックによる定員5名制御）
```typescript
static async tryJoinRoom(
  roomId: string,
  memberToken: string,
  socketId: string,
  maxMembers = 5
): Promise<{ ok: boolean; memberCount: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [roomId]);
    await client.query(
      'DELETE FROM chat_room_members WHERE room_id = $1 AND expires_at <= NOW()',
      [roomId]
    );

    const existing = await client.query(
      'SELECT member_token FROM chat_room_members WHERE room_id = $1 AND member_token = $2',
      [roomId, memberToken]
    );

    if ((existing.rowCount ?? 0) > 0) {
      await client.query(
        `UPDATE chat_room_members
         SET socket_id = $1, expires_at = NOW() + INTERVAL '60 seconds'
         WHERE room_id = $2 AND member_token = $3`,
        [socketId, roomId, memberToken]
      );
    } else {
      const countRes = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM chat_room_members WHERE room_id = $1',
        [roomId]
      );
      const currentCount: number = countRes.rows[0].cnt;
      if (currentCount >= maxMembers) {
        await client.query('ROLLBACK');
        return { ok: false, memberCount: currentCount };
      }

      await client.query(
        `INSERT INTO chat_room_members (member_token, room_id, socket_id, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '60 seconds')`,
        [memberToken, roomId, socketId]
      );
    }

    const afterRes = await client.query(
      'SELECT COUNT(*)::int AS cnt FROM chat_room_members WHERE room_id = $1',
      [roomId]
    );
    await client.query('COMMIT');
    return { ok: true, memberCount: afterRes.rows[0].cnt };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 4. コマンドと実行場所
* **実行場所**: プロジェクトルートの PowerShell ターミナル
* **コマンド**:
  ```powershell
  npx tsc --noEmit
  npm run dev
  ```

### 5. 確認操作と期待結果
1. ブラウザのタブ（または異なるブラウザ）を **5つ** 開き、すべて `http://localhost:3000/chat` に入室できること（参加人数表示が `5 / 5 人` になること）。
2. **6つ目** のタブで `http://localhost:3000/chat` を開くと満席案内画面が表示され、履歴閲覧も投稿もできないこと。
3. 5つのうち **1つ** のタブを閉じたあと、6つ目のタブを再読み込みすると入室でき、最新20件の履歴が表示されること。
4. ブラウザの DevTools（Network タブ）で一時的に `Offline` にしたあと `No throttling` へ戻した際、再接続後に最新20件が同期され、エラー時にも入力欄の文字が消えないこと。

### 6. つまずいたときの切り分け
* **タブを閉じたのに6人目がすぐ入れない**:
  * `disconnect` ハンドラー内で `socket.id` に一致する `chat_room_members` レコードを削除しているか、また削除後に `chat:presence` を送っているか確認する（異常終了時は最大60秒の TTL 経過後に自動解放される）。
* **DevTools から `GET /api/chat/messages` を直接叩くと未入室でも見えてしまう**:
  * `chatController.ts` の `getMessages` で `X-Chat-Member-Token` ヘッダーを受け取り、`ChatModel.isValidMember('default', token)` が `false` の場合に `403` を返しているか確認する。

---

## 工程 E：複数インスタンス向け同期と共有定員管理、異なる2台での確認、既存機能の回帰確認

### 1. 目的と対応ID
* **目的**: 複数インスタンス環境でも全台合計で1ルーム5名を厳守し、異なるインスタンスに接続したユーザー間でメッセージが同期されることを確認する。あわせて既存機能（TOP・TODO・AI V1/V2・404・エラー処理）の回帰確認を行う。
* **対応 REQ / DES**: `REQ-CHAT-004`, `REQ-CHAT-005`, `REQ-CHAT-008` / `DES-CHAT-005`, `DES-CHAT-007`, `DES-CHAT-008`

### 2. 変更・新規作成ファイル
* `package.json` / `package-lock.json`（`@socket.io/redis-adapter`, `redis` 追加 ※Redis使用時）
* `src/apps/chat/chatService.ts`（`REDIS_URL` 設定時の Redis Adapter 接続、および未設定・障害時の安全フォールバック）
* `public/chat/chat.js`（Redis 未使用／障害時の補完用として、入室中のみ5秒間隔で最新20件を差分マージする軽量同期タイマーの組み込み）
* `.env.example`（`REDIS_URL=` の変数名例を追記。実際の値は `.env` のみ）

### 3. 追加・変更する処理（最小実装例）

#### (1) `src/apps/chat/chatService.ts`（`REDIS_URL` がある場合の Adapter 適用と例外保護）
```typescript
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

// initChatSocket 内で REDIS_URL が設定されている場合のみ Redis Adapter を接続
const redisUrl = process.env.REDIS_URL?.trim();
if (redisUrl) {
  Promise.all([
    createClient({ url: redisUrl }).connect(),
    createClient({ url: redisUrl }).connect(),
  ])
    .then(([pubClient, subClient]) => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Chat] Redis Adapter connected');
    })
    .catch((err) => {
      console.error('[Chat] Redis Adapter connection failed (fallback to DB sync):', err);
    });
}
```

### 4. コマンドと実行場所（異なる2台／2プロセスでのローカル確認）
* **実行場所**: VS Code の PowerShell ターミナルを **2つ** 開く（同じ `DATABASE_URL` を共有）
* **コマンド**:
  * **ターミナル 1（1台目: ポート 3000）**:
    ```powershell
    $env:PORT="3000"; npm run dev
    ```
  * **ターミナル 2（2台目: ポート 3001）**:
    ```powershell
    $env:PORT="3001"; npm run dev
    ```

### 5. 確認操作と期待結果
1. **複数インスタンス間のメッセージ同期**:
   * `http://localhost:3000/chat` に3タブ、`http://localhost:3001/chat` に2タブ接続する（合計5名）。
   * `3000` 番側のタブから投稿したメッセージが、`3001` 番側のタブにも反映され、その逆も同様に反映されること。
2. **全台合計で1ルーム5名の定員遵守**:
   * 上記5名が参加中の状態で、6つ目のタブから `http://localhost:3000/chat` と `http://localhost:3001/chat` のどちらへアクセスしても満席制限画面となり、入室・閲覧・投稿が拒否されること。
   * テスト終了後、ターミナル 1・2 の一時変数 `PORT` を削除（`Remove-Item Env:PORT`）する。
3. **既存機能の回帰確認**:
   * `GET /`（TOP画面）、`GET /api/db-check`、`GET /db-sample`、`TODO` の一覧・追加・更新・削除、`AI V1`（`/ai`）、`AI V2`（`/ai/v2/`）、未定義URL（`404`）がすべて正常動作すること。
   * `git status` で `.env` や秘密情報が追跡対象に含まれていないこと。

### 6. つまずいたときの切り分け
* **2プロセス起動時に `3001` 番側も `3000` で起動してしまう**:
  * `index.ts` の `const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;` より前に `dotenv.config()` が呼ばれ `.env` の `PORT=3000` で上書きされていないか確認する。
* **Redis 未起動時にサーバーがクラッシュする**:
  * `createClient` の `.catch(...)` でエラーを捕捉し、ログ出力のみで継続して DB 同期フォールバックへ移行できているか確認する。