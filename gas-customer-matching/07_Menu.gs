/**
 * ============================================================
 * メニュー・初期設定モジュール
 * ============================================================
 *
 * スプレッドシートのカスタムメニューと初期セットアップを管理します。
 */

/**
 * スプレッドシートを開いたときにカスタムメニューを追加
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('顧客突合ツール')
    // ── CSVインポート ──
    .addSubMenu(
      ui.createMenu('1. CSVインポート')
        .addItem('カラーミー顧客CSVをインポート', 'importColormeCustomerCsv')
        .addItem('Salesforce顧客CSVをインポート', 'importSfCustomerCsv')
        .addItem('購買データCSVをインポート', 'importPurchaseCsv')
    )
    .addSeparator()

    // ── 顧客情報の整理 ──
    .addSubMenu(
      ui.createMenu('2. 顧客情報の整理')
        .addItem('データクレンジング実行', 'runCleansing')
        .addItem('顧客突合（名寄せ）実行', 'runMatching')
        .addItem('アラート処理結果を反映', 'applyAlertDecisions')
        .addItem('市区郡(郵送先)をクリア', 'clearShippingCity')
    )
    .addSeparator()

    // ── 購買情報の整理 ──
    .addSubMenu(
      ui.createMenu('3. 購買情報の整理')
        .addItem('購買データ突合実行', 'runPurchaseMatching')
    )
    .addSeparator()

    // ── CSVエクスポート ──
    .addSubMenu(
      ui.createMenu('4. CSVエクスポート')
        .addItem('クレンジング済み顧客CSVを出力', 'exportCleanedCustomerCsv')
        .addItem('処理済み購買データCSVを出力', 'exportPurchaseCsv')
        .addItem('SF顧客データ（ID付与済み）CSVを出力', 'exportSfCustomerCsv')
    )
    .addSeparator()

    // ── 一括実行 ──
    .addItem('全処理を一括実行（顧客）', 'runFullCustomerProcess')
    .addItem('全処理を一括実行（購買）', 'runFullPurchaseProcess')
    .addSeparator()

    // ── 設定・その他 ──
    .addSubMenu(
      ui.createMenu('設定')
        .addItem('APIキーを設定', 'setClaudeApiKey')
        .addItem('初期シートを作成', 'initializeSheets')
        .addItem('処理ログを表示', 'showOperationLog')
    )
    .addToUi();
}

/**
 * 初期シートを作成する
 */
function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheetNames = [
    SHEET_NAMES.COLORME_CUSTOMERS,
    SHEET_NAMES.SF_CUSTOMERS,
    SHEET_NAMES.MATCHING_RESULT,
    SHEET_NAMES.ALERTS,
    SHEET_NAMES.PURCHASE_DATA,
    SHEET_NAMES.PURCHASE_RESULT,
    SHEET_NAMES.DELETED_LOG,
    SHEET_NAMES.OPERATION_LOG,
  ];

  var created = 0;
  for (var i = 0; i < sheetNames.length; i++) {
    if (!ss.getSheetByName(sheetNames[i])) {
      ss.insertSheet(sheetNames[i]);
      created++;
    }
  }

  // 処理ログシートにヘッダーを設定
  var logSheet = ss.getSheetByName(SHEET_NAMES.OPERATION_LOG);
  if (logSheet.getLastRow() === 0) {
    var logHeaders = ['日時', '処理内容', '詳細'];
    logSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    logSheet.getRange(1, 1, 1, logHeaders.length).setBackground(COLORS.HEADER_BLUE);
    logSheet.getRange(1, 1, 1, logHeaders.length).setFontColor(COLORS.HEADER_TEXT);
    logSheet.getRange(1, 1, 1, logHeaders.length).setFontWeight('bold');
  }

  ui.alert('初期化完了', '作成されたシート数: ' + created);
}

/**
 * 操作ログを記録する
 * @param {string} operation - 処理内容
 * @param {string} detail - 詳細
 */
