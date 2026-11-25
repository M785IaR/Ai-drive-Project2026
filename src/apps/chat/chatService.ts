import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { ChatModel } from './chatModel';

const DEFAULT_ROOM_ID = 'default';
const MAX_ROOM_MEMBERS = 5;
const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 500;

function validateChatInput(
  userName: unknown,
  message: unknown
): { userName: string; message: string } | null {
  if (typeof userName !== 'string' || typeof message !== 'string') {
    return null;
  }
  const trimmedName = userName.trim();
  const trimmedMessage = message.trim();
  const nameLen = Array.from(trimmedName).length;
  const msgLen = Array.from(trimmedMessage).length;

  if (nameLen < MIN_NAME_LENGTH || nameLen > MAX_NAME_LENGTH) {
    return null;
  }
  if (msgLen < MIN_MESSAGE_LENGTH || msgLen > MAX_MESSAGE_LENGTH) {
    return null;
  }
  return { userName: trimmedName, message: trimmedMessage };
}

export function initChatSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer);

  // REDIS_URL が設定されている場合は Redis Adapter を接続（未設定・失敗時は DB同期フォールバックで継続）
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => {
      console.error('[Chat] Redis pubClient error:', err.message);
    });
    subClient.on('error', (err) => {
      console.error('[Chat] Redis subClient error:', err.message);
    });

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[Chat] Redis Adapter connected');
      })
      .catch((err) => {
        console.error('[Chat] Redis Adapter connection failed (fallback to DB sync):', err);
      });
  }

  io.on('connection', (socket) => {
    let joinedToken: string | null = null;
    console.log(`[Chat] Socket connected: ${socket.id}`);

    socket.on('chat:join', async (payload, ack) => {
      try {
        const token = typeof payload?.memberToken === 'string' ? payload.memberToken.trim() : '';
        if (!token) {
          if (typeof ack === 'function') {
            ack({ ok: false, code: 'INVALID_TOKEN', message: '参加トークンが不正です。' });
          }
          socket.disconnect(true);
          return;
        }

        const joinRes = await ChatModel.tryJoinRoom(
          DEFAULT_ROOM_ID,
          token,
          socket.id,
          MAX_ROOM_MEMBERS
        );

        if (!joinRes.ok) {
          if (typeof ack === 'function') {
            ack({
              ok: false,
              code: 'ROOM_FULL',
              message: '現在満席（定員5名）のため入室できません。空きが出るまでお待ちください。',
            });
          }
          socket.disconnect(true);
          return;
        }

        joinedToken = token;
        await socket.join(DEFAULT_ROOM_ID);

        if (typeof ack === 'function') {
          ack({
            ok: true,
            memberCount: joinRes.memberCount,
            maxMembers: MAX_ROOM_MEMBERS,
          });
        }
        io.to(DEFAULT_ROOM_ID).emit('chat:presence', {
          roomId: DEFAULT_ROOM_ID,
          memberCount: joinRes.memberCount,
          maxMembers: MAX_ROOM_MEMBERS,
        });
      } catch (error) {
        console.error('[Chat] chat:join failed:', error);
        if (typeof ack === 'function') {
          ack({
            ok: false,
            code: 'INTERNAL_ERROR',
            message: '入室処理中にエラーが発生しました。',
          });
        }
      }
    });

    socket.on('chat:heartbeat', async (payload, ack) => {
      try {
        const token = typeof payload?.memberToken === 'string' ? payload.memberToken.trim() : '';
        if (!token || token !== joinedToken) {
          if (typeof ack === 'function') ack({ ok: false });
          return;
        }
        const refreshed = await ChatModel.refreshMemberHeartbeat(DEFAULT_ROOM_ID, token);
        if (typeof ack === 'function') ack({ ok: refreshed });
      } catch (error) {
        console.error('[Chat] heartbeat failed:', error);
        if (typeof ack === 'function') ack({ ok: false });
      }
    });

    socket.on('chat:send', async (payload, ack) => {
      try {
        if (!joinedToken) {
          if (typeof ack === 'function') {
            ack({
              ok: false,
              code: 'NOT_JOINED',
              message: 'ルームに入室していないため送信できません。',
            });
          }
          return;
        }

        const isStillMember = await ChatModel.isValidMember(DEFAULT_ROOM_ID, joinedToken);
        if (!isStillMember) {
          joinedToken = null;
          if (typeof ack === 'function') {
            ack({
              ok: false,
              code: 'NOT_JOINED',
              message: 'セッション期限が切れました。再読み込みして入室し直してください。',
            });
          }
          return;
        }

        const valid = validateChatInput(payload?.userName, payload?.message);
        if (!valid) {
          if (typeof ack === 'function') {
            ack({
              ok: false,
              code: 'INVALID_INPUT',
              message: 'ユーザー名（1〜20文字）とコメント（1〜500文字）を入力してください。',
            });
          }
          return;
        }

        const saved = await ChatModel.createMessage(
          DEFAULT_ROOM_ID,
          valid.userName,
          valid.message
        );
        io.to(DEFAULT_ROOM_ID).emit('chat:message', saved);

        if (typeof ack === 'function') {
          ack({ ok: true, item: saved });
        }
      } catch (error) {
        console.error('[Chat] chat:send failed:', error);
        if (typeof ack === 'function') {
          ack({
            ok: false,
            code: 'DB_ERROR',
            message: 'メッセージの送信に失敗しました。時間をおいて再度お試しください。',
          });
        }
      }
    });

    socket.on('disconnect', async (reason) => {
      console.log(`[Chat] Socket disconnected: ${socket.id} (${reason})`);
      try {
        const remainingCount = await ChatModel.leaveBySocketId(DEFAULT_ROOM_ID, socket.id);
        io.to(DEFAULT_ROOM_ID).emit('chat:presence', {
          roomId: DEFAULT_ROOM_ID,
          memberCount: remainingCount,
          maxMembers: MAX_ROOM_MEMBERS,
        });
      } catch (error) {
        console.error('[Chat] disconnect cleanup failed:', error);
      }
    });
  });

  return io;
}