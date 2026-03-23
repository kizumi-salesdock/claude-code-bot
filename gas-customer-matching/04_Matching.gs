/**
 * ============================================================
 * 顧客突合（名寄せ）モジュール
 * ============================================================
 *
 * カラーミーの顧客データとSalesforceの既存データを
 * Claude APIで比較し、同一人物の判定・ID紐付けを行います。
 */

/**
 * 顧客突合のメイン処理
 */
function runMatching() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var colormeSheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);
  var sfSheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);

  if (!colormeSheet || colormeSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('カラーミー顧客データがありません。');
    return;
  }
  if (!sfSheet || sfSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Salesforce顧客データがありません。');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '顧客突合（名寄せ）',
    'カラーミー顧客データとSalesforceデータの突合を実行しますか？\n' +
    'Claude APIを使用します（API費用が発生します）。',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  // ── データ読み込み ──
  var colormeHeaders = colormeSheet.getRange(1, 1, 1, colormeSheet.getLastColumn()).getValues()[0];
  var colormeData = colormeSheet.getRange(2, 1, colormeSheet.getLastRow() - 1, colormeSheet.getLastColumn()).getValues();

  var sfHeaders = sfSheet.getRange(1, 1, 1, sfSheet.getLastColumn()).getValues()[0];
  var sfData = sfSheet.getRange(2, 1, sfSheet.getLastRow() - 1, sfSheet.getLastColumn()).getValues();

  logOperation('突合開始', 'カラーミー: ' + colormeData.length + '件, SF: ' + sfData.length + '件');

  // ── Step 1: カラーミーIDで事前マッチング（API不要） ──
  var sfColormeIdIndex = sfHeaders.indexOf(SF_COLUMNS.COLORME_ID);
  var colormeIdIndex = colormeHeaders.indexOf(COLORME_COLUMNS.CUSTOMER_ID);

  var sfByColormeId = {};
  if (sfColormeIdIndex !== -1) {
    for (var i = 0; i < sfData.length; i++) {
      var cid = String(sfData[i][sfColormeIdIndex]).trim();
      if (cid) {
        sfByColormeId[cid] = i;
      }
    }
  }

  var results = [];
  var needApiMatching = [];

  for (var i = 0; i < colormeData.length; i++) {
    var colormeId = String(colormeData[i][colormeIdIndex]).trim();

    // カラーミーIDがSFに存在 → ID一致（処理不要）
    if (sfByColormeId[colormeId] !== undefined) {
      var sfIdx = sfByColormeId[colormeId];
      var sfIdColIndex = sfHeaders.indexOf(SF_COLUMNS.SF_ID);
      var sfNameColIndex = sfHeaders.indexOf(SF_COLUMNS.NAME);
      results.push({
        colormeId: colormeId,
        colormeName: getFieldValue(colormeData[i], colormeHeaders, COLORME_COLUMNS.NAME),
        sfId: sfIdColIndex !== -1 ? sfData[sfIdx][sfIdColIndex] : '',
        sfName: sfNameColIndex !== -1 ? sfData[sfIdx][sfNameColIndex] : '',
        matchType: MATCH_TYPES.ID_EXISTS,
        confidence: 'HIGH',
        reason: 'カラーミーIDが既にSalesforceに登録済み',
        action: '処理不要',
        status: STATUS.PROCESSED,
      });
    } else {
      needApiMatching.push({ index: i, data: colormeData[i] });
    }
  }

  logOperation('事前マッチング', 'ID一致: ' + results.length + '件, API突合対象: ' + needApiMatching.length + '件');

  // ── Step 2: Claude APIによる名寄せ ──
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
      logOperation('API突合エラー', 'バッチ ' + batchStart + ': ' + e.message);
      // エラー時は手動確認として記録
      for (var err = 0; err < batchItems.length; err++) {
        results.push({
          colormeId: getFieldValue(batchItems[err].data, colormeHeaders, COLORME_COLUMNS.CUSTOMER_ID),
          colormeName: getFieldValue(batchItems[err].data, colormeHeaders, COLORME_COLUMNS.NAME),
          sfId: '',
          sfName: '',
          matchType: MATCH_TYPES.UNCERTAIN,
          confidence: 'LOW',
          reason: 'APIエラーのため判定不可: ' + e.message,
          action: '要確認',
          status: STATUS.ALERT,
        });
      }
    }

    if (batchStart + batchSize < needApiMatching.length) {
      Utilities.sleep(1000);
    }
  }

  // ── 結果を書き出し ──
  writeMatchingResults(ss, results);
  writeAlerts(ss, results);

  var alertCount = results.filter(function(r) { return r.status === STATUS.ALERT; }).length;
  ui.alert(
    '突合完了',
    '処理件数: ' + results.length + '件\n' +
    'ID一致: ' + results.filter(function(r) { return r.matchType === MATCH_TYPES.ID_EXISTS; }).length + '件\n' +
    '同一人物（推定）: ' + results.filter(function(r) { return r.matchType === MATCH_TYPES.PROBABLE; }).length + '件\n' +
    '該当なし: ' + results.filter(function(r) { return r.matchType === MATCH_TYPES.NO_MATCH; }).length + '件\n' +
    '要確認（アラート）: ' + alertCount + '件'
  );
}

