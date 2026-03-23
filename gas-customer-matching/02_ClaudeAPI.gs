/**
 * ============================================================
 * Claude API連携モジュール
 * ============================================================
 *
 * Anthropic Claude APIとの通信を管理します。
 * データクレンジングと顧客突合のプロンプト生成・実行を行います。
 */

/**
 * Claude APIにリクエストを送信する
 * @param {string} systemPrompt - システムプロンプト
 * @param {string} userMessage - ユーザーメッセージ
 * @return {string} Claudeからの応答テキスト
 */
function callClaudeAPI(systemPrompt, userMessage) {
  var apiKey = getClaudeApiKey();

  var payload = {
    model: CLAUDE_CONFIG.MODEL,
    max_tokens: CLAUDE_CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage }
    ]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_CONFIG.API_VERSION,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var maxRetries = 3;
  var retryDelay = 2000;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      var response = UrlFetchApp.fetch(CLAUDE_CONFIG.API_URL, options);
      var statusCode = response.getResponseCode();

      if (statusCode === 200) {
        var json = JSON.parse(response.getContentText());
        for (var i = 0; i < json.content.length; i++) {
          if (json.content[i].type === 'text') {
            return json.content[i].text;
          }
        }
        throw new Error('レスポンスにテキストブロックがありませんでした');
      }

      if (statusCode === 429 || statusCode >= 500) {
        logOperation('API再試行', 'ステータス: ' + statusCode + ', 試行: ' + (attempt + 1));
        if (attempt < maxRetries - 1) {
          Utilities.sleep(retryDelay * Math.pow(2, attempt));
          continue;
        }
      }

      var errorBody = response.getContentText();
      throw new Error('Claude API エラー (HTTP ' + statusCode + '): ' + errorBody);
    } catch (e) {
      if (e.message.indexOf('Claude API エラー') !== -1) throw e;
      if (attempt < maxRetries - 1) {
        Utilities.sleep(retryDelay * Math.pow(2, attempt));
        continue;
      }
      throw new Error('Claude API 接続エラー: ' + e.message);
    }
  }
}

/**
 * データクレンジング用のシステムプロンプト
 */
function getCleansingSystemPrompt() {
  return [
    'あなたは日本の顧客データクレンジングの専門家です。',
    '以下のルールに従って、顧客データを正確にクレンジングしてください。',
    '',
    '【クレンジングルール】',
    '1. 顧客名・フリガナ: 姓と名の間のスペース（全角・半角）を削除する',
    '2. 市区町村・番地: 不要なスペースを削除する',
    '3. 建物名: 番地が含まれている場合は「市区町村・番地」フィールドに転記し、建物名からは削除する',
    '4. 建物名のスペース: 半角スペースはアンダーバー「_」に変換する',
    '5. 性別: 「未回答」の場合は「選択しない」に変更する',
    '6. 全角英数字 → 半角英数字に統一する',
    '7. 半角カタカナ → 全角カタカナに統一する',
    '8. 電話番号: ハイフンなしに統一する（例: 09012345678）',
    '9. 郵便番号: ハイフンなしの7桁に統一する（例: 1234567）',
    '',
    '【出力形式】',
    '必ず以下のJSON形式で出力してください。説明文は不要です。',
    '```json',
    '[',
    '  {',
    '    "カラーミー顧客ID": "元のID",',
    '    "顧客名": "クレンジング後",',
    '    "フリガナ": "クレンジング後",',
    '    "メールアドレス": "そのまま",',
    '    "電話番号": "クレンジング後",',
    '    "生年月日": "そのまま",',
    '    "性別": "クレンジング後",',
    '    "郵便番号": "クレンジング後",',
    '    "都道府県": "そのまま",',
    '    "市区町村": "クレンジング後",',
    '    "番地": "クレンジング後",',
    '    "建物名": "クレンジング後",',
    '    "変更点": ["変更1", "変更2"]',
    '  }',
    ']',
    '```',
  ].join('\n');
}

/**
 * 顧客突合用のシステムプロンプト
 */
