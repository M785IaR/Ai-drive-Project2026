(() => {
  'use strict';

  const bodyEl = document.body;
  const roomId = bodyEl?.dataset.roomId || 'default';
  const memberToken = bodyEl?.dataset.memberToken || '';
  const initialIsFull = bodyEl?.dataset.isFull === 'true';

  const presenceBadgeEl = document.getElementById('presence-badge');
  const fullNoticeEl = document.getElementById('full-notice');
  const chatMainAreaEl = document.getElementById('chat-main-area');
  const retryBtn = document.getElementById('retry-btn');

  const statusEl = document.getElementById('connection-status');
  const errorEl = document.getElementById('chat-error');
  const messagesBoxEl = document.querySelector('.chat-messages-box');
  const messagesEmptyEl = document.getElementById('messages-empty');
  const messagesListEl = document.getElementById('messages-list');
  const chatForm = document.getElementById('chat-form');
  const userNameInput = document.getElementById('user-name-input');
  const messageInput = document.getElementById('message-input');
  const charCounterEl = document.getElementById('char-counter');
  const sendBtn = document.getElementById('send-btn');

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  // 初期表示時点ですでに満席なら Socket 接続・履歴取得を一切行わない
  if (initialIsFull || !memberToken) {
    return;
  }

  const messageMap = new Map();
  let isJoined = false;
  let isConnected = false;
  let isSending = false;

  function setError(text) {
    if (!errorEl) return;
    if (text) {
      errorEl.textContent = text;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  function showFullScreen() {
    isJoined = false;
    if (chatMainAreaEl) chatMainAreaEl.hidden = true;
    if (fullNoticeEl) fullNoticeEl.hidden = false;
    if (presenceBadgeEl) {
      presenceBadgeEl.textContent = '現在の参加人数: 5 / 5 人（満席）';
    }
  }

  function updatePresence(count, max) {
    if (presenceBadgeEl) {
      presenceBadgeEl.textContent = `現在の参加人数: ${count} / ${max} 人`;
    }
  }

  function countCodePoints(str) {
    return Array.from(str).length;
  }

  function updateCounter() {
    if (!messageInput || !charCounterEl) return;
    const len = countCodePoints(messageInput.value.trim());
    charCounterEl.textContent = `${len} / 500 文字`;
  }

  function mergeAndRenderMessages(items) {
    if (!Array.isArray(items)) return;
    const prevLastId =
      messageMap.size > 0 ? Math.max(...Array.from(messageMap.keys())) : 0;

    for (const item of items) {
      if (item && typeof item.id === 'number') {
        messageMap.set(item.id, item);
      }
    }

    const sorted = Array.from(messageMap.values())
      .sort((a, b) => a.id - b.id)
      .slice(-20);

    if (!messagesListEl || !messagesEmptyEl) return;
    messagesListEl.textContent = '';

    if (sorted.length === 0) {
      messagesEmptyEl.hidden = false;
      return;
    }

    messagesEmptyEl.hidden = true;
    for (const msg of sorted) {
      const li = document.createElement('li');
      li.className = 'chat-message-item';

      const meta = document.createElement('div');
      meta.className = 'chat-message-meta';
      const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleString('ja-JP') : '';
      meta.textContent = `${msg.userName} (${timeStr})`;

      const body = document.createElement('p');
      body.className = 'chat-message-body';
      body.textContent = msg.message;

      li.appendChild(meta);
      li.appendChild(body);
      messagesListEl.appendChild(li);
    }

    const newLastId = sorted[sorted.length - 1].id;
    if (messagesBoxEl && newLastId > prevLastId) {
      messagesBoxEl.scrollTop = messagesBoxEl.scrollHeight;
    }
  }

  async function loadRecentHistory(silent = false) {
    if (!isJoined) return;
    try {
      const res = await fetch('/api/chat/messages', {
        headers: {
          'X-Chat-Member-Token': memberToken,
        },
      });
      if (!res.ok) {
        throw new Error(`履歴の取得に失敗しました (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data && data.success && Array.isArray(data.items)) {
        mergeAndRenderMessages(data.items);
        if (typeof data.memberCount === 'number' && typeof data.maxMembers === 'number') {
          updatePresence(data.memberCount, data.maxMembers);
        }
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : '履歴の取得に失敗しました。');
      }
    }
  }

  // Socket.IO 初期化（リスナーは1回だけ登録）
  const socket = io();

  socket.on('connect', () => {
    isConnected = true;
    if (statusEl) {
      statusEl.textContent = '入室確認中...';
    }

    socket.emit('chat:join', { roomId, memberToken }, (ack) => {
      if (!ack || !ack.ok) {
        if (ack && ack.code === 'ROOM_FULL') {
          showFullScreen();
        } else {
          setError((ack && ack.message) || 'ルームへの入室に失敗しました。');
        }
        return;
      }

      isJoined = true;
      setError('');
      if (statusEl) {
        statusEl.textContent = '入室中（リアルタイム接続済み）';
      }
      if (sendBtn) sendBtn.disabled = false;
      updatePresence(ack.memberCount, ack.maxMembers);
      loadRecentHistory(false);
    });
  });

  socket.on('connect_error', () => {
    isConnected = false;
    if (statusEl) {
      statusEl.textContent = 'サーバーへの接続に失敗しました';
    }
    setError('サーバーと通信できません。ネットワーク状態をご確認ください。');
  });

  socket.on('disconnect', () => {
    isConnected = false;
    if (statusEl) {
      statusEl.textContent = 'サーバーから切断されました（再接続待機中...）';
    }
    if (sendBtn) sendBtn.disabled = true;
  });

  socket.on('chat:presence', (data) => {
    if (data && typeof data.memberCount === 'number' && typeof data.maxMembers === 'number') {
      updatePresence(data.memberCount, data.maxMembers);
    }
  });

  socket.on('chat:message', (msg) => {
    if (!isJoined) return;
    mergeAndRenderMessages([msg]);
  });

  // 20秒ごとにハートビートを送り席を維持する
  setInterval(() => {
    if (isConnected && isJoined) {
      socket.emit('chat:heartbeat', { roomId, memberToken });
    }
  }, 20000);

  // マルチインスタンス・Redis未設定時のフォールバック用（5秒間隔で差分同期）
  setInterval(() => {
    if (isConnected && isJoined) {
      loadRecentHistory(true);
    }
  }, 5000);

  if (messageInput) {
    messageInput.addEventListener('input', updateCounter);
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (isSending || !userNameInput || !messageInput) return;

      if (!isConnected || !isJoined) {
        setError('サーバーに接続されていないため送信できません。');
        return;
      }

      setError('');
      const trimmedName = userNameInput.value.trim();
      const trimmedMsg = messageInput.value.trim();
      const nameLen = countCodePoints(trimmedName);
      const msgLen = countCodePoints(trimmedMsg);

      if (nameLen < 1 || nameLen > 20) {
        setError('ユーザー名は前後空白を除き1〜20文字で入力してください。');
        userNameInput.focus();
        return;
      }
      if (msgLen < 1 || msgLen > 500) {
        setError('コメントは前後空白を除き1〜500文字で入力してください。');
        messageInput.focus();
        return;
      }

      isSending = true;
      if (sendBtn) sendBtn.disabled = true;

      socket.emit(
        'chat:send',
        { roomId, userName: trimmedName, message: trimmedMsg },
        (ack) => {
          isSending = false;
          if (sendBtn && isConnected) sendBtn.disabled = false;

          if (!ack || !ack.ok) {
            setError((ack && ack.message) || 'メッセージの送信に失敗しました。');
            return;
          }

          messageInput.value = '';
          updateCounter();
          messageInput.focus();
        }
      );
    });
  }

  updateCounter();
})();