function logOperation(operation, detail) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(SHEET_NAMES.OPERATION_LOG);

  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_NAMES.OPERATION_LOG);
    logSheet.getRange(1, 1, 1, 3).setValues([['日時', '処理内容', '詳細']]);
    logSheet.getRange(1, 1, 1, 3).setBackground(COLORS.HEADER_BLUE);
    logSheet.getRange(1, 1, 1, 3).setFontColor(COLORS.HEADER_TEXT);
    logSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  var lastRow = logSheet.getLastRow();
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  logSheet.getRange(lastRow + 1, 1, 1, 3).setValues([[now, operation, detail]]);
}

/**
 * 処理ログを表示（アクティブシートに切り替え）
 */
function showOperationLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(SHEET_NAMES.OPERATION_LOG);
  if (logSheet) {
    ss.setActiveSheet(logSheet);
  } else {
    SpreadsheetApp.getUi().alert('処理ログがありません。');
  }
}

/**
 * 顧客関連の全処理を一括実行
 */
function runFullCustomerProcess() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '顧客処理 一括実行',
    '以下の処理を順番に実行します:\n\n' +
    '1. データクレンジング\n' +
    '2. 顧客突合（名寄せ）\n' +
    '3. ※アラート確認は手動で行ってください\n\n' +
    '実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  logOperation('一括処理開始', '顧客処理');

  try {
    // Step 1: クレンジング
    runCleansingAuto();

    // Step 2: 突合
    runMatchingAuto();

    logOperation('一括処理完了', '顧客処理（アラート確認待ち）');

    ui.alert(
      '一括処理完了',
      'クレンジングと突合が完了しました。\n\n' +
      '「アラート」シートを確認し、要確認レコードの判定を入力した後、\n' +
      '「顧客突合ツール > 顧客情報の整理 > アラート処理結果を反映」を実行してください。'
    );
  } catch (e) {
    logOperation('一括処理エラー', e.message);
    ui.alert('エラーが発生しました: ' + e.message);
  }
}

/**
 * 購買関連の全処理を一括実行
 */
function runFullPurchaseProcess() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '購買処理 一括実行',
    '購買データの突合処理を実行します。\n実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  logOperation('一括処理開始', '購買処理');

  try {
    runPurchaseMatchingAuto();
    logOperation('一括処理完了', '購買処理');
    ui.alert('購買処理が完了しました。');
  } catch (e) {
    logOperation('一括処理エラー', e.message);
    ui.alert('エラーが発生しました: ' + e.message);
  }
}

/**
 * 確認ダイアログなしのクレンジング（一括処理用）
 */
function runCleansingAuto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error('カラーミー顧客データがありません');
  }

  logOperation('クレンジング開始（自動）', 'データ件数: ' + (sheet.getLastRow() - 1));

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  var data = dataRange.getValues();

  var headerIndexMap = {};
  for (var i = 0; i < headers.length; i++) {
    headerIndexMap[headers[i]] = i;
  }

  // ローカルクレンジング
  for (var r = 0; r < data.length; r++) {
    var fieldMappings = [
      { col: COLORME_COLUMNS.NAME, type: 'name' },
      { col: COLORME_COLUMNS.NAME_KANA, type: 'kana' },
      { col: COLORME_COLUMNS.EMAIL, type: 'email' },
      { col: COLORME_COLUMNS.PHONE, type: 'phone' },
      { col: COLORME_COLUMNS.GENDER, type: 'gender' },
      { col: COLORME_COLUMNS.ZIPCODE, type: 'zipcode' },
      { col: COLORME_COLUMNS.CITY, type: 'city' },
      { col: COLORME_COLUMNS.ADDRESS, type: 'address' },
      { col: COLORME_COLUMNS.BUILDING, type: 'building' },
    ];

    for (var f = 0; f < fieldMappings.length; f++) {
      var idx = headerIndexMap[fieldMappings[f].col];
      if (idx !== undefined && data[r][idx]) {
        data[r][idx] = localCleanse(String(data[r][idx]), fieldMappings[f].type);
      }
    }
  }

  dataRange.setValues(data);

  // API クレンジング
  var batchSize = CLAUDE_CONFIG.BATCH_SIZE;
  for (var batchStart = 0; batchStart < data.length; batchStart += batchSize) {
    var batchEnd = Math.min(batchStart + batchSize, data.length);
    var batch = data.slice(batchStart, batchEnd);

    try {
      var jsonData = formatCustomerDataForCleansing(batch, headers);
      var prompt = '以下の顧客データをクレンジングしてください。特に建物名に番地が含まれていないか注意してください。\n\n' + jsonData;
      var response = callClaudeAPI(getCleansingSystemPrompt(), prompt);
      var cleansedData = extractJsonFromResponse(response);

      for (var c = 0; c < cleansedData.length; c++) {
        var rowIndex = batchStart + c;
        if (rowIndex >= data.length) break;
        for (var h = 0; h < headers.length; h++) {
          if (cleansedData[c][headers[h]] !== undefined) {
            data[rowIndex][h] = cleansedData[c][headers[h]];
          }
        }
      }
    } catch (e) {
      logOperation('APIクレンジングエラー（自動）', e.message);
    }

    if (batchStart + batchSize < data.length) Utilities.sleep(1000);
  }

  dataRange.setValues(data);
  logOperation('クレンジング完了（自動）', '処理完了');
}