/**
 * ステータスを判定する
 */
function determineStatus(matchType, confidence) {
  if (matchType === MATCH_TYPES.ID_EXISTS) return STATUS.PROCESSED;
  if (matchType === MATCH_TYPES.UNCERTAIN) return STATUS.ALERT;
  if (matchType === MATCH_TYPES.PROBABLE && confidence === 'LOW') return STATUS.ALERT;
  if (matchType === MATCH_TYPES.NO_MATCH) return STATUS.PENDING;
  return STATUS.PENDING;
}

/**
 * ヘッダー名からフィールド値を取得するヘルパー
 */
function getFieldValue(row, headers, headerName) {
  var idx = headers.indexOf(headerName);
  return idx !== -1 ? String(row[idx]) : '';
}

/**
 * 突合結果を書き出す
 */
function writeMatchingResults(ss, results) {
  var sheet = ss.getSheetByName(SHEET_NAMES.MATCHING_RESULT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.MATCHING_RESULT);
  }
  sheet.clear();

  var resultHeaders = [
    RESULT_COLUMNS.COLORME_ID,
    RESULT_COLUMNS.COLORME_NAME,
    RESULT_COLUMNS.SF_ID,
    RESULT_COLUMNS.SF_NAME,
    RESULT_COLUMNS.MATCH_TYPE,
    RESULT_COLUMNS.CONFIDENCE,
    RESULT_COLUMNS.REASON,
    RESULT_COLUMNS.ACTION,
    RESULT_COLUMNS.STATUS,
  ];

  // ヘッダー設定
  var headerRange = sheet.getRange(1, 1, 1, resultHeaders.length);
  headerRange.setValues([resultHeaders]);
  headerRange.setBackground(COLORS.HEADER_BLUE);
  headerRange.setFontColor(COLORS.HEADER_TEXT);
  headerRange.setFontWeight('bold');

  // データ書き込み
  if (results.length > 0) {
    var dataRows = results.map(function(r) {
      return [
        r.colormeId, r.colormeName, r.sfId, r.sfName,
        r.matchType, r.confidence, r.reason, r.action, r.status,
      ];
    });
    sheet.getRange(2, 1, dataRows.length, resultHeaders.length).setValues(dataRows);

    // ステータスに応じて行の色を変更
    for (var i = 0; i < results.length; i++) {
      var rowRange = sheet.getRange(i + 2, 1, 1, resultHeaders.length);
      if (results[i].status === STATUS.ALERT) {
        rowRange.setBackground(COLORS.ALERT_RED);
      } else if (results[i].status === STATUS.PENDING) {
        rowRange.setBackground(COLORS.ALERT_YELLOW);
      } else if (results[i].status === STATUS.PROCESSED) {
        rowRange.setBackground(COLORS.PROCESSED_GREEN);
      }
    }
  }

  // 列幅自動調整
  for (var c = 1; c <= resultHeaders.length; c++) {
    sheet.autoResizeColumn(c);
  }

  logOperation('突合結果書き出し', results.length + '件');
}

/**
 * アラート（要確認）レコードを別シートに書き出す
 */
