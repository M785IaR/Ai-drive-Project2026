(() => {
  'use strict';

  const MIN_TITLE_LENGTH = 1;
  const MAX_TITLE_LENGTH = 50;
  const MIN_PROMPT_LENGTH = 1;
  const MAX_PROMPT_LENGTH = 2000;
  const FETCH_TIMEOUT_MS = 15000;
  const ASK_TIMEOUT_MS = 45000;
  const STORAGE_KEY = 'ai_v2_selected_conversation_id';

  // DOM要素
  const createForm = document.getElementById('create-conversation-form');
  const titleInput = document.getElementById('conversation-title-input');
  const createBtn = document.getElementById('create-conversation-btn');
  const reloadBtn = document.getElementById('reload-conversations-btn');
  const conversationListEmpty = document.getElementById('conversation-list-empty');
  const conversationListEl = document.getElementById('conversation-list');

  const activeTitleEl = document.getElementById('active-conversation-title');
  const activeMetaEl = document.getElementById('active-conversation-meta');
  const statusEl = document.getElementById('status-message');
  const errorEl = document.getElementById('error-message');

  const turnsContainerEl = document.getElementById('turns-container');
  const turnsEmptyEl = document.getElementById('turns-empty-message');
  const turnsListEl = document.getElementById('turns-list');

  const askForm = document.getElementById('ask-form');
  const promptInput = document.getElementById('prompt-input');
  const charCounterEl = document.getElementById('char-counter');
  const askSubmitBtn = document.getElementById('ask-submit-btn');

  // クライアント状態
  let conversations = [];
  let selectedConversationId = null;
  let currentTurns = [];
  let isBusy = false;

  /**
   * Unicodeコードポイント数を返す
   */
  function countCodePoints(text) {
    return Array.from(text).length;
  }

  /**
   * 日時文字列のフォーマット
   */
  function formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ja-JP');
  }

  /**
   * URLクエリおよびlocalStorageから選択中の会話IDを取得
   */
  function getInitialConversationId() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = Number(params.get('conversationId'));
    if (Number.isInteger(fromQuery) && fromQuery > 0) {
      return fromQuery;
    }
    const fromStorage = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(fromStorage) && fromStorage > 0) {
      return fromStorage;
    }
    return null;
  }

  /**
   * 選択中の会話IDをURLクエリとlocalStorageへ反映
   */
  function persistSelectedConversationId(id) {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('conversationId', String(id));
      window.localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      url.searchParams.delete('conversationId');
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * ステータス・エラーメッセージ表示制御
   */
  function setStatus(message) {
    if (message) {
      statusEl.textContent = message;
      statusEl.hidden = false;
    } else {
      statusEl.textContent = '';
      statusEl.hidden = true;
    }
  }

  function setError(message) {
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
  }

  /**
   * 通信中ロック・UI復帰制御
   */
  function setBusyState(busy, statusMessage = '') {
    isBusy = busy;
    titleInput.disabled = busy;
    createBtn.disabled = busy;
    reloadBtn.disabled = busy;

    const listButtons = conversationListEl.querySelectorAll('button');
    listButtons.forEach((btn) => {
      btn.disabled = busy;
    });

    const canAsk = !busy && selectedConversationId !== null;
    promptInput.disabled = !canAsk;
    askSubmitBtn.disabled = !canAsk;
    askForm.setAttribute('aria-busy', busy ? 'true' : 'false');

    setStatus(busy ? statusMessage : '');
  }

  /**
   * 文字数カウンター更新
   */
  function updateCharCounter() {
    const len = countCodePoints(promptInput.value.trim());
    charCounterEl.textContent = `${len} / ${MAX_PROMPT_LENGTH} 文字`;
  }

  /**
   * タイムアウト付き fetch（自動再送なし）
   */
  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('サーバーから予期しない形式の応答が返されました。');
      }

      const data = await response.json();
      if (!response.ok || !data || data.success !== true) {
        const serverMessage =
          data && data.error && typeof data.error.message === 'string'
            ? data.error.message
            : `通信エラーが発生しました（HTTP ${response.status}）。`;
        throw new Error(serverMessage);
      }

      return data;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('通信がタイムアウトしました。時間をおいて再度お試しください。');
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('通信に失敗しました。');
    } finally {
      window.clearTimeout(timerId);
    }
  }

  /**
   * 会話一覧の描画（すべて textContent を使用）
   */
  function renderConversationList() {
    conversationListEl.textContent = '';

    if (conversations.length === 0) {
      conversationListEmpty.hidden = false;
      return;
    }

    conversationListEmpty.hidden = true;

    for (const conv of conversations) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'v2-conversation-item-btn';
      btn.disabled = isBusy;

      if (conv.id === selectedConversationId) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-current', 'true');
      }

      const titleSpan = document.createElement('span');
      titleSpan.className = 'v2-conv-item-title';
      titleSpan.textContent = conv.title;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'v2-conv-item-date';
      dateSpan.textContent = `ID: ${conv.id} / ${formatDateTime(conv.createdAt)}`;

      btn.appendChild(titleSpan);
      btn.appendChild(dateSpan);

      btn.addEventListener('click', () => {
        if (isBusy || conv.id === selectedConversationId) return;
        selectConversation(conv.id);
      });

      li.appendChild(btn);
      conversationListEl.appendChild(li);
    }
  }

  /**
   * 選択中会話のヘッダー・履歴の描画（最新20往復・古い順、すべて textContent）
   */
  function renderActiveConversation() {
    const activeConv = conversations.find((c) => c.id === selectedConversationId) || null;
    turnsListEl.textContent = '';

    if (!activeConv) {
      activeTitleEl.textContent = '会話が選択されていません';
      activeMetaEl.textContent = '';
      turnsEmptyEl.textContent = '左の一覧から会話を選択するか、新しい会話を作成してください。';
      turnsEmptyEl.hidden = false;
      promptInput.placeholder = '会話を選択してから質問を入力してください...';
      return;
    }

    activeTitleEl.textContent = activeConv.title;
    activeMetaEl.textContent = `会話ID: ${activeConv.id}（最新20往復まで表示）`;
    promptInput.placeholder = `「${activeConv.title}」について質問を入力してください...`;

    if (currentTurns.length === 0) {
      turnsEmptyEl.textContent = 'この会話の履歴はまだありません。最初の質問を送信してください。';
      turnsEmptyEl.hidden = false;
      return;
    }

    turnsEmptyEl.hidden = true;

    for (const turn of currentTurns) {
      const card = document.createElement('article');
      card.className = 'v2-turn-card';

      // 質問ブロック
      const userBlock = document.createElement('div');
      userBlock.className = 'v2-turn-block';
      const userRole = document.createElement('div');
      userRole.className = 'v2-turn-role v2-turn-role-user';
      userRole.textContent = 'あなた';
      const userText = document.createElement('p');
      userText.className = 'v2-turn-text';
      userText.textContent = turn.prompt;
      userBlock.appendChild(userRole);
      userBlock.appendChild(userText);

      // AI回答ブロック
      const aiBlock = document.createElement('div');
      aiBlock.className = 'v2-turn-block';
      const aiRole = document.createElement('div');
      aiRole.className = 'v2-turn-role v2-turn-role-ai';
      aiRole.textContent = 'AI';
      const aiText = document.createElement('p');
      aiText.className = 'v2-turn-text';
      aiText.textContent = turn.responseText;
      aiBlock.appendChild(aiRole);
      aiBlock.appendChild(aiText);

      // 日時
      const timeEl = document.createElement('div');
      timeEl.className = 'v2-turn-time';
      timeEl.textContent = formatDateTime(turn.createdAt);

      card.appendChild(userBlock);
      card.appendChild(aiBlock);
      card.appendChild(timeEl);
      turnsListEl.appendChild(card);
    }

    turnsContainerEl.scrollTop = turnsContainerEl.scrollHeight;
  }

  /**
   * 指定会話の履歴を取得して表示する
   */
  async function selectConversation(conversationId) {
    setError('');
    setBusyState(true, '履歴を読み込んでいます...');

    try {
      const data = await fetchJsonWithTimeout(
        `/api/ai/v2/conversations/${encodeURIComponent(conversationId)}/turns`,
        { method: 'GET' },
        FETCH_TIMEOUT_MS
      );

      selectedConversationId = conversationId;
      currentTurns = Array.isArray(data.items) ? data.items : [];
      persistSelectedConversationId(conversationId);
      renderConversationList();
      renderActiveConversation();
    } catch (error) {
      setError(error.message || '履歴の取得に失敗しました。');
    } finally {
      setBusyState(false);
    }
  }

  /**
   * 会話一覧を取得し、必要に応じて前回の会話を再開する
   */
  async function loadConversations(preferredId = null) {
    setError('');
    setBusyState(true, '会話一覧を読み込んでいます...');

    try {
      const data = await fetchJsonWithTimeout(
        '/api/ai/v2/conversations',
        { method: 'GET' },
        FETCH_TIMEOUT_MS
      );

      conversations = Array.isArray(data.items) ? data.items : [];

      const targetId =
        preferredId && conversations.some((c) => c.id === preferredId)
          ? preferredId
          : selectedConversationId && conversations.some((c) => c.id === selectedConversationId)
            ? selectedConversationId
            : null;

      if (targetId !== null) {
        const turnsData = await fetchJsonWithTimeout(
          `/api/ai/v2/conversations/${encodeURIComponent(targetId)}/turns`,
          { method: 'GET' },
          FETCH_TIMEOUT_MS
        );
        selectedConversationId = targetId;
        currentTurns = Array.isArray(turnsData.items) ? turnsData.items : [];
        persistSelectedConversationId(targetId);
      } else {
        selectedConversationId = null;
        currentTurns = [];
        persistSelectedConversationId(null);
      }

      renderConversationList();
      renderActiveConversation();
    } catch (error) {
      setError(error.message || '会話一覧の取得に失敗しました。');
      renderConversationList();
      renderActiveConversation();
    } finally {
      setBusyState(false);
    }
  }

  /**
   * 新規会話作成フォーム送信
   */
  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy) return;

    setError('');
    const trimmedTitle = titleInput.value.trim();
    const length = countCodePoints(trimmedTitle);

    if (length < MIN_TITLE_LENGTH || length > MAX_TITLE_LENGTH) {
      setError(`会話名は前後空白を除き${MIN_TITLE_LENGTH}〜${MAX_TITLE_LENGTH}文字で入力してください。`);
      titleInput.focus();
      return;
    }

    setBusyState(true, '新しい会話を作成しています...');

    try {
      const data = await fetchJsonWithTimeout(
        '/api/ai/v2/conversations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmedTitle }),
        },
        FETCH_TIMEOUT_MS
      );

      const created = data.item;
      titleInput.value = '';
      conversations = [created, ...conversations.filter((c) => c.id !== created.id)];
      selectedConversationId = created.id;
      currentTurns = [];
      persistSelectedConversationId(created.id);

      renderConversationList();
      renderActiveConversation();
    } catch (error) {
      // 失敗時は入力値を保持したままエラー表示
      setError(error.message || '会話の作成に失敗しました。');
    } finally {
      setBusyState(false);
    }
  });

  /**
   * 質問送信フォーム送信
   */
  askForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isBusy || selectedConversationId === null) return;

    setError('');
    const trimmedPrompt = promptInput.value.trim();
    const length = countCodePoints(trimmedPrompt);

    if (length < MIN_PROMPT_LENGTH || length > MAX_PROMPT_LENGTH) {
      setError(`質問内容は前後空白を除き${MIN_PROMPT_LENGTH}〜${MAX_PROMPT_LENGTH}文字で入力してください。`);
      promptInput.focus();
      return;
    }

    setBusyState(true, 'AIが回答を作成中です...（最大45秒）');

    try {
      const data = await fetchJsonWithTimeout(
        `/api/ai/v2/conversations/${encodeURIComponent(selectedConversationId)}/turns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmedPrompt }),
        },
        ASK_TIMEOUT_MS
      );

      // 成功時のみ入力欄をクリアし、最新20往復以内になるよう追加表示
      promptInput.value = '';
      updateCharCounter();

      currentTurns = [...currentTurns, data.item].slice(-20);
      renderActiveConversation();
    } catch (error) {
      // 失敗時は入力欄の質問文を保持したまま操作可能状態へ戻す
      setError(error.message || '質問の送信に失敗しました。');
    } finally {
      setBusyState(false);
      if (selectedConversationId !== null) {
        promptInput.focus();
      }
    }
  });

  // イベント登録
  promptInput.addEventListener('input', updateCharCounter);
  reloadBtn.addEventListener('click', () => {
    if (!isBusy) {
      loadConversations(selectedConversationId);
    }
  });

  // 初期表示
  updateCharCounter();
  const initialId = getInitialConversationId();
  loadConversations(initialId);
})();