/**
 * MessageHandler.gs
 * 核心訊息處理邏輯，由 Code.gs 的 doPost 呼叫
 *
 * 主要流程：
 *   handleMessage(event)   - 處理 message 事件（使用者傳送文字）
 *   handlePostback(event)  - 處理 postback 事件（Quick Reply 按鈕點擊）
 */

var URL_REGEX = /https?:\/\/[^\s]*/i;

// ─────────────────────────────────────────────
// Message 事件入口
// ─────────────────────────────────────────────

function handleMessage(event) {
  var userId = event.source.userId;
  var replyToken = event.replyToken;
  var text = (event.message.text || '').trim();

  if (!text) return;

  var stateObj = getUserState(userId);
  var state = stateObj ? stateObj.state : null;

  // ── 狀態：等待搜尋關鍵字 ──
  if (state === STATE.WAITING_FOR_SEARCH) {
    clearUserState(userId);
    _handleSearch(replyToken, text);
    return;
  }

  // ── 狀態：等待手動分類（Quick Reply 按鈕應觸發 postback，此分支為保險用） ──
  if (state === STATE.WAITING_FOR_CATEGORY) {
    var validCats = ['科技', '財經', '工具', '其他'];
    if (validCats.indexOf(text) !== -1) {
      _applyManualCategory(userId, replyToken, text);
    } else {
      replyMessage(replyToken, [
        textMessage('請點選上方分類按鈕，或輸入：科技、財經、工具、其他', categoryQR())
      ]);
    }
    return;
  }

  // ── 狀態：等待使用者輸入自訂分類名稱 ──
  if (state === STATE.WAITING_FOR_CUSTOM_CATEGORY) {
    _applyManualCategory(userId, replyToken, text);
    return;
  }

  // ── 使用說明 ──
  if (text === '使用說明') {
    replyMessage(replyToken, [
      textMessage(
        '📖 使用說明\n\n' +
        '1️⃣ 儲存新聞\n' +
        '   直接傳送新聞網址，Bot 會自動擷取標題、產生 AI 摘要並分類，確認後存入知識庫。\n\n' +
        '2️⃣ 搜尋新聞\n' +
        '   點選下方「🔍 搜尋」按鈕，輸入關鍵字即可查詢知識庫中的文章。\n\n' +
        '3️⃣ 轉傳新聞\n' +
        '   支援轉傳含網址的訊息，Bot 會自動從中擷取連結。'
      )
    ]);
    return;
  }

  // ── 無狀態：判斷是否包含 URL ──
  var urlMatch = text.match(URL_REGEX);
  if (urlMatch) {
    var extractedUrl = urlMatch[0].replace(/[.,;:!?)]+$/, '');
    _handleUrl(userId, replyToken, extractedUrl);
    return;
  }

  // ── 其他文字：提示使用說明 ──
  replyMessage(replyToken, [
    textMessage('請傳送新聞網址，或點選選單中的「🔍 搜尋」按鈕查詢知識庫。')
  ]);
}

// ─────────────────────────────────────────────
// Postback 事件入口
// ─────────────────────────────────────────────

function handlePostback(event) {
  var userId = event.source.userId;
  var replyToken = event.replyToken;
  var data = event.postback ? event.postback.data : '';

  var params = _parseQueryString(data);
  var action = params.action;

  switch (action) {

    // 搜尋觸發（Rich Menu）
    case 'trigger_search':
      setUserState(userId, STATE.WAITING_FOR_SEARCH, {});
      replyMessage(replyToken, [textMessage('請輸入關鍵字以搜尋新聞')]);
      break;

    // 確認存入
    case 'confirm_save':
      _confirmSave(userId, replyToken);
      break;

    // 手動修改分類
    case 'manual_category':
      _promptManualCategory(userId, replyToken);
      break;

    // 套用手動分類
    case 'set_category':
      _applyManualCategory(userId, replyToken, params.cat);
      break;

    // 取消作業
    case 'cancel':
      clearUserState(userId);
      replyMessage(replyToken, [textMessage('已取消，隨時傳送新聞連結即可重新開始。')]);
      break;

    // 重複 URL - 忽略
    case 'ignore':
      clearUserState(userId);
      replyMessage(replyToken, [textMessage('已忽略，此連結不會重複儲存。')]);
      break;

    // 重複 URL - 更新現有紀錄
    case 'update_existing':
      _updateExisting(userId, replyToken);
      break;

    // 重複 URL - 強制重複儲存
    case 'force_save':
      _forceSave(userId, replyToken);
      break;

    default:
      Logger.log('未知 postback action: ' + action);
  }
}

