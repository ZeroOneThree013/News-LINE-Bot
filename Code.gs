/**
 * Code.gs
 * Google Apps Script 主要入口
 *
 * 部署方式：
 *   1. 開啟 Apps Script 專案，將所有 .gs 檔案內容複製進對應的檔案
 *   2. 設定 Script Properties（專案設定 → 指令碼屬性）：
 *        LINE_ACCESS_TOKEN  - LINE Channel Access Token
 *        GROQ_API_KEY       - Groq API Key
 *        NOTION_API_KEY     - Notion Integration Secret
 *        NOTION_DB_ID       - Notion Database ID
 *   3. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *        執行身分：我（your account）
 *        存取權限：任何人
 *   4. 將網頁應用程式 URL 貼至 LINE Developers Console 的 Webhook URL
 *   5. 另行在 LINE Developers Console 建立 Rich Menu，
 *      搜尋按鈕的 Postback data 設為 action=trigger_search
 */

/**
 * LINE Webhook 接收入口
 * GAS 網頁應用程式的 POST 處理函式（名稱必須為 doPost）
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var events = body.events || [];

    // 儲存最後一筆事件供除錯使用
    PropertiesService.getScriptProperties().setProperty('DEBUG_LAST_EVENTS', JSON.stringify(events));

    events.forEach(function(event) {
      try {
        _routeEvent(event);
      } catch (err) {
        PropertiesService.getScriptProperties().setProperty('DEBUG_LAST_ERROR', err.message + '\n' + JSON.stringify(event));
      }
    });

  } catch (err) {
    Logger.log('doPost 解析錯誤: ' + err.message);
  }

  // LINE Webhook 要求回傳 200
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 依事件類型分發至對應的處理函式
 */
function _routeEvent(event) {
  var type = event.type;

  if (type === 'message' && event.message.type === 'text') {
    handleMessage(event);
    return;
  }

  if (type === 'postback') {
    handlePostback(event);
    return;
  }

  // follow / unfollow / join 等事件目前不處理
  Logger.log('略過事件類型: ' + type);
}

/**
 * GET 請求（LINE Webhook 驗證用）
 */
function doGet(e) {
  return ContentService
    .createTextOutput('LINE Bot is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 讀取最後一筆 Webhook debug 資訊
 */
function readDebug() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('=== 最後收到的事件 ===');
  Logger.log(props.getProperty('DEBUG_LAST_EVENTS') || '無');
  Logger.log('=== 最後錯誤 ===');
  Logger.log(props.getProperty('DEBUG_LAST_ERROR') || '無');
  Logger.log('=== Reply API 回應 ===');
  Logger.log(props.getProperty('DEBUG_REPLY') || '無');
  Logger.log('=== Notion 寫入錯誤 ===');
  Logger.log(props.getProperty('DEBUG_NOTION_ERROR') || '無');
}

/**
 * 測試函式：直接對使用者發送 Push Message（不需要 replyToken）
 * 執行前先確認 userId 正確
 */
function testPush() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_ACCESS_TOKEN');
  var userId = 'U03c96902916feaf5d6a64157fb47429d'; // 從 debug 取得的 userId

  var payload = {
    to: userId,
    messages: [{ type: 'text', text: '✅ Push 測試成功！Bot 可以正常傳送訊息。' }]
  };

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('Push status: ' + response.getResponseCode());
  Logger.log('Push body: ' + response.getContentText());
}

/**
 * 測試函式：直接在 GAS 編輯器點「執行」來確認 LINE token 是否有效
 * 執行後在下方「執行記錄」查看結果
 */
function testLineToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_ACCESS_TOKEN');
  Logger.log('TOKEN 前10碼: ' + (token ? token.substring(0, 10) + '...' : '未設定'));

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  Logger.log('HTTP Status: ' + response.getResponseCode());
  Logger.log('Response: ' + response.getContentText());
}
