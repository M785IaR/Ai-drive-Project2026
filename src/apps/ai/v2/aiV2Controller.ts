import { Request, Response, NextFunction } from 'express';
import { AiV2Model } from './aiV2Model';
import { AiV2Service } from './aiV2Service';
import { AiServiceError } from '../aiService';

const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 50;
const MIN_PROMPT_LENGTH = 1;
const MAX_PROMPT_LENGTH = 2000;
const MAX_JSON_BYTES = 16 * 1024; // 16 KiB

export class AiV2Controller {
  /**
   * V2 API 有効チェック
   * AI_V2_ENABLED が設定されていればそれを優先し、未設定時は AI_DEMO_ENABLED を参照する。
   * 'true' と厳密一致しない場合は 503 DEMO_DISABLED を返却する。
   */
  private static isV2Enabled(): boolean {
    const flag = process.env.AI_V2_ENABLED ?? process.env.AI_DEMO_ENABLED;
    return flag === 'true';
  }

  /**
   * 公開停止ガードミドルウェア（JSONパーサーやDB処理より先に実行）
   */
  static demoGuard(_req: Request, res: Response, next: NextFunction): void {
    if (!AiV2Controller.isV2Enabled()) {
      res.status(503).json({
        success: false,
        error: {
          code: 'DEMO_DISABLED',
          message: '現在、AI V2機能は停止中です。',
        },
      });
      return;
    }
    next();
  }

  /**
   * JSON本文 16 KiB 上限チェックミドルウェア
   */
  static payloadSizeGuard(req: Request, res: Response, next: NextFunction): void {
    const contentLength = req.headers['content-length'];
    if (contentLength && Number(contentLength) > MAX_JSON_BYTES) {
      res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'リクエスト本文は16 KiB以内で送信してください。',
        },
      });
      return;
    }

    if (req.body && typeof req.body === 'object') {
      const bodyBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8');
      if (bodyBytes > MAX_JSON_BYTES) {
        res.status(413).json({
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'リクエスト本文は16 KiB以内で送信してください。',
          },
        });
        return;
      }
    }

    next();
  }

  /**
   * パスパラメータ :id の正整数検証ヘルパー
   */
  private static parsePositiveIntId(rawId: unknown): number | null {
    if (typeof rawId !== 'string' || !/^[1-9]\d*$/.test(rawId)) {
      return null;
    }
    const parsed = Number(rawId);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * 会話一覧の取得 (GET /api/ai/v2/conversations)
   */
  static async listConversations(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await AiV2Model.listConversations(50);
      res.status(200).json({
        success: true,
        items,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 新規会話の作成 (POST /api/ai/v2/conversations)
   */
  static async createConversation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const title = req.body?.title;

      if (typeof title !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '会話名（title）は文字列で入力してください。',
          },
        });
        return;
      }

      const trimmedTitle = title.trim();
      const codePointLength = Array.from(trimmedTitle).length;

      if (codePointLength < MIN_TITLE_LENGTH || codePointLength > MAX_TITLE_LENGTH) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `会話名は前後空白を除き${MIN_TITLE_LENGTH}〜${MAX_TITLE_LENGTH}文字で入力してください。`,
          },
        });
        return;
      }

      const item = await AiV2Model.createConversation(trimmedTitle);
      res.status(201).json({
        success: true,
        item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 指定会話の履歴取得 (GET /api/ai/v2/conversations/:id/turns, 最新20往復・古い順)
   */
  static async getConversationTurns(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const conversationId = AiV2Controller.parsePositiveIntId(req.params.id);
      if (conversationId === null) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: '会話IDは正の整数で指定してください。',
          },
        });
        return;
      }

      const exists = await AiV2Model.existsConversation(conversationId);
      if (!exists) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '指定された会話が見つかりません。',
          },
        });
        return;
      }

      const items = await AiV2Model.getRecentTurnsForDisplay(conversationId, 20);
      res.status(200).json({
        success: true,
        items,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 指定会話への質問送信・文脈付き回答取得・1往復保存 (POST /api/ai/v2/conversations/:id/turns)
   */
  static async postConversationTurn(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // 1. 会話IDの形式検証
      const conversationId = AiV2Controller.parsePositiveIntId(req.params.id);
      if (conversationId === null) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ID',
            message: '会話IDは正の整数で指定してください。',
          },
        });
        return;
      }

      // 2. 質問文（prompt）の入力検証（前後空白除去後 1〜2,000 Unicodeコードポイント）
      const prompt = req.body?.prompt;
      if (typeof prompt !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '質問内容（prompt）は文字列で入力してください。',
          },
        });
        return;
      }

      const trimmedPrompt = prompt.trim();
      const codePointLength = Array.from(trimmedPrompt).length;
      if (codePointLength < MIN_PROMPT_LENGTH || codePointLength > MAX_PROMPT_LENGTH) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `質問内容は前後空白を除き${MIN_PROMPT_LENGTH}〜${MAX_PROMPT_LENGTH}文字で入力してください。`,
          },
        });
        return;
      }

      // 3. 会話の存在確認（存在しなければ404を返し、Geminiは呼ばない）
      const exists = await AiV2Model.existsConversation(conversationId);
      if (!exists) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '指定された会話が見つかりません。',
          },
        });
        return;
      }

      // 4. 文脈組み立て → Gemini呼出 → DB保存
      const item = await AiV2Service.askInConversation(conversationId, trimmedPrompt);

      // 5. 両方成功後に 201 Created を返却
      res.status(201).json({
        success: true,
        item,
      });
    } catch (error) {
      if (error instanceof AiServiceError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }
      next(error);
    }
  }
}