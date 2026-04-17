/**
 * OGScraper.gs
 * 擷取網頁 <head> 中的 Open Graph 標籤：og:title、og:image、og:site_name
 * 若抓取失敗，啟動 Fallback：以網域名稱填入標題與媒體來源，封面圖留空
 */

/**
 * 主要進入點：抓取 OG 資訊
 * @param {string} url
 * @returns {{ title, image, siteName, fallback }}
 *   fallback = true 表示觸發了 Fallback 流程
 */
function fetchOGData(url) {
  var result = {
    title: '',
    description: '',
    image: '',
    siteName: '',
    fallback: false
  };

  try {
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GAS-NewsBot/1.0)'
      }
    });

    if (response.getResponseCode() !== 200) {
      return _fallback(url);
    }

    var html = response.getContentText('UTF-8');
    // 只解析 <head> 區塊，避免全文掃描耗時
    var headMatch = html.match(/<head[\s\S]*?<\/head>/i);
    var head = headMatch ? headMatch[0] : html;

    var title = _extractOG(head, 'og:title') || _extractTag(head, 'title');
    var description = _extractOG(head, 'og:description') || _extractMeta(head, 'description');
    var image = _extractOG(head, 'og:image');
    var siteName = _extractOG(head, 'og:site_name');

    if (!title) {
      return _fallback(url);
    }

    result.title = title;
    result.description = description || '';
    result.image = image || '';
    result.siteName = siteName || _extractDomain(url);
    return result;

  } catch (e) {
    Logger.log('fetchOGData error: ' + e.message);
    return _fallback(url);
  }
}

/** 抽取 og:<property> 內容 */
function _extractOG(head, property) {
  var re = new RegExp(
    '<meta[^>]+property=["\']' + property + '["\'][^>]+content=["\']([^"\']*)["\']',
    'i'
  );
  var m = head.match(re);
  if (m) return m[1].trim();

  // 另一種屬性順序
  re = new RegExp(
    '<meta[^>]+content=["\']([^"\']*)["\'][^>]+property=["\']' + property + '["\']',
    'i'
  );
  m = head.match(re);
  return m ? m[1].trim() : '';
}

/** 抽取 <meta name="..."> 的 content */
function _extractMeta(head, name) {
  var re = new RegExp('<meta[^>]+name=["\']' + name + '["\'][^>]+content=["\']([^"\']*)["\']', 'i');
  var m = head.match(re);
  if (m) return m[1].trim();
  re = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']' + name + '["\']', 'i');
  m = head.match(re);
  return m ? m[1].trim() : '';
}

/** 抽取 <title> 標籤文字 */
function _extractTag(head, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([^<]*)<\\/' + tag + '>', 'i');
  var m = head.match(re);
  return m ? m[1].trim() : '';
}

/** 從 URL 解析網域名稱（如 technews.tw） */
function _extractDomain(url) {
  try {
    var m = url.match(/^https?:\/\/([^\/]+)/i);
    if (!m) return url;
    var host = m[1].replace(/^www\./, '');
    return host;
  } catch (e) {
    return url;
  }
}

/** Fallback：以網域填入，封面圖留空 */
function _fallback(url) {
  var domain = _extractDomain(url);
  return {
    title: domain,
    image: '',
    siteName: domain,
    fallback: true
  };
}
