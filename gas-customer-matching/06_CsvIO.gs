/**
 * ============================================================
 * CSV入出力モジュール
 * ============================================================
 *
 * CSVファイルのインポート・エクスポートを管理します。
 * - カラーミー顧客CSV (customer.csv) のインポート
 * - Salesforce顧客CSVのインポート
 * - 購買データCSV (sales_all.csv) のインポート
 * - 処理済みデータのCSVエクスポート
 */

/**
 * カラーミー顧客CSVをインポート
 */
function importColormeCustomerCsv() {
  importCsvToSheet(
    SHEET_NAMES.COLORME_CUSTOMERS,
    'カラーミー顧客CSV (customer.csv) を選択してください'
  );
}

/**
 * Salesforce顧客CSVをインポート
 */
function importSfCustomerCsv() {
  importCsvToSheet(
    SHEET_NAMES.SF_CUSTOMERS,
    'Salesforce顧客CSVを選択してください'
  );
}

/**
 * 購買データCSVをインポート
 */
function importPurchaseCsv() {
  importCsvToSheet(
    SHEET_NAMES.PURCHASE_DATA,
    '購買データCSV (sales_all.csv) を選択してください'
  );
}

/**
 * CSVファイルをシートにインポートする共通関数
 * Google DriveのファイルピッカーまたはペーストでCSVデータを取得
 * @param {string} sheetName - インポート先のシート名
 * @param {string} promptMessage - ユーザーへのプロンプトメッセージ
 */
function importCsvToSheet(sheetName, promptMessage) {
  var ui = SpreadsheetApp.getUi();

  // HTMLダイアログでファイルアップロード
  var html = HtmlService.createHtmlOutput(
    '<html><head><base target="_top"><style>' +
    'body{font-family:sans-serif;padding:20px}' +
    '.btn{padding:10px 20px;margin:5px;cursor:pointer;border:none;border-radius:4px;font-size:14px}' +
    '.btn-primary{background:#4472C4;color:#fff}' +
    '.btn-secondary{background:#e0e0e0;color:#333}' +
    'textarea{width:100%;height:200px;margin:10px 0;font-family:monospace;font-size:12px}' +
    'input[type=file]{margin:10px 0}' +
    '</style></head><body>' +
    '<h3>' + promptMessage + '</h3>' +
    '<p><strong>方法1:</strong> CSVファイルをアップロード</p>' +
    '<input type="file" id="csvFile" accept=".csv">' +
    '<br><br>' +
    '<p><strong>方法2:</strong> CSVデータを貼り付け</p>' +
    '<textarea id="csvText" placeholder="CSVデータをここに貼り付けてください..."></textarea>' +
    '<br>' +
    '<button class="btn btn-primary" onclick="submitData()">インポート</button>' +
    '<button class="btn btn-secondary" onclick="google.script.host.close()">キャンセル</button>' +
    '<script>' +
    'function submitData(){' +
    '  var fileInput=document.getElementById("csvFile");' +
    '  var textInput=document.getElementById("csvText").value;' +
    '  if(fileInput.files.length>0){' +
    '    var reader=new FileReader();' +
    '    reader.onload=function(e){' +
    '      google.script.run.withSuccessHandler(function(){' +
    '        google.script.host.close();' +
    '      }).withFailureHandler(function(err){' +
    '        alert("エラー: "+err.message);' +
    '      }).processCsvImport("' + sheetName + '",e.target.result);' +
    '    };' +
    '    reader.readAsText(fileInput.files[0],"UTF-8");' +
    '  }else if(textInput){' +
    '    google.script.run.withSuccessHandler(function(){' +
    '      google.script.host.close();' +
    '    }).withFailureHandler(function(err){' +
    '      alert("エラー: "+err.message);' +
    '    }).processCsvImport("' + sheetName + '",textInput);' +
    '  }else{' +
    '    alert("CSVファイルまたはデータを入力してください");' +
    '  }' +
    '}' +
    '</script></body></html>'
  )
  .setWidth(600)
  .setHeight(450)
  .setTitle('CSVインポート');

  ui.showModalDialog(html, 'CSVインポート');
}

