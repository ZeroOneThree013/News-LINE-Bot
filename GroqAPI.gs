/**
 * GroqAPI.gs
 * 呼叫 Groq API（OpenAI 相容格式）
 * 模型：llama-3.3-70b-versatile
 * 輸出：JSON Mode，格式 { "category": "...", "summary": "1. ...\n2. ...\n3. ..." }
 */

var GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
var GROQ_MODEL = 'llama-3.3-70b-versatile';
var FIXED_CATEGORIES = ['科技', '財經', '工具', '其他'];

/**
 * 呼叫 Groq 產生摘要與分類
 * @param {string} title   - 文章標題（OG title 或網域）
 * @param {string} content - 文章內文（可為空字串，此時以 URL 替代）
 * @returns {{ category: string, summary: string }} 或 null（失敗時）
 */
function generateSummaryAndCategory(title, content) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GROQ_API_KEY');
  if (!apiKey) {
    Logger.log('GROQ_API_KEY 未設定');
    return null;
  }

  var userContent = '標題：' + title + '\n\n';
  if (content && content.trim().length > 0) {
    // 內文截斷至 3000 字，避免超出 token 限制
    userContent += '內文：' + content.trim().substring(0, 3000);
  } else {
    userContent += '（無法取得內文，請僅依標題判斷）';
  }

  var systemPrompt =
    '你是一位專業新聞分類助理。請根據使用者提供的文章標題與內文，完成以下兩件事：\n' +
    '1. 將文章歸類至以下固定分類之一：科技、財經、工具、其他。若文章完全不屬於上述分類，請自行生成一個精簡的單一新標籤（繁體中文，不超過 4 字）。\n' +
    '2. 以繁體中文產出 3 點精煉摘要，每點不超過 40 字，務必抓住核心資訊。\n\n' +
    '請**嚴格**以 JSON 格式回傳，不得包含任何額外文字：\n' +
    '{"category": "標籤名稱", "summary": "1. ...\n2. ...\n3. ..."}';

  var payload = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 512
  };

  try {
    var response = UrlFetchApp.fetch(GROQ_API_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code !== 200) {
      Logger.log('Groq API 錯誤 ' + code + ': ' + body);
      return null;
    }

    var json = JSON.parse(body);
    var text = json.choices[0].message.content;
    var result = JSON.parse(text);

    if (!result.category || !result.summary) {
      Logger.log('Groq 回傳格式異常：' + text);
      return null;
    }

    return {
      category: String(result.category),
      summary: Array.isArray(result.summary)
        ? result.summary.join('\n')
        : String(result.summary)
    };

  } catch (e) {
    Logger.log('generateSummaryAndCategory error: ' + e.message);
    return null;
  }
}
