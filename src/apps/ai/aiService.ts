import { GoogleGenAI } from '@google/genai';
import { AiModel, PublicAiQaLog } from './aiModel';

const AI_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 1024;

export class AiServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AiService {
  /**
   * 質問を受け付け、Gemini API で回答を生成し、DBに保存して結果を返す
   */
  static async askQuestion(prompt: string): Promise<PublicAiQaLog> {
    const startTime = Date.now();

    // Gemini API 呼び出し（今回の prompt のみを送信し、過去履歴は送らない）
    const responseText = await this.generateAnswer(prompt);

    // 空回答は失敗扱いとし、DBへ保存しない
    const trimmedResponse = responseText.trim();
    if (trimmedResponse.length === 0) {
      throw new AiServiceError(
        'AIから有効な回答を取得できませんでした。',
        502,
        'AI_EMPTY_RESPONSE'
      );
    }

    const responseTimeMs = Date.now() - startTime;

    // 本番共通のModelを使ってDBに記録
    const createdLog = await AiModel.createLog({
      prompt,
      responseText: trimmedResponse,
      status: 'SUCCESS',
      responseTimeMs,
    });

    return createdLog;
  }

  /**
   * [実API処理] Gemini API を呼び出して回答文字列を生成する
   */
  private static async generateAnswer(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim();

    if (!apiKey || !model) {
      console.error('[AI] GEMINI_API_KEY または GEMINI_MODEL が未設定です。');
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
          // SDKの自動再試行をしない（初回1回に制限）
          retryOptions: { attempts: 1 },
        },
      });

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
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

      // 秘密情報を含まない概要ログのみ出力
      console.error(
        `[AI] Gemini API 呼び出し失敗: ${isAbort ? 'Timeout (30s)' : 'Upstream Error'}`
      );

      // 生例外は返さず、安全な固定エラーコード（502）へ変換
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