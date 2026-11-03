# 自閉症兒童行為檢核表｜GitHub Pages 唯一平台版

## 目前使用方式

本儲存庫已提供 **只使用 GitHub Pages** 的線上操作示範：`docs/index.html`。

此版本不需要 Netlify、不需要 Cloudflare、不需要資料庫，也不必在電腦安裝 Python。

### 開啟 GitHub Pages

1. 在 GitHub 儲存庫點選 **Settings → Pages**。
2. **Build and deployment → Source** 選擇 **Deploy from a branch**。
3. Branch 選 `main`，資料夾選 **`/docs`**，再按 **Save**。
4. 部署完成後，網站預期位址為 `https://yotindo0808.github.io/asd-checklist-online/`；請以 Settings → Pages 顯示的網址為準。

### 操作流程

- 心評端在網頁產生示範填答連結，選擇學前50題、低年級47題或中年級以上47題。
- 填答者使用網頁完成示範題，輸入自訂密碼後匯出加密 JSON。
- 填答者以自行選擇的通訊方式將答案檔傳回心評人員，密碼請經另外的管道交付。
- 心評人員在網頁選取 JSON 並輸入密碼，解密後可下載 CSV、列印 A4。

### 明確限制

**這不是正式施測系統。** 公開網頁只有示範題，不含原始144題；計分和鑑定功能停用。不可輸入真實學生資料。

GitHub Pages 是靜態網站，所以**無法只靠 GitHub Pages 實現**：

- 真正保護心評端的密碼登入；
- 家長按提交後自動傳回心評人員的安全收件；
- 可從伺服器撤銷、真正到期失效的一次性填答連結。

此版的「連結到期」只比對使用者裝置時間，並非伺服器的權限控制。加密答案檔只會下載到填答者的裝置，不會自動儲存到 GitHub。

## 舊版程式保留

`site/`、`server/`、`netlify/` 是較早的 Netlify 後端設計，**GitHub Pages 不會執行這些服務**。請不要把 `site/` 設成 Pages 來源；目前請用 `main /docs`。

## 量表專業驗收

三版本原始題幹與配分的人工覆核尚未正式核定。公開發布量表題文前，應確認使用及公開權利。正式診斷、切截分數與口語能力特殊計分不得由示範版自動產生。
