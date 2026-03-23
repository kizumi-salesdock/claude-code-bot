/**
 * ============================================================
 * 購買データ突合モジュール
 * ============================================================
 *
 * sales_all.csv の購買データに対して:
 * - 前日処理分の削除
 * - 顧客IDのメインID照合・書き換え
 * - 削除ログのIDを使った書き換え
 */

/**
 * 購買データの突合処理メイン
 */
function runPurchaseMatching() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var purchaseSheet = ss.getSheetByName(SHEET_NAMES.PURCHASE_DATA);
  var sfSheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);

  if (!purchaseSheet || purchaseSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('購買データがありません。\nまず「CSVインポート > 購買データCSVをインポート」を実行してください。');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '購買データ突合',
    '購買データの顧客ID照合を実行しますか？',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var purchaseHeaders = purchaseSheet.getRange(1, 1, 1, purchaseSheet.getLastColumn()).getValues()[0];
  var purchaseData = purchaseSheet.getRange(2, 1, purchaseSheet.getLastRow() - 1, purchaseSheet.getLastColumn()).getValues();

  logOperation('購買突合開始', '購買データ: ' + purchaseData.length + '件');

  // ── Step 1: 前日処理分を削除 ──
  purchaseData = removePreviouslyProcessed(purchaseSheet, purchaseHeaders, purchaseData);

  // ── Step 2: SF顧客データ読み込み ──
  var sfHeaders = sfSheet.getRange(1, 1, 1, sfSheet.getLastColumn()).getValues()[0];
  var sfData = sfSheet.getRange(2, 1, sfSheet.getLastRow() - 1, sfSheet.getLastColumn()).getValues();

  // SFのメイン顧客IDマップを構築
  var sfMainIdMap = buildSfMainIdMap(sfHeaders, sfData);

  // ── Step 3: 削除ログの読み込み ──
  var deletedIdMap = buildDeletedIdMap(ss);

  // ── Step 4: 購買データの顧客IDを照合 ──
  var customerIdIdx = purchaseHeaders.indexOf(PURCHASE_COLUMNS.CUSTOMER_ID);
  var customerNameIdx = purchaseHeaders.indexOf(PURCHASE_COLUMNS.CUSTOMER_NAME);

  var changeCount = 0;
  var purchaseResults = [];

  for (var i = 0; i < purchaseData.length; i++) {
    var originalId = String(purchaseData[i][customerIdIdx]).trim();
    var customerName = customerNameIdx !== -1 ? String(purchaseData[i][customerNameIdx]) : '';
    var newId = originalId;
    var changeReason = '';

    // 削除ログにあるIDか確認
    if (deletedIdMap[originalId]) {
      newId = deletedIdMap[originalId].mainId;
      changeReason = '削除済み顧客のID → メインIDに書き換え';
    }
    // SFのメインIDと一致するか確認
    else if (sfMainIdMap[originalId]) {
      // メインIDと一致 → 処理不要
      newId = originalId;
    }
    // サブIDの可能性をチェック
    else {
      var mainId = findMainIdForSub(originalId, sfHeaders, sfData);
      if (mainId) {
        newId = mainId;
        changeReason = 'サブID → メインIDに書き換え';
      }
    }

    if (newId !== originalId) {
      purchaseData[i][customerIdIdx] = newId;
      changeCount++;
    }

    purchaseResults.push({
      orderId: getFieldValue(purchaseData[i], purchaseHeaders, PURCHASE_COLUMNS.ORDER_ID),
      originalId: originalId,
      newId: newId,
      changeReason: changeReason,
    });
  }

  // データを書き戻し
  if (purchaseData.length > 0) {
    purchaseSheet.getRange(2, 1, purchaseData.length, purchaseHeaders.length).setValues(purchaseData);
  }

  // 購買突合結果の書き出し
  writePurchaseResults(ss, purchaseResults);

  logOperation('購買突合完了', '変更: ' + changeCount + '件');

  ui.alert(
    '購買データ突合完了',
    '処理件数: ' + purchaseData.length + '件\n' +
    'ID書き換え: ' + changeCount + '件'
  );
}

/**
 * 前日処理済みデータを削除する
 * 処理ログから前回処理した受注IDを取得し、該当行を削除
 */
