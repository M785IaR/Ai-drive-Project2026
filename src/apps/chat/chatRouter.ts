import { Router } from 'express';
import { ChatController } from './chatController';

export const chatViewRouter = Router();
chatViewRouter.get('/', ChatController.renderChatPage);

export const chatApiRouter = Router();
chatApiRouter.get('/messages', ChatController.getMessages);