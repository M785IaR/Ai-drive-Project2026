import { Request, Response, NextFunction } from 'express';
import { AiModel } from './aiModel';

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
      // 例外発生時は next(error) を呼び出しグローバルエラーハンドラーへ委任
      next(error);
    }
  }
}