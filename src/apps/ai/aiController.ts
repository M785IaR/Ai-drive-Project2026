import { Request, Response, NextFunction } from 'express';
import { AiModel } from './aiModel';
import { AiService } from './aiService';

export class AiController {
  /**
   * ヘルスチェック
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      message: 'AI Module is operational',
    });
  }

  /**
   * 最新のQA履歴一覧を取得する (GET /api/ai/history, 最大20件)
   */
  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    try {
      const prompt = req.body?.prompt;

      // 入力検証（バリデーション）: 空文字・型・文字数(1〜1000文字)
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '質問内容（prompt）を1文字以上で入力してください。',
          },
        });
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (trimmedPrompt.length > 1000) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '質問内容は1000文字以内で入力してください。',
          },
        });
        return;
      }

      // サービス呼び出し（模擬回答の生成およびDB保存）
      const result = await AiService.askQuestion(trimmedPrompt);

      // 201 Created で返却
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}