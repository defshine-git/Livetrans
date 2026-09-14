/**
 * code.gs - Google Apps Script Backend for Gemini Live Bilingual Translator
 * Version: 2.5.0 (Hardened Production Release)
 * 
 * 主な機能:
 * 1. doPost(e): 翻訳ログ保存 (action: 'save') および バックアップ翻訳 (action: 'translate')
 * 2. doGet(e): ヘルスチェックエンドポイント
 * 3. 共有トークン認証 (SECRET_TOKEN)
 * 4. LanguageApp.translate を用いた高信頼性バックアップ翻訳機能 (自動言語コード補正対応)
 * 5. ドキュメントURLからのID自動抽出対応
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({
        status: 'error',
        code: 'MISSING_PAYLOAD',
        message: 'リクエストボディが空です。'
      });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (jsonErr) {
      return createJsonResponse({
        status: 'error',
        code: 'JSON_PARSE_ERROR',
        message: 'JSONパース失敗: ' + jsonErr.message
      });
    }

    // 1. セキュリティトークン認証 (SECRET_TOKEN 設定時のみ検証)
    const scriptProperties = PropertiesService.getScriptProperties();
    const configuredToken = scriptProperties.getProperty('SECRET_TOKEN');
    if (configuredToken && configuredToken.trim() !== '') {
      const clientToken = payload.token ? String(payload.token).trim() : '';
      if (clientToken !== configuredToken.trim()) {
        return createJsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED',
          message: '認証トークンが無効または未入力です。'
        });
      }
    }

    const action = payload.action || 'save';

    if (action === 'save') {
      const result = handleSaveTranscript(payload);
      return createJsonResponse(result);
    } else if (action === 'translate') {
      // 2. バックアップ翻訳API (LanguageApp) - 安全な自動言語判別対応
      const text = payload.text ? String(payload.text).trim() : '';
      if (!text) {
        return createJsonResponse({ status: 'error', message: '翻訳対象テキストが空です。' });
      }

      // 日本語文字（ひらがな・カタカナ・漢字）が含まれるか判定
      const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
      let srcLang = payload.srcLang ? String(payload.srcLang).trim().toLowerCase() : '';
      let targetLang = payload.targetLang ? String(payload.targetLang).trim().toLowerCase() : '';

      if (!srcLang || srcLang === 'auto') {
        srcLang = hasJapanese ? 'ja' : 'en';
      }
      if (!targetLang || targetLang === 'auto') {
        targetLang = (srcLang === 'ja') ? 'en' : 'ja';
      }

      try {
        const translated = LanguageApp.translate(text, srcLang, targetLang);
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
    } else if (action === 'ping') {
      return createJsonResponse({
        status: 'success',
        message: 'pong',
        authRequired: !!(configuredToken && configuredToken.trim() !== ''),
        authPassed: true,
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
  const configuredToken = PropertiesService.getScriptProperties().getProperty('SECRET_TOKEN');
  return createJsonResponse({
    status: 'ok',
    service: 'Gemini Live Bilingual Translator Backend',
    version: '2.5.0',
    authEnabled: !!(configuredToken && configuredToken.trim() !== ''),
    timestamp: new Date().toISOString()
  });
}

/**
 * URLまたはID文字列から正規のGoogle Docs IDを抽出
 */
function extractDocumentId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const match = str.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return str;
}

/**
 * 差分レコード群を Google ドキュメントに保存
 */
function handleSaveTranscript(payload) {
  const rawDocId = payload.documentId ? String(payload.documentId).trim() : '';
  const documentId = extractDocumentId(rawDocId);

  const defaultTitle = '日英翻訳通訳ログ_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const title = (payload.title && String(payload.title).trim() !== '') ? String(payload.title).trim() : defaultTitle;
  const records = Array.isArray(payload.records) ? payload.records : [];
  const modelName = payload.model || 'models/gemini-3.5-transcribe-live';
  const direction = payload.direction || 'AUTO';

  if (records.length === 0) {
    return {
      status: 'success',
      message: '追記対象の差分レコードがありません。',
      savedCount: 0
    };
  }

  let doc;
  let isNew = false;

  if (documentId !== '') {
    try {
      doc = DocumentApp.openById(documentId);
    } catch (openErr) {
      throw new Error(`指定されたドキュメント (ID: ${documentId}) を開けませんでした。IDが正しいか、共有権限を確認してください。(${openErr.message})`);
    }
  } else {
    doc = DocumentApp.create(title);
    isNew = true;
  }

  const body = doc.getBody();

  if (isNew) {
    const titleP = body.appendParagraph(title);
    titleP.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    titleP.setForegroundColor('#0969DA');

    const metaStr = `■ 作成日時: ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')} (JST)  |  認識モデル: ${modelName}  |  翻訳設定: ${direction.toUpperCase()}`;
    const metaP = body.appendParagraph(metaStr);
    metaP.setForegroundColor('#57606A');
    metaP.setFontSize(9.5);
    body.appendHorizontalRule();
  } else {
    // 既存文書への追記セッション区切り
    body.appendHorizontalRule();
    const sepStr = `追記セッション: ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')} (JST) [新規追加: ${records.length}件]`;
    const sepP = body.appendParagraph(sepStr);
    sepP.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    sepP.setForegroundColor('#57606A');
  }

  records.forEach((item, index) => {
    const timeStr = item.timestamp || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm:ss');
    const langBadge = (item.speakerLang || 'AUTO').toUpperCase();

    const headP = body.appendParagraph(`[${timeStr}]  【${langBadge}】`);
    headP.setHeading(DocumentApp.ParagraphHeading.HEADING4);
    headP.setForegroundColor('#0969DA');
    headP.setSpacingBefore(6);
    headP.setSpacingAfter(2);

    const origP = body.appendParagraph(`原文: ${item.original || '(なし)'}`);
    origP.setForegroundColor('#1F2328');
    origP.setSpacingBefore(0);
    origP.setSpacingAfter(2);
    origP.setIndentLeft(16);

    const transP = body.appendParagraph(`訳文: ${item.translated || '(なし)'}`);
    transP.setForegroundColor('#1A7F37');
    transP.setBold(true);
    transP.setSpacingBefore(0);
    transP.setSpacingAfter(6);
    transP.setIndentLeft(16);

    if (index < records.length - 1) {
      body.appendHorizontalRule();
    }
  });

  doc.saveAndClose();

  return {
    status: 'success',
    isNew: isNew,
    documentId: doc.getId(),
    documentUrl: doc.getUrl(),
    documentTitle: doc.getName(),
    savedCount: records.length,
    timestamp: new Date().toISOString()
  };
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
