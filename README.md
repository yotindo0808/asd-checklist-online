# 自閉症檢核表 V4｜Netlify 工程測試版

**目前為測試程式，尚未通過專業逐題審核及個資安全驗收，不可輸入真實學生資料。**

本專案承接 V3 的介面與權限設計，改用 **Netlify 靜態網頁 + Netlify Functions + Netlify Database（PostgreSQL）**，個人電腦無須安裝 Python。正式計分始終停用。

## ⚠️ GitHub 儲存庫目前是 Public

已確認 `yotindo0808/asd-checklist-online` 目前為**公開儲存庫**。為避免直接公開原始量表題目，本儲存庫上傳的是**示範題庫（非原量表）**，僅用來測試完整互動流程。請不要以示範題作為施測工具，也不要輸入真實姓名或資料。

先於 GitHub Repository → Settings → General → Danger Zone → Change repository visibility，改成 **Private**。再由具授權權限的管理者以專業核對的原始題庫替換 `server/banks.js`。請勿加入任何真實學生資料、密碼或下載結果。

## Netlify 設定（需使用者在自己的帳號操作）

1. 至 Netlify → **Add new project → Import an existing project → GitHub**，選擇 `yotindo0808/asd-checklist-online`。
2. 使用此專案根目錄的 `netlify.toml`，發布資料夾為 `site/`，Function 位於 `netlify/functions/`。**不要選擇手動拖曳 HTML**，那樣無法建立後端。
3. 使用 Netlify **Credit-based plan**，Netlify Database 才可使用；資料庫會隨 `@netlify/database` 與 `netlify/database/migrations/` 在部署時建立及遷移。資料庫是持續性資源，會消耗計算與傳輸額度，不能視為零費用。請先檢查方案及費用。
4. 在 Netlify → Project configuration → Environment variables 建立兩個供 Functions 使用的安全變數：`ADMIN_PASSWORD`（至少14字）、`SESSION_PEPPER`（至少32字的獨立隨機字串），不要寫入 GitHub、聊天室或前端 JS。部署後如更改需重新部署。
5. 使用 Netlify 網址開啟首頁，輸入剛才設定的密碼。透過建立虛構個案邀請、另開裝置填答、提交、下載 CSV/JSON、A4 列印、刪除來驗收。請先確認管理端收到作答結果。

## 功能

- 心評端：單一密碼登入（2小時），建立三版本填答邀請、限時1至168小時、可加8字元驗證碼、撤銷、結果檢視、CSV/JSON、列印A4、確認領取及刪除。
- 家長／教師：限時連結、免帳號、四選一、草稿、漏答檢查、提交後不可再填。
- 伺服器：邀請 token 只保存雜湊、重複提交原子拒絕、管理登入限速、資料依期限禁止存取並定期清理（每日台灣時間02:00）。清理不等於清除第三方平台備份。
- 計分：**未核定，不自動產生分數或鑑定結果**。
- 第二、第三階段：僅保留後續整合規劃，尚未實作。

## 預覽與正式使用差異

此 GitHub 儲存庫裡的 `server/banks.js` 是**示範題庫**，顯示「示範作答題第N題」；原始學前50、低年級47、中年級以上47題題幹未在此公開庫內提供。切換為 Private 後才能置換真正題庫（仍須確認使用授權）。

## 測試

在 GitHub Codespaces 的終端機（Node 22+，不需 Python）：

```bash
node --check site/app.js
node --check server/core.js
node --test tests/*.test.mjs
```

## 安全限制

單一管理密碼不是多因素驗證，若涉及真實學生資料，還需機構個資核可、安全測試、存取稽核、備份刪除策略及量表使用授權。Netlify 資料庫分支可能在部署預覽中複製資料，正式使用前請特別檢視部署預覽的權限與敏感資料保護。網站網址即使由 Private repo 發布仍可能是公開網址。

資料來源：使用者提供之《自閉症兒童行為檢核表》學前、低年級與中年級以上三份 Word 原件；尚無專業核可的計分規則未植入。