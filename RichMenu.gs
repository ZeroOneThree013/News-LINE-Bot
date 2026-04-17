/**
 * RichMenu.gs
 * 一鍵建立 LINE Rich Menu（兩個按鈕：搜尋 / 使用說明）
 *
 * 執行前準備：
 *   1. 製作 2500×843 px 的選單圖片（PNG 或 JPG，小於 1MB）
 *   2. 上傳至 Google Drive → 右鍵「共用」→「知道連結的人」可以查看
 *   3. 從網址複製 File ID（/d/ 與 /view 之間的字串）
 *   4. 在 GAS「指令碼屬性」新增：
 *        RICHMENU_IMAGE_FILE_ID = <上面的 File ID>
 *   5. 在 GAS 編輯器點「執行」→ setupRichMenu
 */

// ─────────────────────────────────────────────
// 主要入口：建立並套用 Rich Menu
// ─────────────────────────────────────────────

function setupRichMenu() {
  var props = PropertiesService.getScriptProperties();
  var token  = props.getProperty('LINE_ACCESS_TOKEN');
  var fileId = props.getProperty('RICHMENU_IMAGE_FILE_ID');

  if (!token)  { Logger.log('❌ LINE_ACCESS_TOKEN 未設定'); return; }
  if (!fileId) {
    Logger.log('❌ RICHMENU_IMAGE_FILE_ID 未設定');
    Logger.log('   請上傳選單圖片至 Google Drive，將 File ID 寫入指令碼屬性後再執行');
    return;
  }

  // Step 1 - 建立選單結構
  var richMenuId = _createRichMenuStructure(token);
  if (!richMenuId) return;
  Logger.log('✅ 結構建立完成，ID: ' + richMenuId);

  // Step 2 - 上傳圖片
  if (!_uploadRichMenuImage(token, richMenuId, fileId)) return;
  Logger.log('✅ 圖片上傳完成');

  // Step 3 - 設為全體預設選單
  if (!_setDefaultRichMenu(token, richMenuId)) return;

  props.setProperty('RICHMENU_ID', richMenuId);
  Logger.log('✅ Rich Menu 設定完成！所有使用者將看到新選單');
}

// ─────────────────────────────────────────────
// 刪除現有 Rich Menu（重設前可先執行）
// ─────────────────────────────────────────────

function deleteRichMenu() {
  var props = PropertiesService.getScriptProperties();
  var token      = props.getProperty('LINE_ACCESS_TOKEN');
  var richMenuId = props.getProperty('RICHMENU_ID');

  if (!richMenuId) { Logger.log('RICHMENU_ID 未設定，略過'); return; }

  try {
    var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + richMenuId, {
      method: 'delete',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    Logger.log('刪除結果: ' + response.getResponseCode() + ' ' + response.getContentText());
    props.deleteProperty('RICHMENU_ID');
  } catch (e) {
    Logger.log('deleteRichMenu error: ' + e.message);
  }
}

// ─────────────────────────────────────────────
// 內部：建立 Rich Menu JSON 結構
// ─────────────────────────────────────────────

function _createRichMenuStructure(token) {
  var richMenu = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: '新聞知識庫選單',
    chatBarText: '📋 選單',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 1250, height: 843 },
        action: {
          type: 'postback',
          data: 'action=trigger_search',
          displayText: '🔍 搜尋知識庫'
        }
      },
      {
        bounds: { x: 1250, y: 0, width: 1250, height: 843 },
        action: {
          type: 'message',
          text: '使用說明'
        }
      }
    ]
  };

  try {
    var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(richMenu),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('❌ 結構建立失敗 ' + code + ': ' + response.getContentText());
      return null;
    }
    return JSON.parse(response.getContentText()).richMenuId;
  } catch (e) {
    Logger.log('❌ _createRichMenuStructure error: ' + e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// 內部：從 Google Drive 取得圖片並上傳至 LINE
// ─────────────────────────────────────────────

function _uploadRichMenuImage(token, richMenuId, fileId) {
  try {
    var file        = DriveApp.getFileById(fileId);
    var blob        = file.getBlob();
    var contentType = blob.getContentType() || 'image/png';

    var response = UrlFetchApp.fetch(
      'https://api-data.line.me/v2/bot/richmenu/' + richMenuId + '/content',
      {
        method: 'post',
        contentType: contentType,
        headers: { 'Authorization': 'Bearer ' + token },
        payload: blob.getBytes(),
        muteHttpExceptions: true
      }
    );
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('❌ 圖片上傳失敗 ' + code + ': ' + response.getContentText());
      return false;
    }
    return true;
  } catch (e) {
    Logger.log('❌ _uploadRichMenuImage error: ' + e.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// 內部：設為全體使用者預設選單
// ─────────────────────────────────────────────

function _setDefaultRichMenu(token, richMenuId) {
  try {
    var response = UrlFetchApp.fetch(
      'https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId,
      {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      }
    );
    var code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('❌ 設為預設失敗 ' + code + ': ' + response.getContentText());
      return false;
    }
    Logger.log('✅ 已設為全體預設選單');
    return true;
  } catch (e) {
    Logger.log('❌ _setDefaultRichMenu error: ' + e.message);
    return false;
  }
}
