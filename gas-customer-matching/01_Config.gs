/**
 * ============================================================
 * 設定ファイル - カラーミー × Salesforce 顧客データ突合システム
 * ============================================================
 *
 * このファイルでは、システム全体で使用する定数・設定を管理します。
 * 初回セットアップ時に CLAUDE_API_KEY をスクリプトプロパティに設定してください。
 */

// ── シート名定義 ──
var SHEET_NAMES = {
  COLORME_CUSTOMERS: 'カラーミー顧客',       // カラーミーからインポートした顧客データ
  SF_CUSTOMERS: 'SF顧客',                    // Salesforceからインポートした顧客データ
  MATCHING_RESULT: '突合結果',                // AI突合の結果表示
  ALERTS: 'アラート',                         // 要確認レコード
  PURCHASE_DATA: '購買データ',                // sales_all.csv のデータ
  PURCHASE_RESULT: '購買突合結果',            // 購買データ突合結果
  DELETED_LOG: '削除ログ',                    // 削除した顧客の名前・IDログ
  OPERATION_LOG: '処理ログ',                  // 操作ログ
};

// ── カラーミー顧客CSVのカラム定義 ──
var COLORME_COLUMNS = {
  CUSTOMER_ID: 'カラーミー顧客ID',
  NAME: '顧客名',
  NAME_KANA: 'フリガナ',
  EMAIL: 'メールアドレス',
  PHONE: '電話番号',
  BIRTHDAY: '生年月日',
  GENDER: '性別',
  ZIPCODE: '郵便番号',
  PREFECTURE: '都道府県',
  CITY: '市区町村',
  ADDRESS: '番地',
  BUILDING: '建物名',
  ZIPCODE_SHIP: '郵便番号(郵送先)',
  PREFECTURE_SHIP: '都道府県(郵送先)',
  CITY_SHIP: '市区町村(郵送先)',
  ADDRESS_SHIP: '番地(郵送先)',
  BUILDING_SHIP: '建物名(郵送先)',
  REGISTERED: 'ユーザー登録有無',
};

// ── Salesforce顧客のカラム定義 ──
var SF_COLUMNS = {
  SF_ID: 'SF_ID',
  COLORME_ID: 'カラーミー顧客ID',
  NAME: '顧客名',
  NAME_KANA: 'フリガナ',
  EMAIL: 'メールアドレス',
  PHONE: '電話番号',
  BIRTHDAY: '生年月日',
  GENDER: '性別',
  ZIPCODE: '郵便番号',
  PREFECTURE: '都道府県',
  CITY: '市区町村',
  ADDRESS: '番地',
  BUILDING: '建物名',
  SUB_FLAG: 'サブフラグ',
  PURCHASE_COUNT: '購買回数',
};

// ── 購買データCSVのカラム定義 ──
var PURCHASE_COLUMNS = {
  ORDER_ID: '受注ID',
  ORDER_DATE: '受注日',
  CUSTOMER_ID: 'カラーミー顧客ID',
  CUSTOMER_NAME: '顧客名',
  AMOUNT: '金額',
};

// ── 突合結果のカラム定義 ──
var RESULT_COLUMNS = {
  COLORME_ID: 'カラーミー顧客ID',
  COLORME_NAME: 'カラーミー顧客名',
  SF_ID: 'SF_ID',
  SF_NAME: 'SF顧客名',
  MATCH_TYPE: '判定',
  CONFIDENCE: '確信度',
  REASON: '判定理由',
  ACTION: '処理内容',
  STATUS: 'ステータス',
};

// ── 判定タイプ ──
var MATCH_TYPES = {
  EXACT: '完全一致',
  PROBABLE: '同一人物（推定）',
  UNCERTAIN: '不明（要確認）',
  NO_MATCH: '該当なし',
  ID_EXISTS: 'ID一致（処理不要）',
};

// ── ステータス ──
var STATUS = {
  PENDING: '未処理',
  PROCESSED: '処理済',
  ALERT: '要確認',
  SKIPPED: 'スキップ',
};

// ── 色定義（アラート用） ──
var COLORS = {
  ALERT_RED: '#FFCCCC',      // 要確認（赤系）
  ALERT_YELLOW: '#FFFFCC',   // 注意（黄系）
  PROCESSED_GREEN: '#CCFFCC', // 処理済（緑系）
  HEADER_BLUE: '#4472C4',     // ヘッダー背景
  HEADER_TEXT: '#FFFFFF',      // ヘッダー文字色
};

// ── Claude API設定 ──
var CLAUDE_CONFIG = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  MODEL: 'claude-haiku-4-5',  // コスト最適化のためHaikuを使用（1日10件程度）
  MAX_TOKENS: 4096,
  API_VERSION: '2023-06-01',
  // バッチサイズ：1回のAPI呼び出しで突合する顧客数
  BATCH_SIZE: 5,
};

/**
 * Claude APIキーを取得する
 * スクリプトプロパティから安全に取得
 */
function getClaudeApiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!key) {
    throw new Error(
      'Claude APIキーが設定されていません。\n' +
      'メニュー「顧客突合ツール > 初期設定 > APIキーを設定」から設定してください。'
    );
  }
  return key;
}

/**
 * Claude APIキーを設定する
 */
function setClaudeApiKey() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Claude APIキー設定',
    'Anthropic APIキーを入力してください（sk-ant-...）:',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    var key = result.getResponseText().trim();
    if (key.startsWith('sk-ant-')) {
      PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', key);
      ui.alert('APIキーを設定しました。');
    } else {
      ui.alert('無効なAPIキーです。sk-ant- で始まるキーを入力してください。');
    }
  }
}
