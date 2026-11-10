# dsh-locale-zh-tw-hant

DeepSeek Harness（DSH）Web 介面的**繁體中文（台灣）**語言包。

不是逐字簡轉繁：字串以 OpenCC `s2twp`（台灣詞組）轉換，再套一層台灣軟體介面用語表，例如

| 簡中 | 繁體（台灣） |
| --- | --- |
| 会话 | 對話 |
| 审批 | 核准 |
| 许可权 | 權限 |
| 智能体 | 智慧代理 |
| 插件 | 外掛 |
| 文件 / 文件夹 | 檔案 / 資料夾 |
| 默认 / 设置 | 預設 / 設定 |
| 搜索 / 加载 / 缓存 | 搜尋 / 載入 / 快取 |
| 网络 / 代码 / 终端 | 網路 / 程式碼 / 終端機 |
| 反馈 / 自定义 | 回饋 / 自訂 |

- **72 個命名空間、3,825 條字串**，涵蓋側邊欄、對話、設定、模型、外掛、排程、工具呼叫等介面
- 語言偏好寫入 DSH 的 `locale.preference`，重開後仍保持繁體
- 使用官方語言包 API（`locale.addLanguage` + `locale.register`），不修改 DSH 內部欄位
- 未翻譯到的字串會自動回退到內建簡中字典，不會露出英文或 key

## 安裝

需求：DSH Desktop `0.2.2-rc.1`（或相容版本）。

```bash
# 1. 取得套件
git clone https://github.com/Lorin1470/dsh-locale-zh-tw-hant.git
cd dsh-locale-zh-tw-hant

# 2. 放進 profile 的 node_modules
PROFILE="$HOME/.dsh/profiles/desktop"
cp -R . "$PROFILE/node_modules/dsh-locale-zh-tw-hant"
```

3. 編輯 `$PROFILE/package.json`，把套件加入 bundle 清單：

```json
{
  "dependencies": {
    "dsh-locale-zh-tw-hant": "file:./node_modules/dsh-locale-zh-tw-hant"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-locale-zh-tw-hant"
      ]
    }
  }
}
```

4. 重新啟動 DSH，然後到 **Settings → General → Language** 選 **繁體中文**。

> 也可以發佈到 npm 後用 `dsh plugin --profile desktop add dsh-locale-zh-tw-hant` 安裝。

## 切換／移除

- 切回其他語言：Settings → General → Language。
- 移除：從 `dsh.profile.bundles` 拿掉 `dsh-locale-zh-tw-hant`，刪除 `node_modules/dsh-locale-zh-tw-hant`，重新啟動。

## 運作原理

DSH 的每個前端外掛會註冊自己的 `zh` / `en` / `ja` … 字典。這個套件在瀏覽器端：

1. `locale.addLanguage({ id: "zh-TW", label: "繁體中文", fallback: "zh" })`
2. 對每個命名空間 `locale.register(ns, "zh-TW", dict)`
3. 查表時走 `zh-TW → zh → en` 的 fallback 鏈

字典在 `locale/zh-tw.json`，由 `scripts/extract-from-app.mjs` 從 App 內建的 `zh` 字典抽出後轉換；`lib/client.js` 由 `scripts/build.mjs` 產生（已提交，安裝時不需建置）。

## 重新產生字典

App 更新後若想補上新字串：

```bash
npm install
npm run extract     # 從 /Applications/DeepSeek Harness.app 重新抽取 + 轉換
npm run build       # 重新產生 lib/client.js
```

`extract` 會列出掃到的 bundle 數、命名空間數與字串數；若有字串的 `{placeholder}` 集合被改動會提出警告。

## 已知限制

- 少數在「註冊時就固定」的文案（例如部分指令說明）可能要重新啟動 App 才會套用新語言。
- 第三方外掛自帶的文字不在抽取範圍，會顯示原文。
- 專有名詞（DeepSeek、Agent、Session Log、MCP 等）保留原文。
- 這是社群語言包，不是 DeepSeek 官方發佈。

## 開發

```
lib/index.js               Host 端（僅維持 Loader entry，無邏輯）
lib/client.js              瀏覽器端語言包（由 build 產生）
locale/zh-tw.json          72 個命名空間的繁中字典
scripts/extract-from-app.mjs  從 app.asar 抽取 + OpenCC 轉換（維護者工具）
scripts/build.mjs          由 JSON 產生 lib/client.js
```

## 授權

[MIT](LICENSE)
