import { Router } from 'express';
import { AiController } from './aiController';

const router = Router();

// 動作確認用ヘルスチェック
router.get('/health', AiController.healthCheck);

// 履歴取得API (GET /api/ai/history, 最新20件)
router.get('/history', AiController.getHistory);

export const aiRouter = router;