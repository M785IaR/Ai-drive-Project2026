document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('ai-ask-form');
  const promptInput = document.getElementById('prompt-input');
  const charCount = document.getElementById('char-count');
  const submitBtn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('error-message');

  const latestAnswerSection = document.getElementById('latest-answer-section');
  const latestPrompt = document.getElementById('latest-prompt');
  const latestResponse = document.getElementById('latest-response');

  const historyList = document.getElementById('history-list');
  const historyLoading = document.getElementById('history-loading');
  const historyEmpty = document.getElementById('history-empty');
  const reloadHistoryBtn = document.getElementById('reload-history-btn');

  const MAX_LENGTH = 1000;
  let isSubmitting = false;

  // 文字数カウント更新
  promptInput.addEventListener('input', () => {
    charCount.textContent = String(promptInput.value.length);
  });

  // エラー表示制御
  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  // 日時フォーマット
  function formatDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  // 履歴一覧の描画（XSS対策のため必ず textContent を使用）
  function renderHistory(items) {
    historyList.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyEmpty.classList.add('hidden');

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const metaDiv = document.createElement('div');
      metaDiv.className = 'history-meta';
      metaDiv.textContent = formatDateTime(item.createdAt);

      const qDiv = document.createElement('div');
      qDiv.className = 'history-q';
      qDiv.textContent = `Q: ${item.prompt}`;

      const aDiv = document.createElement('div');
      aDiv.className = 'history-a';
      aDiv.textContent = `A: ${item.response}`;

      li.appendChild(metaDiv);
      li.appendChild(qDiv);
      li.appendChild(aDiv);
      historyList.appendChild(li);
    });
  }

  // 履歴取得APIの呼び出し
  async function fetchHistory() {
    historyLoading.classList.remove('hidden');
    historyEmpty.classList.add('hidden');

    try {
      const res = await fetch('/api/ai/history', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || '履歴の取得に失敗しました。');
      }

      renderHistory(body.items);
    } catch (err) {
      historyList.innerHTML = '';
      showError(err.message || '履歴の読み込み中にエラーが発生しました。');
    } finally {
      historyLoading.classList.add('hidden');
    }
  }

  // 送信中状態の切り替え（二重送信防止）
  function setSubmittingState(submitting) {
    isSubmitting = submitting;
    submitBtn.disabled = submitting;
    promptInput.disabled = submitting;
    submitBtn.textContent = submitting ? '送信中...（AIが回答を生成しています）' : '質問を送信する';
  }

  // 質問送信処理
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    clearError();

    const rawPrompt = promptInput.value;
    const trimmedPrompt = rawPrompt.trim();

    // フロントエンド入力検証
    if (trimmedPrompt.length === 0) {
      showError('質問内容を入力してください（空白のみは送信できません）。');
      promptInput.focus();
      return;
    }

    if (trimmedPrompt.length > MAX_LENGTH) {
      showError(`質問内容は${MAX_LENGTH}文字以内で入力してください。`);
      promptInput.focus();
      return;
    }

    setSubmittingState(true);

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || 'AIへの質問送信に失敗しました。');
      }

      // 最新回答エリアに反映
      const result = body.data;
      latestPrompt.textContent = result.prompt;
      latestResponse.textContent = result.response;
      latestAnswerSection.classList.remove('hidden');

      // フォームをリセット
      promptInput.value = '';
      charCount.textContent = '0';

      // 履歴一覧を再取得して最新状態に更新
      await fetchHistory();
    } catch (err) {
      showError(err.message || '通信エラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setSubmittingState(false);
    }
  });

  // 履歴手動更新ボタン
  reloadHistoryBtn.addEventListener('click', () => {
    clearError();
    fetchHistory();
  });

  // 初期表示時の履歴取得
  fetchHistory();
});