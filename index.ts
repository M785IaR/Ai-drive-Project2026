import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { pool } from './db'; // db.tsで作成したNeonへの接続を利用
import todoRouter from './src/apps/todo/todoRouter'; // Todo用ルーター
import { aiRouter, aiViewRouter } from './src/apps/ai/aiRouter';
import { aiV2Router } from './src/apps/ai/v2/aiV2Router';
const app = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// ------------------------------
// Expressの基本設定
// ------------------------------
app.use(express.json()); // JSONデータを受け取れるように設定
app.use(express.urlencoded({ extended: true })); // フォームデータを受け取れるように設定
app.use(express.static(path.join(process.cwd(), 'public'))); // 静的ファイルの公開
app.set('view engine', 'ejs'); // EJSの設定
app.set('views', path.join(process.cwd(), 'views'));

// ------------------------------
// 既存のルーティング
// ------------------------------

// TOPページ
app.get('/', (req: Request, res: Response): void => {
  res.render('index');
});

// Neon DB 接続確認API
app.get('/api/db-check', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT 1 AS connection_test');
    res.json({
      status: 'ok',
      database: result.rows[0].connection_test === 1 ? 'connected' : 'error',
    });
  } catch (error) {
    console.error('DB接続確認に失敗しました', error);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

// DBサンプルページ
type Product = { id: number; name: string; price: number };
app.get('/db-sample', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query<Product>(
      'SELECT id, name, price FROM products ORDER BY id'
    );
    res.render('db-sample', { products: result.rows });
  } catch (error) {
    console.error('商品一覧の取得に失敗しました', error);
    res.status(503).send('商品一覧を表示できません');
  }
});

// Todo機能のルート
app.use('/', todoRouter);

// ------------------------------
// 新規追加：AI機能のルーティング
// ------------------------------
app.use('/ai', aiViewRouter);
app.get(['/ai/v2', '/ai/v2/'], (_req: Request, res: Response) => {
  res.sendFile(path.join(process.cwd(), 'public', 'ai', 'v2', 'index.html'));
});
app.use('/api/ai', aiRouter);
app.use('/api/ai/v2', aiV2Router);

// ------------------------------
// エラーハンドリング
// ------------------------------

// 汎用404ハンドラー（どのルートにもマッチしなかった場合）
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'リクエストされたリソースが見つかりません。',
    },
  });
});

// グローバルエラーハンドラー
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Global Error Handler]:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'サーバー内部でエラーが発生しました。',
    },
  });
});

// ------------------------------
// サーバー起動
// ------------------------------
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, (): void => {
    console.log(`Server started: http://localhost:${port}`);
  });
}

export default app;