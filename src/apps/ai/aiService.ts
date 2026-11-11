import { AiModel, PublicAiQaLog } from './aiModel';

export class AiService {
  /**
   * 質問を受け付け、回答を生成（現在は模擬回答）し、DBに保存して結果を返す
   */
  static async askQuestion(prompt: string): Promise<PublicAiQaLog> {
    const startTime = Date.now();

    // 模擬回答の生成（将来の実API切り替え対象）
    const responseText = await this.generateAnswer(prompt);

    const responseTimeMs = Date.now() - startTime;

    // 本番共通のModelを使ってDBに記録
    const createdLog = await AiModel.createLog({
      prompt,
      responseText,
      status: 'DEMO', // ローカル模擬動作時のステータス
      responseTimeMs,
    });

    return createdLog;
  }

  /**
   * [模擬処理] 回答文字列を生成する
   * ※ 実API（Gemini API）実装時は、このメソッド内で SDK 呼出しを行います。
   */
  private static async generateAnswer(prompt: string): Promise<string> {
    // 接続確認用の模擬回答
    return `[接続確認用の模擬回答] お問い合わせありがとうございます。「${prompt}」について受け付けました。`;
  }
}