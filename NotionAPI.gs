/**
 * NotionAPI.gs
 * 封裝所有 Notion API 操作：查重、寫入、搜尋
 * Notion API Version: 2022-06-28
 *
 * Notion DB Schema（欄位名稱對應）：
 *   標題        Title
 *   媒體來源    Select
 *   分類標籤    Multi-select
 *   AI 摘要     Rich Text
 *   原始連結    URL
 *   封面圖      URL
 *   個人備註    Rich Text
 *   儲存日期    Date
 */

var NOTION_VERSION = '2022-06-28';
var NOTION_BASE = 'https://api.notion.com/v1';

/** 取得 Notion 共用 Headers */
function _notionHeaders() {
  var props = PropertiesService.getScriptProperties();
  return {
    'Authorization': 'Bearer ' + props.getProperty('NOTION_API_KEY'),
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION
  };
}

/** 取得 DB ID */
function _dbId() {
  return PropertiesService.getScriptProperties().getProperty('NOTION_DB_ID');
}

/**
 * 查詢 URL 是否已存在於 Notion 資料庫
 * @param {string} url
 * @returns {string|null} 已存在則回傳頁面 ID，否則回傳 null
 */
function checkDuplicate(url) {
  var payload = {
    filter: {
      property: '原始連結',
      url: { equals: url }
    },
    page_size: 1
  };

  try {
    var response = UrlFetchApp.fetch(NOTION_BASE + '/databases/' + _dbId() + '/query', {
      method: 'post',
      headers: _notionHeaders(),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var body = JSON.parse(response.getContentText());
    if (body.results && body.results.length > 0) {
      return body.results[0].id;
    }
    return null;
  } catch (e) {
    Logger.log('checkDuplicate error: ' + e.message);
    return null;
  }
}

/**
 * 寫入一筆新聞至 Notion 資料庫
 * @param {object} article
 *   { title, siteName, category, summary, url, image }
 * @returns {string|null} 成功回傳頁面 ID，失敗回傳 null
 */
function saveToNotion(article) {
  var now = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");

  var properties = {
    '標題': {
      title: [{ text: { content: article.title || '' } }]
    },
    '媒體來源': {
      select: { name: article.siteName || '' }
    },
    '分類標籤': {
      multi_select: [{ name: article.category || '其他' }]
    },
    'AI 摘要': {
      rich_text: [{ text: { content: (article.summary || '').substring(0, 1999) } }]
    },
    '原始連結': {
      url: article.url || null
    },
    '個人備註': {
      rich_text: []
    },
    '儲存日期': {
      date: { start: now }
    }
  };

  // 封面圖：使用 URL 型別（API 不支援直接上傳外部圖片至 Files & media）
  if (article.image) {
    properties['封面圖'] = { url: article.image };
  }

  var payload = {
    parent: { database_id: _dbId() },
    properties: properties
  };

  // 設定頁面封面圖（顯示於 Notion 頁面頂部）
  if (article.image) {
    payload.cover = {
      type: 'external',
      external: { url: article.image }
    };
  }

  try {
    var response = UrlFetchApp.fetch(NOTION_BASE + '/pages', {
      method: 'post',
      headers: _notionHeaders(),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = JSON.parse(response.getContentText());

    if (code === 200 || code === 201) {
      return body.id;
    }
    var errMsg = 'saveToNotion 失敗 ' + code + ': ' + response.getContentText();
    Logger.log(errMsg);
    PropertiesService.getScriptProperties().setProperty('DEBUG_NOTION_ERROR', errMsg);
    return null;
  } catch (e) {
    Logger.log('saveToNotion error: ' + e.message);
    return null;
  }
}

/**
 * 更新已存在頁面的分類標籤與摘要
 * @param {string} pageId
 * @param {object} article  { title, siteName, category, summary, url, image }
 */
function updateNotionPage(pageId, article) {
  var properties = {
    '標題': {
      title: [{ text: { content: article.title || '' } }]
    },
    '媒體來源': {
      select: { name: article.siteName || '' }
    },
    '分類標籤': {
      multi_select: [{ name: article.category || '其他' }]
    },
    'AI 摘要': {
      rich_text: [{ text: { content: article.summary || '' } }]
    }
  };

  if (article.image) {
    properties['封面圖'] = { url: article.image };
  }

  var patchBody = { properties: properties };

  // 同步更新頁面封面圖
  if (article.image) {
    patchBody.cover = {
      type: 'external',
      external: { url: article.image }
    };
  }

  try {
    UrlFetchApp.fetch(NOTION_BASE + '/pages/' + pageId, {
      method: 'patch',
      headers: _notionHeaders(),
      payload: JSON.stringify(patchBody),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('updateNotionPage error: ' + e.message);
  }
}

/**
 * 搜尋 Notion 資料庫，比對「標題」或「分類標籤」
 * @param {string} keyword
 * @returns {Array} 最多 5 筆結果，每筆為 { title, siteName, category, summary, url, image }
 */
function searchNotion(keyword) {
  var payload = {
    filter: {
      or: [
        {
          property: '標題',
          title: { contains: keyword }
        },
        {
          property: '分類標籤',
          multi_select: { contains: keyword }
        }
      ]
    },
    page_size: 5,
    sorts: [{ property: '儲存日期', direction: 'descending' }]
  };

  try {
    var response = UrlFetchApp.fetch(NOTION_BASE + '/databases/' + _dbId() + '/query', {
      method: 'post',
      headers: _notionHeaders(),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var body = JSON.parse(response.getContentText());
    if (!body.results) return [];

    return body.results.map(function(page) {
      var props = page.properties;
      return {
        title: _getText(props['標題'], 'title'),
        siteName: _getSelect(props['媒體來源']),
        category: _getMultiSelect(props['分類標籤']),
        summary: _getText(props['AI 摘要'], 'rich_text'),
        url: props['原始連結'] ? props['原始連結'].url : '',
        image: props['封面圖'] ? props['封面圖'].url : ''
      };
    });
  } catch (e) {
    Logger.log('searchNotion error: ' + e.message);
    return [];
  }
}

/** 輔助：取得 title / rich_text 的文字內容 */
function _getText(prop, type) {
  if (!prop || !prop[type] || prop[type].length === 0) return '';
  return prop[type].map(function(t) { return t.plain_text || t.text.content; }).join('');
}

/** 輔助：取得 select 名稱 */
function _getSelect(prop) {
  if (!prop || !prop.select) return '';
  return prop.select.name || '';
}

/** 輔助：取得第一個 multi_select 名稱 */
function _getMultiSelect(prop) {
  if (!prop || !prop.multi_select || prop.multi_select.length === 0) return '';
  return prop.multi_select[0].name || '';
}