function writeAlerts(ss, results) {
  var alerts = results.filter(function(r) {
    return r.status === STATUS.ALERT;
  });

  var sheet = ss.getSheetByName(SHEET_NAMES.ALERTS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.ALERTS);
  }
  sheet.clear();

  var alertHeaders = [
    RESULT_COLUMNS.COLORME_ID,
    RESULT_COLUMNS.COLORME_NAME,
    RESULT_COLUMNS.SF_ID,
    RESULT_COLUMNS.SF_NAME,
    RESULT_COLUMNS.MATCH_TYPE,
    RESULT_COLUMNS.CONFIDENCE,
    RESULT_COLUMNS.REASON,
    '人間による判定',
    '対応メモ',
  ];

  var headerRange = sheet.getRange(1, 1, 1, alertHeaders.length);
  headerRange.setValues([alertHeaders]);
  headerRange.setBackground(COLORS.HEADER_BLUE);
  headerRange.setFontColor(COLORS.HEADER_TEXT);
  headerRange.setFontWeight('bold');

  if (alerts.length > 0) {
    var alertRows = alerts.map(function(a) {
      return [
        a.colormeId, a.colormeName, a.sfId, a.sfName,
        a.matchType, a.confidence, a.reason, '', '',
      ];
    });
    sheet.getRange(2, 1, alertRows.length, alertHeaders.length).setValues(alertRows);

    // アラート行を赤背景に
    sheet.getRange(2, 1, alertRows.length, alertHeaders.length).setBackground(COLORS.ALERT_RED);

    // 「人間による判定」列にドロップダウンを設定
    var judgmentCol = alertHeaders.indexOf('人間による判定') + 1;
    var validationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['同一人物', '別人', '要調査', 'メイン残す', 'サブ残す', '削除'], true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, judgmentCol, alertRows.length, 1).setDataValidation(validationRule);
  }

  for (var c = 1; c <= alertHeaders.length; c++) {
    sheet.autoResizeColumn(c);
  }

  logOperation('アラート書き出し', alerts.length + '件');
}

/**
 * アラート処理後に突合結果を反映する
 * ユーザーがアラートシートの「人間による判定」を入力した後に実行
 */
function applyAlertDecisions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var alertSheet = ss.getSheetByName(SHEET_NAMES.ALERTS);
  var resultSheet = ss.getSheetByName(SHEET_NAMES.MATCHING_RESULT);
  var sfSheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);
  var colormeSheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);

  if (!alertSheet || alertSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('アラートデータがありません。');
    return;
  }

  var alertHeaders = alertSheet.getRange(1, 1, 1, alertSheet.getLastColumn()).getValues()[0];
  var alertData = alertSheet.getRange(2, 1, alertSheet.getLastRow() - 1, alertSheet.getLastColumn()).getValues();

  var judgmentIdx = alertHeaders.indexOf('人間による判定');
  var memoIdx = alertHeaders.indexOf('対応メモ');
  var colormeIdIdx = alertHeaders.indexOf(RESULT_COLUMNS.COLORME_ID);
  var sfIdIdx = alertHeaders.indexOf(RESULT_COLUMNS.SF_ID);

  var deletedLog = [];
  var processedCount = 0;

  for (var i = 0; i < alertData.length; i++) {
    var judgment = alertData[i][judgmentIdx];
    if (!judgment) continue; // 未入力はスキップ

    var colormeId = String(alertData[i][colormeIdIdx]);
    var sfId = String(alertData[i][sfIdIdx]);

    switch (judgment) {
      case '同一人物':
      case 'メイン残す':
        // SFのカラーミーIDフィールドを更新（後でCSV出力時に反映）
        updateSfColormeId(sfSheet, sfId, colormeId);
        processedCount++;
        break;

      case '削除':
        // 削除ログに記録
        deletedLog.push({
          colormeId: colormeId,
          name: String(alertData[i][alertHeaders.indexOf(RESULT_COLUMNS.COLORME_NAME)]),
          sfId: sfId,
          sfName: String(alertData[i][alertHeaders.indexOf(RESULT_COLUMNS.SF_NAME)]),
          reason: judgment,
        });
        processedCount++;
        break;

      case '別人':
      case '要調査':
        processedCount++;
        break;
    }

    // アラートシートの背景色を処理済みに変更
    alertSheet.getRange(i + 2, 1, 1, alertHeaders.length).setBackground(COLORS.PROCESSED_GREEN);
  }

  // 削除ログの書き出し
  if (deletedLog.length > 0) {
    writeDeletedLog(ss, deletedLog);
  }

  SpreadsheetApp.getUi().alert(
    'アラート処理完了',
    '処理件数: ' + processedCount + '件\n' +
    '削除記録: ' + deletedLog.length + '件'
  );
}