function removePreviouslyProcessed(sheet, headers, data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName(SHEET_NAMES.OPERATION_LOG);

  if (!logSheet || logSheet.getLastRow() < 2) return data;

  // 処理ログから前回の購買処理で処理済みの受注IDを取得
  var logData = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues();
  var processedOrderIds = {};

  for (var i = 0; i < logData.length; i++) {
    if (String(logData[i][1]).indexOf('購買突合完了') !== -1) {
      // 処理済み受注IDは購買突合結果シートから取得
      break;
    }
  }

  var resultSheet = ss.getSheetByName(SHEET_NAMES.PURCHASE_RESULT);
  if (resultSheet && resultSheet.getLastRow() >= 2) {
    var resultData = resultSheet.getRange(2, 1, resultSheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < resultData.length; j++) {
      processedOrderIds[String(resultData[j][0])] = true;
    }
  }

  var orderIdIdx = headers.indexOf(PURCHASE_COLUMNS.ORDER_ID);
  if (orderIdIdx === -1) return data;

  var filteredData = data.filter(function(row) {
    return !processedOrderIds[String(row[orderIdIdx])];
  });

  var removedCount = data.length - filteredData.length;
  if (removedCount > 0) {
    logOperation('前日処理分削除', removedCount + '件削除');
    // シートを書き直す
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    if (filteredData.length > 0) {
      sheet.getRange(2, 1, filteredData.length, headers.length).setValues(filteredData);
    }
  }

  return filteredData;
}

/**
 * SFのメイン顧客IDマップを構築
 */
function buildSfMainIdMap(sfHeaders, sfData) {
  var colormeIdIdx = sfHeaders.indexOf(SF_COLUMNS.COLORME_ID);
  var subFlagIdx = sfHeaders.indexOf(SF_COLUMNS.SUB_FLAG);
  var map = {};

  if (colormeIdIdx === -1) return map;

  for (var i = 0; i < sfData.length; i++) {
    var cid = String(sfData[i][colormeIdIdx]).trim();
    var isMain = subFlagIdx === -1 || !sfData[i][subFlagIdx];
    if (cid && isMain) {
      map[cid] = true;
    }
  }

  return map;
}

/**
 * 削除ログからIDマップを構築
 */
function buildDeletedIdMap(ss) {
  var sheet = ss.getSheetByName(SHEET_NAMES.DELETED_LOG);
  var map = {};

  if (!sheet || sheet.getLastRow() < 2) return map;

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  for (var i = 0; i < data.length; i++) {
    var deletedId = String(data[i][1]).trim(); // カラーミー顧客ID
    var sfId = String(data[i][3]).trim(); // SF_ID
    if (deletedId) {
      map[deletedId] = {
        mainId: sfId,
        name: String(data[i][2]),
      };
    }
  }

  return map;
}

/**
 * サブIDからメインIDを探す
 */
function findMainIdForSub(subId, sfHeaders, sfData) {
  var colormeIdIdx = sfHeaders.indexOf(SF_COLUMNS.COLORME_ID);
  var sfIdIdx = sfHeaders.indexOf(SF_COLUMNS.SF_ID);
  var nameIdx = sfHeaders.indexOf(SF_COLUMNS.NAME);
  var subFlagIdx = sfHeaders.indexOf(SF_COLUMNS.SUB_FLAG);

  if (colormeIdIdx === -1) return null;

  // サブIDと一致するレコードを探す
  for (var i = 0; i < sfData.length; i++) {
    if (String(sfData[i][colormeIdIdx]).trim() === subId && sfData[i][subFlagIdx]) {
      // サブレコードの名前でメインを探す
      var subName = String(sfData[i][nameIdx]);
      for (var j = 0; j < sfData.length; j++) {
        if (i !== j &&
            String(sfData[j][nameIdx]) === subName &&
            !sfData[j][subFlagIdx] &&
            sfData[j][colormeIdIdx]) {
          return String(sfData[j][colormeIdIdx]).trim();
        }
      }
    }
  }

  return null;
}

/**
 * 購買突合結果を書き出す
 */
function writePurchaseResults(ss, results) {
  var sheet = ss.getSheetByName(SHEET_NAMES.PURCHASE_RESULT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.PURCHASE_RESULT);
  }
  sheet.clear();

  var headers = ['受注ID', '元カラーミー顧客ID', '新カラーミー顧客ID', '変更理由'];
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground(COLORS.HEADER_BLUE);
  headerRange.setFontColor(COLORS.HEADER_TEXT);
  headerRange.setFontWeight('bold');

  if (results.length > 0) {
    var rows = results.map(function(r) {
      return [r.orderId, r.originalId, r.newId, r.changeReason];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // 変更があった行をハイライト
    for (var i = 0; i < results.length; i++) {
      if (results[i].changeReason) {
        sheet.getRange(i + 2, 1, 1, headers.length).setBackground(COLORS.ALERT_YELLOW);
      }
    }
  }

  for (var c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
}
