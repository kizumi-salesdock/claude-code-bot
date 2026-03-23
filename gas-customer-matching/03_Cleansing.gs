/**
 * ============================================================
 * データクレンジングモジュール
 * ============================================================
 *
 * カラーミーショップの顧客データに対して以下のクレンジングを実行:
 * - 不要なスペースの削除（顧客名、フリガナ、住所）
 * - 全角・半角の統一
 * - 性別「未回答」→「選択しない」変換
 * - 建物名の番地移動
 * - スペースのアンダーバー変換（建物名）
 */

/**
 * ローカルクレンジング（API不要の基本処理）
 * コスト削減のため、まずローカルで処理できるものはローカルで処理する
 * @param {string} value - クレンジング対象の値
 * @param {string} fieldType - フィールドタイプ
 * @return {string} クレンジング後の値
 */
function localCleanse(value, fieldType) {
  if (!value) return value;
  var v = String(value);

  switch (fieldType) {
    case 'name':
    case 'kana':
      // 姓名間のスペース削除
      v = v.replace(/[\s\u3000]+/g, '');
      // 半角カタカナ→全角カタカナ
      v = halfToFullKatakana(v);
      break;

    case 'city':
    case 'address':
      // 不要なスペース削除
      v = v.replace(/[\s\u3000]+/g, '');
      // 全角数字→半角数字
      v = fullToHalfNumber(v);
      break;

    case 'building':
      // スペースをアンダーバーに変換
      v = v.replace(/\s/g, '_');
      // 全角スペースもアンダーバーに
      v = v.replace(/\u3000/g, '_');
      break;

    case 'phone':
      // ハイフン・スペース削除、全角→半角
      v = fullToHalfNumber(v);
      v = v.replace(/[-\s\u3000ー－]/g, '');
      break;

    case 'zipcode':
      // ハイフン削除、全角→半角
      v = fullToHalfNumber(v);
      v = v.replace(/[-ー－]/g, '');
      break;

    case 'gender':
      // 未回答→選択しない
      if (v === '未回答' || v === '無回答' || v === '') {
        v = '選択しない';
      }
      break;

    case 'email':
      // 全角英数→半角英数
      v = fullToHalfAlphaNum(v);
      v = v.toLowerCase();
      break;
  }

  return v;
}

/**
 * 全角数字を半角数字に変換
 */
