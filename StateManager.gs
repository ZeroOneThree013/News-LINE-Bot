/**
 * StateManager.gs
 * 管理每位使用者的操作狀態（搜尋中、等待分類輸入等）
 * 使用 PropertiesService.getScriptProperties() 儲存
 *
 * 狀態常數：
 *   WAITING_FOR_SEARCH    - 等待使用者輸入搜尋關鍵字
 *   WAITING_FOR_CATEGORY  - 等待使用者選擇手動分類
 *   WAITING_FOR_DUPLICATE - 等待使用者決定重複 URL 的處理方式
 *   WAITING_FOR_CONFIRM   - 等待使用者確認存入（儲存預覽資料暫存中）
 */

var STATE = {
  WAITING_FOR_SEARCH: 'WAITING_FOR_SEARCH',
  WAITING_FOR_CATEGORY: 'WAITING_FOR_CATEGORY',
  WAITING_FOR_CUSTOM_CATEGORY: 'WAITING_FOR_CUSTOM_CATEGORY',
  WAITING_FOR_DUPLICATE: 'WAITING_FOR_DUPLICATE',
  WAITING_FOR_CONFIRM: 'WAITING_FOR_CONFIRM'
};

var STATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 分鐘

/**
 * 取得使用者狀態物件 { state, data, timestamp }
 * 若狀態已逾時，自動清除並回傳 null
 */
function getUserState(userId) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('state_' + userId);
  if (!raw) return null;

  try {
    var obj = JSON.parse(raw);
    var now = new Date().getTime();
    if (now - obj.timestamp > STATE_TIMEOUT_MS) {
      clearUserState(userId);
      return null;
    }
    return obj;
  } catch (e) {
    clearUserState(userId);
    return null;
  }
}

/**
 * 設定使用者狀態
 * @param {string} userId
 * @param {string} state  - STATE 常數之一
 * @param {object} data   - 任意附帶資料（待存文章資訊等）
 */
function setUserState(userId, state, data) {
  var props = PropertiesService.getScriptProperties();
  var obj = {
    state: state,
    data: data || {},
    timestamp: new Date().getTime()
  };
  props.setProperty('state_' + userId, JSON.stringify(obj));
}

/**
 * 清除使用者狀態
 */
function clearUserState(userId) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('state_' + userId);
}

/**
 * 讀取暫存於狀態中的文章資料
 */
function getPendingArticle(userId) {
  var stateObj = getUserState(userId);
  if (!stateObj) return null;
  return stateObj.data || null;
}