// ─────────────────────────────────────────────
// 內部：URL 處理主流程
// ─────────────────────────────────────────────

function _handleUrl(userId, replyToken, url) {
  url = _normalizeUrl(url);

  // 1. 抓取 OG 資訊
  var og = fetchOGData(url);
  var warningPrefix = og.fallback
    ? '⚠️ 此網站無法完整擷取資訊，部分欄位可能不完整\n\n'
    : '';

  // 2. 查重
  var existingPageId = checkDuplicate(url);
  if (existingPageId) {
    // 暫存文章資料供後續使用
    setUserState(userId, STATE.WAITING_FOR_DUPLICATE, {
      url: url,
      title: og.title,
      image: og.image,
      siteName: og.siteName,
      existingPageId: existingPageId,
      fallback: og.fallback
    });
    replyMessage(replyToken, [
      textMessage(
        warningPrefix + '⚠️ 此連結已存在於知識庫中：\n「' + og.title + '」\n\n請選擇處理方式：',
        duplicateQR()
      )
    ]);
    return;
  }

  // 3. Groq AI 摘要與分類
  var ai = generateSummaryAndCategory(og.title, og.description || '');
  var category = ai ? ai.category : '其他';
  var summary = ai ? ai.summary : '（AI 摘要產生失敗）';

  // 4. 暫存預覽資料
  var article = {
    url: url,
    title: og.title,
    image: og.image,
    siteName: og.siteName,
    category: category,
    summary: summary,
    fallback: og.fallback
  };
  setUserState(userId, STATE.WAITING_FOR_CONFIRM, article);

  // 5. 回傳預覽卡片 + Quick Reply
  var previewText = warningPrefix +
    '📰 新聞預覽\n' +
    '標題：' + og.title + '\n' +
    '來源：' + og.siteName + '\n' +
    '分類：' + category + '\n\n' +
    summary;

  replyMessage(replyToken, [
    textMessage(previewText),
    buildPreviewFlex(article, confirmSaveQR())
  ]);
}

// ─────────────────────────────────────────────
// 內部：確認存入
// ─────────────────────────────────────────────

function _confirmSave(userId, replyToken) {
  var article = getPendingArticle(userId);
  if (!article) {
    replyMessage(replyToken, [textMessage('操作已逾時，請重新傳送連結。')]);
    return;
  }
  clearUserState(userId);
  var pageId = saveToNotion(article);
  if (pageId) {
    replyMessage(replyToken, [textMessage('✅ 已儲存至知識庫！\n「' + article.title + '」')]);
  } else {
    replyMessage(replyToken, [textMessage('❌ 儲存失敗，請稍後再試。')]);
  }
}

// ─────────────────────────────────────────────
// 內部：手動分類提示
// ─────────────────────────────────────────────

function _promptManualCategory(userId, replyToken) {
  var article = getPendingArticle(userId);
  if (!article) {
    replyMessage(replyToken, [textMessage('操作已逾時，請重新傳送連結。')]);
    return;
  }
  // 切換狀態至等待分類，保留文章資料
  setUserState(userId, STATE.WAITING_FOR_CATEGORY, article);
  replyMessage(replyToken, [
    textMessage('請選擇分類：', categoryQR())
  ]);
}

// ─────────────────────────────────────────────
// 內部：套用手動分類後寫入
// ─────────────────────────────────────────────

