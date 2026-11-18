import { Router, Request, Response } from 'express';
import path from 'path';
import { AiController } from './aiController';

const router = Router();

// 動作確認用ヘルスチェック
router.get('/health', AiController.healthCheck);

// 履歴取得API (GET /api/ai/history, 最新20件)
router.get('/history', AiController.getHistory);

// 質問送信API (POST /api/ai/ask)
router.post('/ask', AiController.postAsk);

export const aiRouter = router;

// 画面表示用ルーター (/ai)
export const aiViewRouter = Router();
aiViewRouter.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'ai', 'index.html'));
});