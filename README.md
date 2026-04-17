# LINE Bot 新聞知識庫蒐集系統

透過 LINE Bot 傳送新聞連結，自動擷取標題、產生 AI 摘要與分類，並儲存至 Notion 知識庫。

---

## 功能

- **儲存新聞**：傳送網址或含網址的轉傳訊息，Bot 自動擷取 OG 資訊、呼叫 AI 產生摘要與分類，確認後存入 Notion
- **查重機制**：同一網址已存在時提示選擇（忽略 / 更新 / 強制重複儲存）
- **搜尋知識庫**：點選 Rich Menu 搜尋按鈕，輸入關鍵字查詢標題或分類標籤
- **手動修改分類**：預覽階段可手動調整 AI 分類，或輸入自訂分類名稱
- **Rich Menu**：底部選單提供「搜尋」與「使用說明」快捷按鈕

---

## 技術架構

| 元件 | 說明 |
|------|------|
| Google Apps Script | 後端邏輯與 Webhook 接收 |
| LINE Messaging API | Bot 訊息收發、Rich Menu |
| Groq API (LLaMA 3.3 70B) | AI 摘要與分類 |
| Notion API | 知識庫讀寫、查重、搜尋 |
| clasp | 本機程式碼同步至 GAS |

---

## 檔案結構

```
├── Code.gs             # GAS 主入口（doPost / doGet）
├── MessageHandler.gs   # 核心訊息處理邏輯
├── LineMessaging.gs    # LINE API 封裝、Flex Message 組裝
├── OGScraper.gs        # 網頁 OG 標籤擷取
├── GroqAPI.gs          # Groq AI 摘要與分類
├── NotionAPI.gs        # Notion 資料庫讀寫
├── StateManager.gs     # 使用者操作狀態管理
├── RichMenu.gs         # Rich Menu 自動建立
└── appsscript.json     # GAS 專案設定
```

---

## 部署步驟

### 1. 前置準備

- [LINE Developers Console](https://developers.line.biz/) 建立 Messaging API Channel，取得 **Channel Access Token**
- [Groq Console](https://console.groq.com/) 取得 **API Key**
- [Notion](https://www.notion.so/) 建立 Integration，取得 **Integration Secret** 與目標資料庫的 **Database ID**

### 2. Notion 資料庫欄位

| 欄位名稱 | 類型 |
|----------|------|
| 標題 | Title |
| 媒體來源 | Select |
| 分類標籤 | Multi-select |
| AI 摘要 | Rich Text |
| 原始連結 | URL |
| 封面圖 | URL |
| 個人備註 | Rich Text |
| 儲存日期 | Date |

### 3. 部署 GAS

```bash
# 安裝 clasp（需 Node.js）
npm install -g @google/clasp

# 登入 Google 帳號
clasp login

# 推送程式碼
clasp push
```

### 4. 設定指令碼屬性

在 GAS 編輯器 → 專案設定 → 指令碼屬性，新增以下四項：

| 屬性名稱 | 說明 |
|----------|------|
| `LINE_ACCESS_TOKEN` | LINE Channel Access Token |
| `GROQ_API_KEY` | Groq API Key |
| `NOTION_API_KEY` | Notion Integration Secret |
| `NOTION_DB_ID` | Notion Database ID |

### 5. 部署網頁應用程式

GAS 編輯器 → 部署 → 新增部署作業
- 類型：**網頁應用程式**
- 執行身分：**我**
- 存取權限：**任何人**

複製產生的 URL，貼至 LINE Developers Console 的 **Webhook URL**。

### 6. 建立 Rich Menu

1. 製作 **2500×843 px** 選單圖片（PNG 或 JPG，小於 1MB），左半為搜尋區、右半為說明區
2. 上傳至 Google Drive，設定為「知道連結的人可以查看」
3. 從 Drive 網址複製 File ID（`/d/` 後面的字串）
4. 在指令碼屬性新增 `RICHMENU_IMAGE_FILE_ID` = 上述 File ID
5. 在 GAS 編輯器執行 `setupRichMenu()`

---

## 使用說明

| 操作 | 方式 |
|------|------|
| 儲存新聞 | 直接傳送網址，或轉傳含網址的訊息 |
| 搜尋知識庫 | 點選 Rich Menu「🔍 搜尋」→ 輸入關鍵字 |
| 修改分類 | 預覽卡片出現後點選「✏️ 手動修改分類」 |
| 查看說明 | 點選 Rich Menu「📖 使用說明」 |

---

## 除錯

GAS 編輯器執行 `readDebug()` 可查看最後一筆 Webhook 事件、錯誤訊息及 Notion 寫入狀態。