function _applyManualCategory(userId, replyToken, category) {
  var stateObj = getUserState(userId);
  if (!stateObj || !stateObj.data || !stateObj.data.url) {
    replyMessage(replyToken, [textMessage('操作已逾時，請重新傳送連結。')]);
    return;
  }

  // 選「其他」→ 讓使用者自行輸入分類名稱
  if (category === '其他') {
    setUserState(userId, STATE.WAITING_FOR_CUSTOM_CATEGORY, stateObj.data);
    replyMessage(replyToken, [textMessage('請輸入自訂分類名稱：')]);
    return;
  }

  var article = stateObj.data;
  article.category = category;
  clearUserState(userId);

  var pageId = saveToNotion(article);
  if (pageId) {
    replyMessage(replyToken, [textMessage('✅ 已以「' + category + '」分類儲存！\n「' + article.title + '」')]);
  } else {
    replyMessage(replyToken, [textMessage('❌ 儲存失敗，請稍後再試。')]);
  }
}

// ─────────────────────────────────────────────
// 內部：更新現有 Notion 頁面
// ─────────────────────────────────────────────

function _updateExisting(userId, replyToken) {
  var article = getPendingArticle(userId);
  if (!article) {
    replyMessage(replyToken, [textMessage('操作已逾時，請重新傳送連結。')]);
    return;
  }
  // 若尚未有 AI 結果，補跑一次
  if (!article.summary || article.summary === '（AI 摘要產生失敗）') {
    var ai = generateSummaryAndCategory(article.title, '');
    if (ai) {
      article.category = ai.category;
      article.summary = ai.summary;
    }
  }
  clearUserState(userId);
  updateNotionPage(article.existingPageId, article);
  replyMessage(replyToken, [textMessage('✅ 已更新現有紀錄！\n「' + article.title + '」')]);
}

// ─────────────────────────────────────────────
// 內部：強制重複儲存
// ─────────────────────────────────────────────

function _forceSave(userId, replyToken) {
  var article = getPendingArticle(userId);
  if (!article) {
    replyMessage(replyToken, [textMessage('操作已逾時，請重新傳送連結。')]);
    return;
  }
  // 補跑 AI（若資料中沒有）
  if (!article.summary) {
    var ai = generateSummaryAndCategory(article.title, '');
    if (ai) {
      article.category = ai.category;
      article.summary = ai.summary;
    } else {
      article.category = '其他';
      article.summary = '（AI 摘要產生失敗）';
    }
  }
  clearUserState(userId);
  var pageId = saveToNotion(article);
  if (pageId) {
    replyMessage(replyToken, [textMessage('✅ 已強制重複儲存！\n「' + article.title + '」')]);
  } else {
    replyMessage(replyToken, [textMessage('❌ 儲存失敗，請稍後再試。')]);
  }
}

// ─────────────────────────────────────────────
// 內部：搜尋處理
// ─────────────────────────────────────────────

function _handleSearch(replyToken, keyword) {
  var results = searchNotion(keyword);
  if (results.length === 0) {
    replyMessage(replyToken, [textMessage('找不到與「' + keyword + '」相關的新聞，請嘗試其他關鍵字。')]);
  } else {
    replyMessage(replyToken, [buildSearchCarousel(results)]);
  }
}

// ─────────────────────────────────────────────
// 工具：清除 URL 追蹤參數
// ─────────────────────────────────────────────

var TRACKING_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid','_ga','ref','referrer'];

function _normalizeUrl(url) {
  try {
    var hashIndex = url.indexOf('#');
    var hash = hashIndex !== -1 ? url.slice(hashIndex) : '';
    var base = hashIndex !== -1 ? url.slice(0, hashIndex) : url;
    var qIndex = base.indexOf('?');
    if (qIndex === -1) return base + hash;
    var origin = base.slice(0, qIndex);
    var params = base.slice(qIndex + 1).split('&').filter(function(p) {
      return TRACKING_PARAMS.indexOf(p.split('=')[0].toLowerCase()) === -1;
    });
    return origin + (params.length ? '?' + params.join('&') : '') + hash;
  } catch (e) {
    return url;
  }
}

// ─────────────────────────────────────────────
// 工具：解析 query string
// ─────────────────────────────────────────────

function _parseQueryString(qs) {
  var result = {};
  if (!qs) return result;
  qs.split('&').forEach(function(pair) {
    var parts = pair.split('=');
    if (parts.length >= 2) {
      result[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
    }
  });
  return result;
}
