import { GoogleGenAI, Content } from '@google/genai';
import { AiV2Model, AiContextTurn, AiConversationTurnRow } from './aiV2Model';
import { AiServiceError } from '../aiService';

const AI_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1024;
const CONTEXT_TURN_LIMIT = 5;

export class AiV2Service {
  /**
   * 過去の往復（古い順）と今回の質問から Gemini API 用の contents 配列を組み立てる
   */
  static buildContents(historyTurns: AiContextTurn[], currentPrompt: string): Content[] {
    const contents: Content[] = [];

    for (const turn of historyTurns) {
      contents.push({
        role: 'user',
        parts: [{ text: turn.prompt }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: turn.responseText }],
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });

    return contents;
  }

  /**
   * 指定会話に質問を送信し、文脈付きで回答を取得・保存して返す
   * 順序: 最新5往復取得 → contents組立 → Gemini呼出 → 空回答検証 → DB保存
   */
  static async askInConversation(
    conversationId: number,
    currentPrompt: string
  ): Promise<AiConversationTurnRow> {
    // 1. 同じ会話の保存済み最新5往復を古い順で取得（初回は0件）
    const historyTurns = await AiV2Model.getRecentTurnsForContext(
      conversationId,
      CONTEXT_TURN_LIMIT
    );

    // 2. [user, model, ..., user] の文脈を組み立て
    const contents = this.buildContents(historyTurns, currentPrompt);

    // 3. Gemini API 呼び出し
    const rawResponseText = await this.generateAnswerWithContext(contents);

    // 4. 空回答は失敗扱いとし、DBへ保存しない
    const trimmedResponse = rawResponseText.trim();
    if (trimmedResponse.length === 0) {
      throw new AiServiceError(
        'AIから有効な回答を取得できませんでした。',
        502,
        'AI_BAD_GATEWAY'
      );
    }

    // 5. 有効な回答を得た後にのみ、1往復としてDBへ保存
    const savedTurn = await AiV2Model.createTurn(
      conversationId,
      currentPrompt,
      trimmedResponse
    );

    return savedTurn;
  }

  /**
   * Gemini API を呼び出して回答文字列を生成する（V1同一設定・再試行なし）
   */
  private static async generateAnswerWithContext(contents: Content[]): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim();

    if (!apiKey || !model) {
      console.error('[AI V2] GEMINI_API_KEY または GEMINI_MODEL が未設定です。');
      throw new AiServiceError(
        'AIサービスの設定が完了していません。管理者にお問い合わせください。',
        502,
        'AI_BAD_GATEWAY'
      );
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, AI_TIMEOUT_MS);

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          timeout: AI_TIMEOUT_MS,
          retryOptions: { attempts: 1 },
        },
      });

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          abortSignal: abortController.signal,
        },
      });

      return response.text ?? '';
    } catch (error: unknown) {
      const isAbort =
        error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));

      console.error(
        `[AI V2] Gemini API 呼び出し失敗: ${isAbort ? 'Timeout (30s)' : 'Upstream Error'}`
      );

      throw new AiServiceError(
        'AIサービスとの通信に失敗しました。時間をおいて再度お試しください。',
        502,
        'AI_BAD_GATEWAY'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}