function getMatchingSystemPrompt() {
  return [
    'あなたは日本の顧客データベースの名寄せ（顧客突合）の専門家です。',
    '新規の顧客データと既存のSalesforceデータを比較し、同一人物かどうかを判定してください。',
    '',
    '【判定基準】',
    '1. 完全一致: カラーミーIDが既にSalesforceに登録されている場合',
    '2. 同一人物（推定）: 以下の条件を複数満たす場合',
    '   - メールアドレスが一致',
    '   - 氏名が一致（表記揺れを考慮: 漢字/ひらがな/カタカナの違い）',
    '   - 生年月日が一致',
    '   - 住所が一致（番地レベル）',
    '   - 電話番号が一致',
    '3. 不明（要確認）: 一部の情報が一致するが確証が持てない場合',
    '   例: 名前は一致するが住所が異なる、など',
    '4. 該当なし: 既存データに同一人物が見つからない場合',
    '',
    '【表記揺れの考慮】',
    '- 姓名の順序違い',
    '- 漢字・ひらがな・カタカナの混在（例: 山田太郎 = ヤマダタロウ）',
    '- 旧字体と新字体（例: 渡邉 = 渡辺 = 渡邊）',
    '- 住所の表記揺れ（例: 1-2-3 = 1丁目2番地3号）',
    '- 電話番号のハイフン有無',
    '',
    '【確信度】',
    '- HIGH: ほぼ確実に同一人物（メール一致+名前一致など、複数の強い一致）',
    '- MEDIUM: 同一人物の可能性が高い（名前と住所が一致など）',
    '- LOW: 一部一致するが確証なし（要人間確認）',
    '',
    '【出力形式】',
    '必ず以下のJSON形式で出力してください。説明文は不要です。',
    '```json',
    '[',
    '  {',
    '    "カラーミー顧客ID": "対象のカラーミーID",',
    '    "カラーミー顧客名": "対象の顧客名",',
    '    "判定": "完全一致|同一人物（推定）|不明（要確認）|該当なし",',
    '    "確信度": "HIGH|MEDIUM|LOW",',
    '    "SF_ID": "一致したSFのID（なければ空文字）",',
    '    "SF顧客名": "一致したSFの顧客名（なければ空文字）",',
    '    "判定理由": "判定の根拠を簡潔に説明",',
    '    "推奨アクション": "処理不要|SF既存データにカラーミーID付与|新規登録|要確認"',
    '  }',
    ']',
    '```',
  ].join('\n');
}

/**
 * 購買データ突合用のシステムプロンプト
 */
function getPurchaseMatchingSystemPrompt() {
  return [
    'あなたは顧客購買データの照合専門家です。',
    '購買データの顧客IDが、Salesforceのメイン顧客IDと一致しているか確認してください。',
    '',
    '【処理ルール】',
    '1. 購買データの顧客IDがSFのメイン顧客IDと一致 → 処理不要',
    '2. 一致しない場合 → メイン顧客IDに書き換え提案',
    '3. 削除済み顧客リストにある場合 → 対応するメインIDに書き換え提案',
    '4. SFに該当なし → 処理不要（そのまま）',
    '',
    '【出力形式】',
    '必ず以下のJSON形式で出力してください。',
    '```json',
    '[',
    '  {',
    '    "受注ID": "元の受注ID",',
    '    "元カラーミー顧客ID": "元のID",',
    '    "新カラーミー顧客ID": "書き換え後のID（変更なしなら元と同じ）",',
    '    "変更理由": "変更理由（変更なしなら空文字）"',
    '  }',
    ']',
    '```',
  ].join('\n');
}

/**
 * クレンジング対象データをJSON文字列に変換
 * @param {Array} rows - 顧客データの行配列
 * @param {Array} headers - ヘッダー配列
 * @return {string} JSON文字列
 */
function formatCustomerDataForCleansing(rows, headers) {
  var customers = [];
  for (var i = 0; i < rows.length; i++) {
    var customer = {};
    for (var j = 0; j < headers.length; j++) {
      customer[headers[j]] = rows[i][j] || '';
    }
    customers.push(customer);
  }
  return JSON.stringify(customers, null, 2);
}

/**
 * 突合対象データをJSON文字列に変換
 * @param {Array} colormeCustomers - カラーミー顧客データ
 * @param {Array} sfCustomers - SF顧客データ
 * @param {Array} colormeHeaders - カラーミーヘッダー
 * @param {Array} sfHeaders - SFヘッダー
 * @return {string} プロンプト用テキスト
 */
function formatDataForMatching(colormeCustomers, sfCustomers, colormeHeaders, sfHeaders) {
  var colormeList = [];
  for (var i = 0; i < colormeCustomers.length; i++) {
    var c = {};
    for (var j = 0; j < colormeHeaders.length; j++) {
      c[colormeHeaders[j]] = colormeCustomers[i][j] || '';
    }
    colormeList.push(c);
  }

  var sfList = [];
  for (var i = 0; i < sfCustomers.length; i++) {
    var s = {};
    for (var j = 0; j < sfHeaders.length; j++) {
      s[sfHeaders[j]] = sfCustomers[i][j] || '';
    }
    sfList.push(s);
  }

  return [
    '【新規カラーミー顧客データ】',
    JSON.stringify(colormeList, null, 2),
    '',
    '【既存Salesforce顧客データ】',
    JSON.stringify(sfList, null, 2),
  ].join('\n');
}

/**
 * Claude APIレスポンスからJSONを抽出する
 * @param {string} responseText - Claudeのレスポンステキスト
 * @return {Array} パースされたJSON配列
 */
function extractJsonFromResponse(responseText) {
  // ```json ... ``` ブロックを探す
  var jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]);
  }

  // JSONブロックがない場合、直接パースを試みる
  var trimmed = responseText.trim();
  if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
    var parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  throw new Error('Claude APIのレスポンスからJSONを抽出できませんでした:\n' + responseText.substring(0, 200));
}
