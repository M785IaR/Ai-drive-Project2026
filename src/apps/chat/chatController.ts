import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ChatModel } from './chatModel';

const DEFAULT_ROOM_ID = 'default';
const MAX_ROOM_MEMBERS = 5;

export class ChatController {
  static async renderChatPage(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const currentCount = await ChatModel.countActiveMembers(DEFAULT_ROOM_ID);
      const isFull = currentCount >= MAX_ROOM_MEMBERS;
      const memberToken = isFull ? '' : crypto.randomUUID();

      res.status(200).render('chat/index', {
        roomId: DEFAULT_ROOM_ID,
        isFull,
        memberToken,
        memberCount: currentCount,
        maxMembers: MAX_ROOM_MEMBERS,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMessages(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const rawToken = req.header('x-chat-member-token') || req.query.token;
      if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: '参加トークンが指定されていません。',
          },
        });
        return;
      }

      const isValid = await ChatModel.isValidMember(DEFAULT_ROOM_ID, rawToken.trim());
      if (!isValid) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN_NOT_JOINED',
            message: 'ルームに入室していないため履歴を閲覧できません。',
          },
        });
        return;
      }

      const items = await ChatModel.getRecentMessages(DEFAULT_ROOM_ID, 20);
      const memberCount = await ChatModel.countActiveMembers(DEFAULT_ROOM_ID);

      res.status(200).json({
        success: true,
        items,
        memberCount,
        maxMembers: MAX_ROOM_MEMBERS,
      });
    } catch (error) {
      next(error);
    }
  }
}