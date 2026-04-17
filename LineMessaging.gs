/**
 * LineMessaging.gs
 * 封裝所有 LINE Messaging API 呼叫與訊息組裝
 */

var LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

/**
 * 回覆訊息（Reply API）
 * @param {string} replyToken
 * @param {Array}  messages    - LINE message 物件陣列（最多 5 則）
 */
function replyMessage(replyToken, messages) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_ACCESS_TOKEN');

  var payload = {
    replyToken: replyToken,
    messages: messages
  };

  try {
    var response = UrlFetchApp.fetch(LINE_REPLY_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var debugMsg = 'status=' + response.getResponseCode() + ' body=' + response.getContentText();
    PropertiesService.getScriptProperties().setProperty('DEBUG_REPLY', debugMsg);
  } catch (e) {
    PropertiesService.getScriptProperties().setProperty('DEBUG_REPLY', 'ERROR: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// Quick Reply 工廠
// ─────────────────────────────────────────────

/**
 * 建立 Quick Reply 物件
 * @param {Array<{label, text, data}>} items
 *   label: 按鈕顯示文字
 *   text:  message action 傳送文字（非 postback 時使用）
 *   data:  postback data（若提供則改用 postback action）
 */
function buildQuickReply(items) {
  return {
    items: items.map(function(item) {
      var action = item.data
        ? { type: 'postback', label: item.label, data: item.data, displayText: item.label }
        : { type: 'message', label: item.label, text: item.text || item.label };
      return { type: 'action', action: action };
    })
  };
}

// ─────────────────────────────────────────────
// 文字訊息工廠
// ─────────────────────────────────────────────

function textMessage(text, quickReply) {
  var msg = { type: 'text', text: text };
  if (quickReply) msg.quickReply = quickReply;
  return msg;
}

// ─────────────────────────────────────────────
// 預覽卡片（Bubble Flex Message）
// ─────────────────────────────────────────────

/**
 * 建立新聞預覽 Flex Bubble
 * @param {object} article { title, siteName, category, summary, url, image, fallback }
 * @param {object} quickReply  Quick Reply 物件（可 null）
 */
function buildPreviewFlex(article, quickReply) {
  var bubble = _buildBubble(article);

  var msg = {
    type: 'flex',
    altText: '新聞預覽：' + article.title,
    contents: bubble
  };
  if (quickReply) msg.quickReply = quickReply;
  return msg;
}

/**
 * 建立搜尋結果 Flex Carousel（最多 5 張卡片）
 * @param {Array} articles  searchNotion 回傳的陣列
 */
function buildSearchCarousel(articles) {
  if (!articles || articles.length === 0) {
    return textMessage('找不到相關新聞，請嘗試其他關鍵字。');
  }

  var bubbles = articles.map(function(a) { return _buildBubble(a); });

  return {
    type: 'flex',
    altText: '搜尋結果（共 ' + bubbles.length + ' 筆）',
    contents: {
      type: 'carousel',
      contents: bubbles
    }
  };
}

/** 內部：組裝單張 Bubble */
function _buildBubble(article) {
  var body = {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: []
  };

  // 標籤列
  body.contents.push({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: article.category || '其他',
        size: 'xs',
        color: '#ffffff',
        align: 'center',
        gravity: 'center',
        wrap: false,
        flex: 0
      }
    ],
    backgroundColor: '#1DB446',
    paddingAll: '6px',
    cornerRadius: '4px'
  });

  // 標題
  body.contents.push({
    type: 'text',
    text: article.title || '（無標題）',
    weight: 'bold',
    size: 'sm',
    wrap: true,
    maxLines: 3,
    margin: 'sm'
  });

  // 媒體來源
  if (article.siteName) {
    body.contents.push({
      type: 'text',
      text: article.siteName,
      size: 'xs',
      color: '#aaaaaa',
      margin: 'xs'
    });
  }

  // 摘要（換行轉空格，超過 300 字截斷）
  if (article.summary) {
    var rawSummary = Array.isArray(article.summary) ? article.summary.join(' ') : String(article.summary || '');
    var summaryText = rawSummary.replace(/\n/g, ' ').substring(0, 300);
    body.contents.push({
      type: 'text',
      text: summaryText,
      size: 'xs',
      color: '#555555',
      wrap: true,
      margin: 'sm'
    });
  }

  var bubble = {
    type: 'bubble',
    size: 'kilo',
    body: body,
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'link',
          height: 'sm',
          action: {
            type: 'uri',
            label: '閱讀原文',
            uri: article.url || 'https://line.me'
          }
        }
      ],
      spacing: 'sm',
      paddingAll: '13px'
    }
  };

  // 封面圖（若有）
  if (article.image) {
    bubble.hero = {
      type: 'image',
      url: article.image,
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover'
    };
  }

  return bubble;
}

// ─────────────────────────────────────────────
// 常用 Quick Reply 組合
// ─────────────────────────────────────────────

/** 儲存確認 Quick Reply */
function confirmSaveQR() {
  return buildQuickReply([
    { label: '✅ 確認存入', data: 'action=confirm_save' },
    { label: '✏️ 手動修改分類', data: 'action=manual_category' },
    { label: '❌ 取消作業', data: 'action=cancel' }
  ]);
}

/** 重複 URL 處理 Quick Reply */
function duplicateQR() {
  return buildQuickReply([
    { label: '忽略', data: 'action=ignore' },
    { label: '更新現有紀錄', data: 'action=update_existing' },
    { label: '強制重複儲存', data: 'action=force_save' }
  ]);
}

/** 手動分類選單 Quick Reply */
function categoryQR() {
  return buildQuickReply([
    { label: '科技', data: 'action=set_category&cat=科技' },
    { label: '財經', data: 'action=set_category&cat=財經' },
    { label: '工具', data: 'action=set_category&cat=工具' },
    { label: '其他', data: 'action=set_category&cat=其他' }
  ]);
}
