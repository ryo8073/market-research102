export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>プライバシーポリシー</h1>
      <p className="text-sm text-muted-foreground">最終更新: 2026年8月</p>

      <h2>1. 収集する情報</h2>
      <p>本ツールでは、サービス品質の維持と不正利用の防止のため、以下の情報を収集します。</p>
      <ul>
        <li><strong>利用ログ</strong>: アクセス時刻、利用した機能（AI分析・経済圏計算等）、処理時間</li>
        <li><strong>セッション情報</strong>: 匿名化されたセッションID（ランダム生成、個人を特定しない）</li>
        <li><strong>IPアドレスのハッシュ</strong>: IPアドレスのSHA-256ハッシュの先頭8文字のみ保存。生のIPアドレスは保存しません</li>
      </ul>

      <h2>2. 収集しない情報</h2>
      <ul>
        <li>氏名、住所、電話番号、メールアドレス</li>
        <li>物件の具体的な住所や価格</li>
        <li>Proformerのログイン情報（トークンは検証後に破棄）</li>
      </ul>

      <h2>3. 利用目的</h2>
      <ul>
        <li>サービスの安定運用とパフォーマンス監視</li>
        <li>不正利用（API濫用等）の検知と防止</li>
        <li>利用統計の集計（個人を特定しない形で）</li>
      </ul>

      <h2>4. データの保存</h2>
      <p>利用ログはVercel KV（Upstash Redis）に保存され、90日後に自動削除されます。日本国内（東京リージョン）のサーバーで処理されます。</p>

      <h2>5. 第三者提供</h2>
      <p>収集した情報は、法令に基づく場合を除き、第三者に提供しません。</p>

      <h2>6. Cookie</h2>
      <p>認証のためにセッションCookie（<code>ci102_session</code>）を使用します。HttpOnly・Secure・SameSite=Lax属性で保護されており、7日間有効です。</p>

      <h2>7. お問い合わせ</h2>
      <p>本ポリシーに関するお問い合わせは、Proformerサポートまでご連絡ください。</p>

      <p className="mt-8"><a href="/" className="text-blue-600 hover:underline">← ダッシュボードに戻る</a></p>
    </main>
  );
}
