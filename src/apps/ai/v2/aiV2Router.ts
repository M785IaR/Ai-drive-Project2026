import express, { Router } from 'express';
import { AiV2Controller } from './aiV2Controller';

const router = Router();

// V2 API 全ルートに公開停止ガード（503）を先頭適用
router.use(AiV2Controller.demoGuard);

// 会話一覧の取得 (GET /api/ai/v2/conversations)
router.get('/conversations', AiV2Controller.listConversations);

// 新規会話の作成 (POST /api/ai/v2/conversations)
router.post(
  '/conversations',
  AiV2Controller.payloadSizeGuard,
  express.json({ limit: '16kb' }),
  AiV2Controller.createConversation
);

// 指定会話の履歴取得 (GET /api/ai/v2/conversations/:id/turns)
router.get('/conversations/:id/turns', AiV2Controller.getConversationTurns);

// 指定会話への質問送信・保存 (POST /api/ai/v2/conversations/:id/turns)
router.post(
  '/conversations/:id/turns',
  AiV2Controller.payloadSizeGuard,
  express.json({ limit: '16kb' }),
  AiV2Controller.postConversationTurn
);

export const aiV2Router = router;