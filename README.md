# 自閉症兒童行為檢核表｜線上自動收件系統

**目前方案：Google Apps Script + 私人 Google 試算表；GitHub 作為程式版本備份。**

## 為何不再使用 GitHub Pages 收件？

僅靠 GitHub Pages 無法提供安全的管理密碼驗證、限時邀請、家長提交後自動收件和伺服器儲存。先前的「家長匯出檔案再交回」流程已被使用者否決。

建議使用 Google Apps Script 將前端與後端整合為同一個可分享網址；家長直接提交答案，心評人員登入取得結果，完成下載後可以刪除，資料最長暫存約七天。不需要 Netlify Credit-based 方案或安裝 Python。

## 最新版本 V5

V5 完整程式（Code.gs、Index.html、Bank.gs）由 ChatGPT 對話中的「V5 私人部署完整套件」提供。原始題庫僅留在私人交付檔案，**沒有上傳到本公開 GitHub 儲存庫**。

部署概要：
1. 建立**私人** Google 試算表。
2. 擴充功能 → Apps Script。
3. 依私人套件說明貼入 Code.gs、Index.html 與 Bank.gs。
4. 在 Apps Script 專案設定中設定 SHEET_ID、ADMIN_PASSWORD_SETUP；在編輯器執行 setupSystem_。
5. 部署為網頁應用程式，執行身分選「我」，允許任何人存取（若帳戶政策允許），使用虛構資料測試。

**重要：目前未完成 Google 帳戶實際部署及個資安全驗收，不可輸入真實學生資料。原始三版本題目尚待專業逐字覆核；計分與鑑定功能未啟用。**

專案歷史：`site/`、`netlify/` 為舊版 Netlify 工程原型；`docs/` 先前為純 GitHub Pages 加密檔案示範，均不代表最新的自動收件方案。
