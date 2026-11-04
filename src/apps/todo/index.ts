import express from 'express';
import path from 'path';
import { pool } from '../../../db'; // db.tsが直下の場合: '../db'
import todoRouter from './todoRouter';

const app = express();

// --- EJS テンプレートエンジンの設定 ---
app.set('views', path.join(__dirname, '../views'));
app.set('view engine', 'ejs');

// --- 静的ファイル (public フォルダ) の配信設定 ---
app.use(express.static(path.join(__dirname, '../public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 既存ルート (変更しない) ---
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

app.get('/api/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database connection error' });
  }
});

// --- Todo 機能ルートの登録 ---
app.use('/', todoRouter);

export default app;