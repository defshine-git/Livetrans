/**
 * code.gs - Google Apps Script Backend for Gemini Live Bilingual Translator
 * Version: 2.5.0 (Hardened Production Release with Designated Folder & Glossary Integration)
 * 
 * 主な機能:
 * 1. doPost(e): 翻訳ログ保存 (action: 'save' / 'saveToGoogleDoc') および バックアップ翻訳 (action: 'translate')
 * 2. 指定フォルダへの自動格納 (OUTPUT_FOLDER_ID: 15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f)
 * 3. 専門用語データベース連携 (SPREADSHEET_ID: 1LaCapvqgu-qQUXuMyGNqiqvbSl5TjWhFt4EOllcvON0)
 * 4. 共有トークン認証 (SECRET_TOKEN)
 * 5. LanguageApp.translate によるバックアップ翻訳機能
 */

var DEFAULT_CONFIG = {
  SPREADSHEET_ID: '1LaCapvqgu-qQUXuMyGNqiqvbSl5TjWhFt4EOllcvON0', // Audit_Terminology_Database
  OUTPUT_FOLDER_ID: '15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f',       // Audit_Transcripts Folder
  LIVE_TRANSCRIBE_MODEL: 'models/gemini-3.5-transcribe-live',
  TRANSLATE_MODEL: 'gemini-3.5-flash-lite'
};

function getScriptConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return {
    SECRET_TOKEN: props.SECRET_TOKEN || '',
    SPREADSHEET_ID: props.SPREADSHEET_ID || DEFAULT_CONFIG.SPREADSHEET_ID,
    OUTPUT_FOLDER_ID: props.OUTPUT_FOLDER_ID || DEFAULT_CONFIG.OUTPUT_FOLDER_ID,
    LIVE_TRANSCRIBE_MODEL: props.LIVE_TRANSCRIBE_MODEL || DEFAULT_CONFIG.LIVE_TRANSCRIBE_MODEL,
    TRANSLATE_MODEL: props.TRANSLATE_MODEL || DEFAULT_CONFIG.TRANSLATE_MODEL
  };
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        code: 'MISSING_PAYLOAD',
        message: 'リクエストボディが空です。'
      });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (jsonErr) {
      return createJsonResponse({
        status: 'error',
        code: 'JSON_PARSE_ERROR',
        message: 'JSONパース失敗: ' + jsonErr.message
      });
    }

    var config = getScriptConfig();

    // 1. セキュリティトークン認証 (SECRET_TOKEN 設定時のみ検証)
    if (config.SECRET_TOKEN && config.SECRET_TOKEN.trim() !== '') {
      var clientToken = payload.token ? String(payload.token).trim() : '';
      if (clientToken !== config.SECRET_TOKEN.trim()) {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: 'GAS認証トークンが無効または未入力です。設定画面の「GAS 共有シークレットトークン」を確認してください。'
        });
      }
    }

    var action = payload.action || 'save';

    // 2. ドキュメント保存アクション (save または saveToGoogleDoc の両方に対応)
    if (action === 'save' || action === 'saveToGoogleDoc') {
      var result = handleSaveTranscript(payload, config);
      return createJsonResponse(result);
    } 
    // 3. バックアップ翻訳API (LanguageApp)
    else if (action === 'translate') {
      var text = payload.text ? String(payload.text).trim() : '';
      if (!text) {
        return createJsonResponse({ status: 'error', message: '翻訳対象テキストが空です。' });
      }

      var hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
      var srcLang = payload.srcLang ? String(payload.srcLang).trim().toLowerCase() : '';
      var targetLang = payload.targetLang ? String(payload.targetLang).trim().toLowerCase() : '';

      if (!srcLang || srcLang === 'auto') srcLang = hasJapanese ? 'ja' : 'en';
      if (!targetLang || targetLang === 'auto') targetLang = (srcLang === 'ja') ? 'en' : 'ja';

      try {
        var translated = LanguageApp.translate(text, srcLang, targetLang);
        return createJsonResponse({
          status: 'success',
          translated: translated,
          speakerLang: srcLang
        });
      } catch (transErr) {
        return createJsonResponse({
          status: 'error',
          code: 'TRANSLATION_FAILED',
          message: 'LanguageApp翻訳エラー: ' + transErr.toString()
        });
      }
    } 
    // 4. 専門用語辞書取得
    else if (action === 'getGlossary') {
      var category = payload.category || 'Common';
      var glossary = getGlossaryTerms(category, config);
      return createJsonResponse({ status: 'success', category: category, terms: glossary });
    }
    // 5. 辞書キャッシュ更新
    else if (action === 'refreshGlossaryCache') {
      var cacheResult = refreshGlossaryCache();
      return createJsonResponse(cacheResult);
    }
    // 6. ヘルスチェック ping
    else if (action === 'ping') {
      return createJsonResponse({
        status: 'success',
        message: 'pong',
        outputFolderId: config.OUTPUT_FOLDER_ID,
        spreadsheetId: config.SPREADSHEET_ID,
        authRequired: !!(config.SECRET_TOKEN && config.SECRET_TOKEN.trim() !== ''),
        authPassed: true,
        version: '2.5.0',
        timestamp: new Date().toISOString()
      });
    } else {
      return createJsonResponse({
        status: 'error',
        code: 'UNKNOWN_ACTION',
        message: '未定義のアクションです: ' + action
      });
    }
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      code: 'SERVER_EXCEPTION',
      message: 'GAS処理中に例外が発生しました: ' + err.toString()
    });
  }
}