/**
 * 確認ダイアログなしの突合（一括処理用）
 */
function runMatchingAuto() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var colormeSheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);
  var sfSheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);

  if (!colormeSheet || colormeSheet.getLastRow() < 2) {
    throw new Error('カラーミー顧客データがありません');
  }
  if (!sfSheet || sfSheet.getLastRow() < 2) {
    throw new Error('Salesforce顧客データがありません');
  }

  var colormeHeaders = colormeSheet.getRange(1, 1, 1, colormeSheet.getLastColumn()).getValues()[0];
  var colormeData = colormeSheet.getRange(2, 1, colormeSheet.getLastRow() - 1, colormeSheet.getLastColumn()).getValues();
  var sfHeaders = sfSheet.getRange(1, 1, 1, sfSheet.getLastColumn()).getValues()[0];
  var sfData = sfSheet.getRange(2, 1, sfSheet.getLastRow() - 1, sfSheet.getLastColumn()).getValues();

  var sfColormeIdIndex = sfHeaders.indexOf(SF_COLUMNS.COLORME_ID);
  var colormeIdIndex = colormeHeaders.indexOf(COLORME_COLUMNS.CUSTOMER_ID);

  var sfByColormeId = {};
  if (sfColormeIdIndex !== -1) {
    for (var i = 0; i < sfData.length; i++) {
      var cid = String(sfData[i][sfColormeIdIndex]).trim();
      if (cid) sfByColormeId[cid] = i;
    }
  }

  var results = [];
  var needApiMatching = [];

  for (var i = 0; i < colormeData.length; i++) {
    var colormeId = String(colormeData[i][colormeIdIndex]).trim();
    if (sfByColormeId[colormeId] !== undefined) {
      var sfIdx = sfByColormeId[colormeId];
      results.push({
        colormeId: colormeId,
        colormeName: getFieldValue(colormeData[i], colormeHeaders, COLORME_COLUMNS.NAME),
        sfId: getFieldValue(sfData[sfIdx], sfHeaders, SF_COLUMNS.SF_ID),
        sfName: getFieldValue(sfData[sfIdx], sfHeaders, SF_COLUMNS.NAME),
        matchType: MATCH_TYPES.ID_EXISTS,
        confidence: 'HIGH',
        reason: 'カラーミーIDが既に登録済み',
        action: '処理不要',
        status: STATUS.PROCESSED,
      });
    } else {
      needApiMatching.push({ index: i, data: colormeData[i] });
    }
  }

  var batchSize = CLAUDE_CONFIG.BATCH_SIZE;
  for (var batchStart = 0; batchStart < needApiMatching.length; batchStart += batchSize) {
    var batchEnd = Math.min(batchStart + batchSize, needApiMatching.length);
    var batchItems = needApiMatching.slice(batchStart, batchEnd);
    var batchColormeData = batchItems.map(function(item) { return item.data; });

    try {
      var prompt = formatDataForMatching(batchColormeData, sfData, colormeHeaders, sfHeaders);
      var response = callClaudeAPI(getMatchingSystemPrompt(), prompt);
      var matchResults = extractJsonFromResponse(response);

      for (var m = 0; m < matchResults.length; m++) {
        var mr = matchResults[m];
        results.push({
          colormeId: mr['カラーミー顧客ID'] || '',
          colormeName: mr['カラーミー顧客名'] || '',
          sfId: mr['SF_ID'] || '',
          sfName: mr['SF顧客名'] || '',
          matchType: mr['判定'] || MATCH_TYPES.NO_MATCH,
          confidence: mr['確信度'] || 'LOW',
          reason: mr['判定理由'] || '',
          action: mr['推奨アクション'] || '',
          status: determineStatus(mr['判定'], mr['確信度']),
        });
      }
    } catch (e) {
      logOperation('API突合エラー（自動）', e.message);
      for (var err = 0; err < batchItems.length; err++) {
        results.push({
          colormeId: getFieldValue(batchItems[err].data, colormeHeaders, COLORME_COLUMNS.CUSTOMER_ID),
          colormeName: getFieldValue(batchItems[err].data, colormeHeaders, COLORME_COLUMNS.NAME),
          sfId: '', sfName: '',
          matchType: MATCH_TYPES.UNCERTAIN,
          confidence: 'LOW',
          reason: 'APIエラー: ' + e.message,
          action: '要確認',
          status: STATUS.ALERT,
        });
      }
    }

    if (batchStart + batchSize < needApiMatching.length) Utilities.sleep(1000);
  }

  writeMatchingResults(ss, results);
  writeAlerts(ss, results);
}