function fullToHalfNumber(str) {
  return str.replace(/[０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

/**
 * 全角英数字を半角英数字に変換
 */
function fullToHalfAlphaNum(str) {
  return str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

/**
 * 半角カタカナを全角カタカナに変換
 */
function halfToFullKatakana(str) {
  var kanaMap = {
    'ｶﾞ':'ガ','ｷﾞ':'ギ','ｸﾞ':'グ','ｹﾞ':'ゲ','ｺﾞ':'ゴ',
    'ｻﾞ':'ザ','ｼﾞ':'ジ','ｽﾞ':'ズ','ｾﾞ':'ゼ','ｿﾞ':'ゾ',
    'ﾀﾞ':'ダ','ﾁﾞ':'ヂ','ﾂﾞ':'ヅ','ﾃﾞ':'デ','ﾄﾞ':'ド',
    'ﾊﾞ':'バ','ﾋﾞ':'ビ','ﾌﾞ':'ブ','ﾍﾞ':'ベ','ﾎﾞ':'ボ',
    'ﾊﾟ':'パ','ﾋﾟ':'ピ','ﾌﾟ':'プ','ﾍﾟ':'ペ','ﾎﾟ':'ポ',
    'ｳﾞ':'ヴ',
    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ',
    'ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ',
    'ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ',
    'ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ',
    'ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ',
    'ﾜ':'ワ','ｦ':'ヲ','ﾝ':'ン',
    'ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ',
    'ｯ':'ッ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ',
    'ｰ':'ー','｡':'。','｢':'「','｣':'」','､':'、','･':'・',
  };

  // 濁点・半濁点の合成文字を先に処理
  var regex = new RegExp('(' + Object.keys(kanaMap).sort(function(a, b) {
    return b.length - a.length;
  }).join('|') + ')', 'g');

  return str.replace(regex, function(match) {
    return kanaMap[match] || match;
  });
}

/**
 * カラーミー顧客データのクレンジングを実行
 * ローカル処理 + Claude APIの2段階処理
 */
function runCleansing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.COLORME_CUSTOMERS);

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert(
      'カラーミー顧客シートにデータがありません。\n' +
      'まず「CSVインポート > カラーミー顧客CSVをインポート」を実行してください。'
    );
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    'データクレンジング',
    'カラーミー顧客データのクレンジングを実行しますか？\n' +
    '（ローカル処理 + Claude API処理）',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  logOperation('クレンジング開始', 'データ件数: ' + (sheet.getLastRow() - 1));

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  var data = dataRange.getValues();

  // ── Step 1: ローカルクレンジング ──
  var headerIndexMap = {};
  for (var i = 0; i < headers.length; i++) {
    headerIndexMap[headers[i]] = i;
  }

  var changeCount = 0;
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
      { col: COLORME_COLUMNS.ZIPCODE_SHIP, type: 'zipcode' },
      { col: COLORME_COLUMNS.CITY_SHIP, type: 'city' },
      { col: COLORME_COLUMNS.ADDRESS_SHIP, type: 'address' },
      { col: COLORME_COLUMNS.BUILDING_SHIP, type: 'building' },
    ];

    for (var f = 0; f < fieldMappings.length; f++) {
      var idx = headerIndexMap[fieldMappings[f].col];
      if (idx !== undefined && data[r][idx]) {
        var original = String(data[r][idx]);
        var cleansed = localCleanse(original, fieldMappings[f].type);
        if (original !== cleansed) {
          data[r][idx] = cleansed;
          changeCount++;
        }
      }
    }
  }

  // ローカル処理結果を書き戻し
  dataRange.setValues(data);
  logOperation('ローカルクレンジング完了', '変更箇所: ' + changeCount);

  // ── Step 2: Claude APIによる高度なクレンジング ──
  // 建物名に番地が含まれる等、ルールベースで対応しにくいケースをAIに判断させる
  var batchSize = CLAUDE_CONFIG.BATCH_SIZE;
  var apiChangeCount = 0;

  for (var batchStart = 0; batchStart < data.length; batchStart += batchSize) {
    var batchEnd = Math.min(batchStart + batchSize, data.length);
    var batch = data.slice(batchStart, batchEnd);

    try {
      var jsonData = formatCustomerDataForCleansing(batch, headers);
      var prompt = [
        '以下の顧客データを確認し、クレンジングルールに従って修正してください。',
        '特に以下の点に注意してください:',
        '- 建物名に番地情報が含まれていないか',
        '- 住所の表記が適切か',
        '- フリガナが正しいか',
        '',
        jsonData,
      ].join('\n');

      var response = callClaudeAPI(getCleansingSystemPrompt(), prompt);
      var cleansedData = extractJsonFromResponse(response);

      // クレンジング結果を反映
      for (var c = 0; c < cleansedData.length; c++) {
        var rowIndex = batchStart + c;
        if (rowIndex >= data.length) break;

        var cleansed = cleansedData[c];
        for (var h = 0; h < headers.length; h++) {
          var headerName = headers[h];
          if (cleansed[headerName] !== undefined && String(data[rowIndex][h]) !== String(cleansed[headerName])) {
            data[rowIndex][h] = cleansed[headerName];
            apiChangeCount++;
          }
        }
      }
    } catch (e) {
      logOperation('APIクレンジングエラー', 'バッチ ' + batchStart + '-' + batchEnd + ': ' + e.message);
    }

    // API制限対策
    if (batchStart + batchSize < data.length) {
      Utilities.sleep(1000);
    }
  }

  // API処理結果を書き戻し
  dataRange.setValues(data);
  logOperation('APIクレンジング完了', 'API変更箇所: ' + apiChangeCount);

  ui.alert(
    'クレンジング完了',
    'ローカル変更: ' + changeCount + '箇所\n' +
    'API変更: ' + apiChangeCount + '箇所'
  );
}