function doGet(e) {
  var config = getScriptConfig();
  return createJsonResponse({
    status: 'ok',
    service: 'Bilingual Transcriber Backend',
    version: '2.5.0',
    outputFolderId: config.OUTPUT_FOLDER_ID,
    spreadsheetId: config.SPREADSHEET_ID,
    authEnabled: !!(config.SECRET_TOKEN && config.SECRET_TOKEN.trim() !== ''),
    timestamp: new Date().toISOString()
  });
}

/**
 * URLまたはID文字列から正規のGoogle Docs IDを抽出
 */
/**
 * URLまたはID文字列から正規のGoogle Drive フォルダIDを抽出
 */
function extractFolderId(input) {
  if (!input) return '';
  var str = String(input).trim();
  var match = str.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return str;
}

function extractDocumentId(input) {
  if (!input) return '';
  var str = String(input).trim();
  var match = str.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return str;
}

/**
 * 差分レコード群を Google ドキュメントに保存し、指定フォルダへ自動格納
 */
function handleSaveTranscript(payload, config) {
  var rawDocId = payload.documentId ? String(payload.documentId).trim() : '';
  var documentId = extractDocumentId(rawDocId);

  // 可変フォルダIDの取得: クライアント指定 > 設定 > デフォルト
  var rawFolderId = payload.folderId || payload.outputFolderId || '';
  var folderId = extractFolderId(rawFolderId) || config.OUTPUT_FOLDER_ID;

  var defaultTitle = 'Audit_Transcript_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  var title = (payload.title && String(payload.title).trim() !== '') ? String(payload.title).trim() : defaultTitle;
  
  var records = Array.isArray(payload.records) ? payload.records : (Array.isArray(payload.transcriptList) ? payload.transcriptList : []);
  var modelName = payload.model || config.LIVE_TRANSCRIBE_MODEL;
  var direction = payload.direction || 'AUTO';
  var category = payload.category || 'HKC';

  if (records.length === 0) {
    return {
      status: 'success',
      message: '追記対象の差分レコードがありません。',
      savedCount: 0
    };
  }

  var doc;
  var isNew = false;

  if (documentId !== '') {
    try {
      doc = DocumentApp.openById(documentId);
    } catch (openErr) {
      throw new Error('指定されたドキュメント (ID: ' + documentId + ') を開けませんでした。IDが正しいか確認してください。(' + openErr.message + ')');
    }
  } else {
    try {
      doc = DocumentApp.create(title);
      isNew = true;
    } catch (createErr) {
      throw new Error('新規Googleドキュメントの作成に失敗しました: ' + createErr.message);
    }
  }

  var body = doc.getBody();

  if (isNew) {
    body.setPageWidth(595.27);
    body.setPageHeight(841.88);
    body.setMarginLeft(40);
    body.setMarginRight(40);
    body.setMarginTop(40);
    body.setMarginBottom(40);

    var titleP = body.appendParagraph(title);
    titleP.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titleP.setForegroundColor('#1b365d');

    var dirLabel = (direction === 'AUTO') ? '自動切替 (英⇄日)' : ((direction === 'ja-to-en' || direction === 'JA_TO_EN') ? '日本語 ➔ 英語' : '英語 ➔ 日本語');
    var metaStr = '■ 作成日時: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + ' (JST)  |  分野: ' + category + '  |  認識モデル: ' + modelName + '  |  翻訳設定: ' + dirLabel;
    var metaP = body.appendParagraph(metaStr);
    metaP.setForegroundColor('#57606a');
    metaP.setFontSize(9.5);
    body.appendHorizontalRule();
  } else {
    body.appendHorizontalRule();
    var sepStr = '追記セッション: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') + ' (JST) [分野: ' + category + ' / 新規追加: ' + records.length + '件]';
    var sepP = body.appendParagraph(sepStr);
    sepP.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    sepP.setForegroundColor('#57606a');
  }

  records.forEach(function(item, index) {
    var timeStr = item.timestamp || item.time || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm:ss');
    var speakerLabel = item.speaker || '発話';
    var langBadge = (item.speakerLang || item.detectedLanguage || 'AUTO').toUpperCase();

    var headP = body.appendParagraph('[' + timeStr + ']  【' + speakerLabel + ' (' + langBadge + ')】');
    headP.setHeading(DocumentApp.ParagraphHeading.HEADING4);
    headP.setForegroundColor('#1b365d');
    headP.setSpacingBefore(6);
    headP.setSpacingAfter(2);

    var origText = item.original || item.originalText || '(なし)';
    var origP = body.appendParagraph('原文: ' + origText);
    origP.setForegroundColor('#2c3e50');
    origP.setSpacingBefore(0);
    origP.setSpacingAfter(2);
    origP.setIndentLeft(16);

    var transText = item.translated || item.translatedText || '(なし)';
    var transP = body.appendParagraph('訳文: ' + transText);
    transP.setForegroundColor('#27ae60');
    transP.setBold(true);
    transP.setSpacingBefore(0);
    transP.setSpacingAfter(6);
    transP.setIndentLeft(16);

    if (index < records.length - 1) {
      body.appendHorizontalRule();
    }
  });

  doc.saveAndClose();

  // 指定フォルダへの移動 (新規作成時のみ、可変フォルダID対応)
  var targetFolderName = 'マイドライブ';
  var targetFolderUrl = '';
  if (isNew && folderId && folderId.trim() !== '') {
    try {
      var folder = DriveApp.getFolderById(folderId.trim());
      var file = DriveApp.getFileById(doc.getId());
      file.moveTo(folder);
      targetFolderName = folder.getName();
      targetFolderUrl = folder.getUrl();
    } catch (folderErr) {
      console.warn('指定フォルダ (' + folderId + ') へのファイル移動失敗: ' + folderErr.message);
    }
  }

  return {
    status: 'success',
    isNew: isNew,
    documentId: doc.getId(),
    documentUrl: doc.getUrl(),
    documentTitle: doc.getName(),
    folderId: folderId,
    folderName: targetFolderName,
    folderUrl: targetFolderUrl,
    savedCount: records.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * 専門用語スプレッドシートからの用語取得
 */
function getGlossaryTerms(category, config) {
  category = category || 'Common';
  var terms = [];
  try {
    var ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    var targetSheet = ss.getSheetByName(category);
    if (targetSheet) readSheetTerms_(targetSheet, terms);
    if (category !== 'Common') {
      var commonSheet = ss.getSheetByName('Common');
      if (commonSheet) readSheetTerms_(commonSheet, terms);
    }
  } catch (err) {
    console.warn('Glossary取得エラー: ' + err.message);
  }
  return terms;
}

function readSheetTerms_(sheet, termsList) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var existing = Object.create(null);
  termsList.forEach(function(t) { existing[String(t.source || '').toLowerCase()] = true; });
  values.forEach(function(row) {
    var source = String(row[0] || '').trim();
    var key = source.toLowerCase();
    if (!source || existing[key]) return;
    termsList.push({
      source: source,
      aliases: String(row[1] || '').trim(),
      target: String(row[2] || '').trim() || source,
      notes: String(row[3] || '').trim()
    });
    existing[key] = true;
  });
}

function refreshGlossaryCache() {
  var cache = CacheService.getScriptCache();
  ['HKC', 'EU-SRR', 'HSE', 'IHM', 'Common'].forEach(function(c) {
    cache.remove('GLOSSARY_V3_' + c);
  });
  return { success: true, message: '用語集キャッシュをリフレッシュしました。' };
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