/**
 * SFシートのカラーミーIDを更新する
 */
function updateSfColormeId(sfSheet, sfId, colormeId) {
  if (!sfSheet || !sfId) return;

  var sfHeaders = sfSheet.getRange(1, 1, 1, sfSheet.getLastColumn()).getValues()[0];
  var sfIdIdx = sfHeaders.indexOf(SF_COLUMNS.SF_ID);
  var colormeIdIdx = sfHeaders.indexOf(SF_COLUMNS.COLORME_ID);

  if (sfIdIdx === -1 || colormeIdIdx === -1) return;

  var data = sfSheet.getRange(2, 1, sfSheet.getLastRow() - 1, sfSheet.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][sfIdIdx]) === sfId) {
      sfSheet.getRange(i + 2, colormeIdIdx + 1).setValue(colormeId);
      break;
    }
  }
}

/**
 * 削除ログを書き出す
 */
function writeDeletedLog(ss, deletedLog) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DELETED_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.DELETED_LOG);
    var logHeaders = ['処理日時', 'カラーミー顧客ID', '顧客名', 'SF_ID', 'SF顧客名', '理由'];
    sheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    sheet.getRange(1, 1, 1, logHeaders.length).setBackground(COLORS.HEADER_BLUE);
    sheet.getRange(1, 1, 1, logHeaders.length).setFontColor(COLORS.HEADER_TEXT);
    sheet.getRange(1, 1, 1, logHeaders.length).setFontWeight('bold');
  }

  var lastRow = sheet.getLastRow();
  var now = new Date();
  var rows = deletedLog.map(function(d) {
    return [now, d.colormeId, d.name, d.sfId, d.sfName, d.reason];
  });
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);

  logOperation('削除ログ記録', deletedLog.length + '件');
}

/**
 * 市区郡(郵送先)をクリアする処理
 * IDがない場合にカラーミー顧客IDを転記した後に実行
 */
function clearShippingCity() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resultSheet = ss.getSheetByName(SHEET_NAMES.MATCHING_RESULT);
  var colormeSheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);

  if (!resultSheet || !colormeSheet) return;

  var resultHeaders = resultSheet.getRange(1, 1, 1, resultSheet.getLastColumn()).getValues()[0];
  var resultData = resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, resultSheet.getLastColumn()).getValues();

  var colormeHeaders = colormeSheet.getRange(1, 1, 1, colormeSheet.getLastColumn()).getValues()[0];
  var cityShipIdx = colormeHeaders.indexOf(COLORME_COLUMNS.CITY_SHIP);

  var matchTypeIdx = resultHeaders.indexOf(RESULT_COLUMNS.MATCH_TYPE);
  var colormeIdIdx = resultHeaders.indexOf(RESULT_COLUMNS.COLORME_ID);

  if (cityShipIdx === -1) return;

  // 「該当なし」のレコードの市区郡(郵送先)をクリア
  var colormeData = colormeSheet.getRange(2, 1, colormeSheet.getLastRow() - 1, colormeSheet.getLastColumn()).getValues();
  var colormeIdColIdx = colormeHeaders.indexOf(COLORME_COLUMNS.CUSTOMER_ID);

  var noMatchIds = {};
  for (var i = 0; i < resultData.length; i++) {
    if (resultData[i][matchTypeIdx] === MATCH_TYPES.NO_MATCH) {
      noMatchIds[String(resultData[i][colormeIdIdx])] = true;
    }
  }

  var clearCount = 0;
  for (var j = 0; j < colormeData.length; j++) {
    if (noMatchIds[String(colormeData[j][colormeIdColIdx])]) {
      colormeSheet.getRange(j + 2, cityShipIdx + 1).setValue('');
      clearCount++;
    }
  }

  logOperation('市区郡(郵送先)クリア', clearCount + '件');
}