/**
 * 確認ダイアログなしの購買突合（一括処理用）
 */
function runPurchaseMatchingAuto() {
  // runPurchaseMatching の確認ダイアログなし版
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var purchaseSheet = ss.getSheetByName(SHEET_NAMES.PURCHASE_DATA);
  var sfSheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);

  if (!purchaseSheet || purchaseSheet.getLastRow() < 2) {
    throw new Error('購買データがありません');
  }

  var purchaseHeaders = purchaseSheet.getRange(1, 1, 1, purchaseSheet.getLastColumn()).getValues()[0];
  var purchaseData = purchaseSheet.getRange(2, 1, purchaseSheet.getLastRow() - 1, purchaseSheet.getLastColumn()).getValues();

  purchaseData = removePreviouslyProcessed(purchaseSheet, purchaseHeaders, purchaseData);

  var sfHeaders = sfSheet.getRange(1, 1, 1, sfSheet.getLastColumn()).getValues()[0];
  var sfData = sfSheet.getRange(2, 1, sfSheet.getLastRow() - 1, sfSheet.getLastColumn()).getValues();
  var sfMainIdMap = buildSfMainIdMap(sfHeaders, sfData);
  var deletedIdMap = buildDeletedIdMap(ss);

  var customerIdIdx = purchaseHeaders.indexOf(PURCHASE_COLUMNS.CUSTOMER_ID);
  var purchaseResults = [];

  for (var i = 0; i < purchaseData.length; i++) {
    var originalId = String(purchaseData[i][customerIdIdx]).trim();
    var newId = originalId;
    var changeReason = '';

    if (deletedIdMap[originalId]) {
      newId = deletedIdMap[originalId].mainId;
      changeReason = '削除済み → メインID';
    } else if (!sfMainIdMap[originalId]) {
      var mainId = findMainIdForSub(originalId, sfHeaders, sfData);
      if (mainId) {
        newId = mainId;
        changeReason = 'サブID → メインID';
      }
    }

    if (newId !== originalId) {
      purchaseData[i][customerIdIdx] = newId;
    }

    purchaseResults.push({
      orderId: getFieldValue(purchaseData[i], purchaseHeaders, PURCHASE_COLUMNS.ORDER_ID),
      originalId: originalId,
      newId: newId,
      changeReason: changeReason,
    });
  }

  if (purchaseData.length > 0) {
    purchaseSheet.getRange(2, 1, purchaseData.length, purchaseHeaders.length).setValues(purchaseData);
  }

  writePurchaseResults(ss, purchaseResults);
}