/**
 * CSVデータを処理してシートに書き込む
 * @param {string} sheetName - 書き込み先シート名
 * @param {string} csvText - CSVテキストデータ
 */
function processCsvImport(sheetName, csvText) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();

  var rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error('CSVデータが空です');
  }

  // ヘッダー行の設定
  var headerRange = sheet.getRange(1, 1, 1, rows[0].length);
  headerRange.setValues([rows[0]]);
  headerRange.setBackground(COLORS.HEADER_BLUE);
  headerRange.setFontColor(COLORS.HEADER_TEXT);
  headerRange.setFontWeight('bold');

  // データ行の書き込み
  if (rows.length > 1) {
    var dataRows = rows.slice(1);
    sheet.getRange(2, 1, dataRows.length, rows[0].length).setValues(dataRows);
  }

  // 列幅自動調整
  for (var c = 1; c <= rows[0].length; c++) {
    sheet.autoResizeColumn(c);
  }

  logOperation('CSVインポート', sheetName + ': ' + (rows.length - 1) + '件');
}

/**
 * CSVテキストをパースする
 * ダブルクォート内のカンマ・改行に対応
 * @param {string} text - CSVテキスト
 * @return {Array} 2次元配列
 */
function parseCsv(text) {
  var rows = [];
  var currentRow = [];
  var currentField = '';
  var inQuotes = false;

  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    var next = i + 1 < text.length ? text[i + 1] : '';

    if (inQuotes) {
      if (c === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        currentField += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (c === '\n' || (c === '\r' && next === '\n')) {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        if (c === '\r') i++;
      } else if (c === '\r') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += c;
      }
    }
  }

  // 最後のフィールドとロー
  currentRow.push(currentField);
  if (currentRow.length > 1 || currentRow[0] !== '') {
    rows.push(currentRow);
  }

  // カラム数を統一
  if (rows.length > 0) {
    var maxCols = rows[0].length;
    for (var r = 1; r < rows.length; r++) {
      while (rows[r].length < maxCols) {
        rows[r].push('');
      }
      if (rows[r].length > maxCols) {
        rows[r] = rows[r].slice(0, maxCols);
      }
    }
  }

  return rows;
}

/**
 * 処理済み顧客データをCSVとしてエクスポート
 */
function exportCleanedCustomerCsv() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('エクスポートするデータがありません。');
    return;
  }

  exportSheetAsCsv(sheet, 'customer_cleaned');
}

/**
 * 処理済み購買データをCSVとしてエクスポート
 */
function exportPurchaseCsv() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.PURCHASE_DATA);

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('エクスポートするデータがありません。');
    return;
  }

  exportSheetAsCsv(sheet, 'sales_all_processed');
}

/**
 * SF顧客データ（カラーミーID付与済み）をCSVとしてエクスポート
 */
function exportSfCustomerCsv() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SF_CUSTOMERS);

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('エクスポートするデータがありません。');
    return;
  }

  exportSheetAsCsv(sheet, 'sf_customer_updated');
}

/**
 * シートのデータをCSVファイルとしてGoogleドライブに保存
 * @param {Sheet} sheet - エクスポート対象のシート
 * @param {string} filePrefix - ファイル名のプレフィックス
 */
function exportSheetAsCsv(sheet, filePrefix) {
  var data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var csvContent = '';

  for (var r = 0; r < data.length; r++) {
    var row = [];
    for (var c = 0; c < data[r].length; c++) {
      var value = String(data[r][c]);
      // ダブルクォートのエスケープ
      if (value.indexOf(',') !== -1 || value.indexOf('"') !== -1 || value.indexOf('\n') !== -1) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      row.push(value);
    }
    csvContent += row.join(',') + '\n';
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  var fileName = filePrefix + '_' + now + '.csv';
  var blob = Utilities.newBlob(csvContent, 'text/csv', fileName);

  var file = DriveApp.createFile(blob);

  var ui = SpreadsheetApp.getUi();
  ui.alert(
    'CSVエクスポート完了',
    'ファイル名: ' + fileName + '\n' +
    'Google ドライブのマイドライブに保存されました。\n' +
    'URL: ' + file.getUrl()
  );

  logOperation('CSVエクスポート', fileName);
}
