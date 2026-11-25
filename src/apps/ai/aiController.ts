import { Request, Response, NextFunction } from 'express';
import { AiModel } from './aiModel';
import { AiService, AiServiceError } from './aiService';

const MIN_PROMPT_LENGTH = 1;
const MAX_PROMPT_LENGTH = 2000;

export class AiController {
  /**
   * デモ機能有効チェック（AI_DEMO_ENABLED が 'true' 以外は 503 を返却）
   */
  private static ensureDemoEnabled(res: Response): boolean {
    if (process.env.AI_DEMO_ENABLED !== 'true') {
      res.status(503).json({
        success: false,
        error: {
          code: 'DEMO_DISABLED',
          message: '現在、AI機能は停止中です。',
        },
      });
      return false;
    }
    return true;
  }

  /**
   * JSONパーサーより先に実行するデモ停止ガードミドルウェア
   */
  static demoGuard(_req: Request, res: Response, next: NextFunction): void {
    if (!AiController.ensureDemoEnabled(res)) return;
    next();
  }

  /**
   * ヘルスチェック
   */
  static async healthCheck(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      message: 'AI Module is operational',
    });
  }

  /**
   * 最新のQA履歴一覧を取得する (GET /api/ai/history, 最大20件)
   */
  static async getHistory(_req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!AiController.ensureDemoEnabled(res)) return;

    try {
      const logs = await AiModel.getRecentLogs(20);

      // 0件であっても 200 OK、success: true、items: [] を返却
      res.status(200).json({
        success: true,
        items: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 質問の送信・受付ハンドラー (POST /api/ai/ask)
   */
  static async postAsk(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!AiController.ensureDemoEnabled(res)) return;

    try {
      const prompt = req.body?.prompt;

      // 型検証
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

      // 前後空白除去後、Unicodeコードポイント数で 1〜2,000文字を検証
      const trimmedPrompt = prompt.trim();
      const codePointLength = Array.from(trimmedPrompt).length;

      if (codePointLength < MIN_PROMPT_LENGTH || codePointLength > MAX_PROMPT_LENGTH) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: `質問内容は${MIN_PROMPT_LENGTH}〜${MAX_PROMPT_LENGTH}文字で入力してください。`,
          },
        });
        return;
      }

      // サービス呼び出し（Gemini API での回答生成およびDB保存）
      const result = await AiService.askQuestion(trimmedPrompt);

      // 201 Created で返却
      res.status(201).json({
        success: true,
        data: result,
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