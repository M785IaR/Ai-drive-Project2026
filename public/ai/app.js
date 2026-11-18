document.addEventListener('DOMContentLoaded', () => {
  const askForm = document.getElementById('ai-ask-form');
  const promptInput = document.getElementById('prompt-input');
  const charCount = document.getElementById('char-count');
  const submitBtn = document.getElementById('submit-btn');
  const askError = document.getElementById('ask-error');
  const askStatus = document.getElementById('ask-status');

  const latestAnswerSection = document.getElementById('latest-answer-section');
  const latestPrompt = document.getElementById('latest-prompt');
  const latestResponse = document.getElementById('latest-response');

  const historyLoading = document.getElementById('history-loading');
  const historyError = document.getElementById('history-error');
  const historyEmpty = document.getElementById('history-empty');
  const historyList = document.getElementById('history-list');

  const MAX_HISTORY_ITEMS = 20;
  const MIN_CODE_POINTS = 1;
  const MAX_CODE_POINTS = 2000;
  const ASK_TIMEOUT_MS = 45_000;

  // 画面内で保持する履歴配列（新しい順、最大20件）
  let currentHistoryItems = [];
  let isBusy = false;

  /**
   * Unicode コードポイント数を取得する
   */
  function countCodePoints(text) {
    return Array.from(text).length;
  }

  /**
   * 文字数カウンターを更新する
   */
  function updateCharCounter() {
    if (!charCount || !promptInput) return;
    charCount.textContent = String(countCodePoints(promptInput.value));
  }

  /**
   * フォームの busy 状態および入力欄・送信ボタンの操作可否を切り替える
   */
  function setFormBusy(busy) {
    isBusy = busy;
    if (askForm) {
      askForm.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (promptInput) {
      promptInput.disabled = busy;
    }
    if (submitBtn) {
      submitBtn.disabled = busy;
    }
  }

  /**
   * 送信エラー表示の制御
   */
  function showAskError(message) {
    if (!askError) return;
    askError.textContent = message;
    askError.classList.remove('hidden');
  }

  function clearAskError() {
    if (!askError) return;
    askError.textContent = '';
    askError.classList.add('hidden');
  }

  /**
   * 日時文字列を安全に表示用フォーマットへ変換する
   */
  function formatDateTime(isoString) {
    if (typeof isoString !== 'string' || isoString.trim() === '') {
      return '';
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * 履歴1件分の li 要素を生成する（XSS対策のため textContent のみ使用）
   */
  function createHistoryItemElement(item) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-meta';
    metaDiv.textContent = formatDateTime(item?.createdAt);

    const qDiv = document.createElement('div');
    qDiv.className = 'history-q';
    qDiv.textContent = `Q: ${typeof item?.prompt === 'string' ? item.prompt : ''}`;

    const aDiv = document.createElement('div');
    aDiv.className = 'history-a';
    aDiv.textContent = `A: ${typeof item?.response === 'string' ? item.response : ''}`;

    li.appendChild(metaDiv);
    li.appendChild(qDiv);
    li.appendChild(aDiv);
    return li;
  }

  /**
   * 履歴一覧を新しい順・最大20件で安全に描画する
   */
  function renderHistoryItems(items) {
    historyList.textContent = '';

    const normalized = Array.isArray(items) ? items.slice(0, MAX_HISTORY_ITEMS) : [];
    currentHistoryItems = normalized;

    if (normalized.length === 0) {
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyEmpty.classList.add('hidden');
    normalized.forEach((item) => {
      historyList.appendChild(createHistoryItemElement(item));
    });
  }

  /**
   * 初期履歴取得処理（GET /api/ai/history）
   */
  async function loadInitialHistory() {
    setFormBusy(true);

    historyLoading.classList.remove('hidden');
    historyError.classList.add('hidden');
    historyError.textContent = '';
    historyEmpty.classList.add('hidden');
    historyList.textContent = '';

    try {
      const response = await fetch('/api/ai/history', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        throw new Error('履歴データの取得に失敗しました。');
      }

      if (!response.ok || !body || body.success !== true || !Array.isArray(body.items)) {
        throw new Error('履歴の取得に失敗しました。時間をおいて再度お試しください。');
      }

      // 新しい順（createdAt 降順、同値時は id 降順）に整列
      const sortedItems = [...body.items].sort((a, b) => {
        const timeA = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
          return timeB - timeA;
        }
        return Number(b?.id ?? 0) - Number(a?.id ?? 0);
      });

      renderHistoryItems(sortedItems);
    } catch (error) {
      currentHistoryItems = [];
      historyList.textContent = '';
      historyEmpty.classList.add('hidden');
      historyError.textContent =
        error instanceof Error && error.message
          ? error.message
          : '履歴の取得に失敗しました。時間をおいて再度お試しください。';
      historyError.classList.remove('hidden');
    } finally {
      historyLoading.classList.add('hidden');
      setFormBusy(false);
    }
  }

  /**
   * HTTPステータスやAPIエラーコードに応じた固定の安全な案内メッセージを返す
   */
  function resolveSafeAskErrorMessage(status, errorCode) {
    if (errorCode === 'DEMO_DISABLED' || status === 503) {
      return '現在、AI機能は停止中です。時間をおいて再度お試しください。';
    }
    if (status === 400 || errorCode === 'INVALID_INPUT') {
      return '入力内容を確認してください（前後空白を除き1〜2,000文字で入力してください）。';
    }
    if (status === 502 || status === 504) {
      return 'AIサービスの応答を取得できませんでした。時間をおいて再度お試しください。';
    }
    return '質問の送信に失敗しました。時間をおいて再度お試しください。';
  }

  /**
   * フォーム非同期送信処理（POST /api/ai/ask）
   */
  async function handleAskSubmit(event) {
    // 通常のフォーム画面遷移を止める
    event.preventDefault();

    // 送信中の重複操作を抑止
    if (isBusy) {
      return;
    }

    clearAskError();

    // 前後空白を除き、1〜2000コードポイントを検証する
    const trimmedPrompt = promptInput.value.trim();
    const codePointLength = countCodePoints(trimmedPrompt);

    if (codePointLength < MIN_CODE_POINTS || codePointLength > MAX_CODE_POINTS) {
      showAskError(`質問内容は前後空白を除き${MIN_CODE_POINTS}〜${MAX_CODE_POINTS}文字で入力してください。`);
      promptInput.focus();
      return;
    }

    setFormBusy(true);
    if (askStatus) {
      askStatus.classList.remove('hidden');
    }

    // ブラウザ待機45秒のタイムアウト制御（自動再送は行わない）
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, ASK_TIMEOUT_MS);

    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
        signal: abortController.signal,
      });

      // 応答がHTMLや不正JSONの場合でも例外捕捉してUIを復帰させる
      let body = null;
      try {
        body = await response.json();
      } catch {
        throw new Error(resolveSafeAskErrorMessage(response.status, null));
      }

      // fetchは400や500だけでは例外にならないためres.okも判定する
      if (!response.ok || !body || body.success !== true) {
        const errorCode = body && typeof body.error?.code === 'string' ? body.error.code : null;
        throw new Error(resolveSafeAskErrorMessage(response.status, errorCode));
      }

      // 成功応答の形を確認する
      const savedData = body.data;
      if (
        !savedData ||
        typeof savedData !== 'object' ||
        typeof savedData.prompt !== 'string' ||
        typeof savedData.response !== 'string'
      ) {
        throw new Error('AIの回答データの形式が正しくありません。時間をおいて再度お試しください。');
      }

      // 最新回答エリアへ安全に反映（innerHTMLは使用しない）
      latestPrompt.textContent = savedData.prompt;
      latestResponse.textContent = savedData.response;
      latestAnswerSection.classList.remove('hidden');

      // 履歴取得エラーが出ていた場合は解除し、保存結果を先頭へ追加して最大20件を表示
      historyError.classList.add('hidden');
      historyError.textContent = '';
      const updatedItems = [savedData, ...currentHistoryItems].slice(0, MAX_HISTORY_ITEMS);
      renderHistoryItems(updatedItems);

      // 成功時だけ質問欄を消す
      promptInput.value = '';
      updateCharCounter();
    } catch (error) {
      // 失敗時は質問欄の内容を保持したまま、固定の安全な案内を表示する
      if (error instanceof Error && error.name === 'AbortError') {
        showAskError('応答がタイムアウトしました（45秒）。時間をおいて再度お試しください。');
      } else if (error instanceof Error && error.message) {
        showAskError(error.message);
      } else {
        showAskError('通信エラーが発生しました。時間をおいて再度お試しください。');
      }
    } finally {
      clearTimeout(timeoutId);
      // 待機表示と操作制限を確実に解除する
      if (askStatus) {
        askStatus.classList.add('hidden');
      }
      setFormBusy(false);
    }
  }

  if (promptInput) {
    promptInput.addEventListener('input', updateCharCounter);
  }

  if (askForm) {
    askForm.addEventListener('submit', handleAskSubmit);
  }

  updateCharCounter();
  loadInitialHistory();
});