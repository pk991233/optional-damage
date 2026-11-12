# 額外傷害選擇 0.1.0

目標環境：Foundry VTT 13.351 / DnD5e 5.3.3。
此為初版測試模組，已對照該版本系統原始碼並執行獨立邏輯測試；尚未在實際 Foundry 世界驗證 UI 或其他模組相容性。

## 安裝

1. 解壓縮 ZIP，把 `optional-damage` 整個資料夾放入 Foundry 使用者資料目錄的 `Data/modules/`。
2. 確認路徑為 `Data/modules/optional-damage/module.json`，不要多包一層資料夾。
3. 重新啟動 Foundry，在世界的「管理模組」啟用「額外傷害選擇 Optional Damage」。
4. 一般點擊武器或法術的傷害擲骰，於原生傷害視窗勾選「獵人印記：+1d6 力場」，再按普通或重擊。

也可以在 Foundry 的「安裝模組」貼上以下 Manifest URL：

https://raw.githubusercontent.com/pk991233/optional-damage/main/module.json

ZIP 直接下載：https://raw.githubusercontent.com/pk991233/optional-damage/main/downloads/optional-damage-v0.1.0.zip

## 設定

GM：設定遊戲 → 模組設定 → 額外傷害選擇 → 編輯額外傷害。
每行格式：名稱 | 骰式 | 傷害類型代碼。例如：

```
獵人印記 | 1d6 | force
魔能附傷 | 1d6 | necrotic
火焰附傷 | 1d8 | fire
```

這些是可自訂的選項，不會自動施放法術。清單為世界共用，所有角色都能看見；每次新開視窗均不預先勾選，可以複選。
傷害以獨立的 typed DamageRoll 加入當次原生傷害流程，沿用系統普通／重擊處理。重擊時額外骰通常加倍，並遵循世界重擊設定。其他來源的重擊專屬額外骰不會重複複製給附傷。

## 範圍與限制

- 玩家自行確認命中、標記目標、專注、能力資格與每回合次數；不消耗法術位、充能或反應。
- 若角色物品、效果或 Midi-QOL 已經加入相同傷害，不要再勾選。
- 必須顯示系統原生傷害設定視窗。快捷鍵略過視窗或自動擲傷害時，不會彈出本選項，也不會自動加傷害。
- Midi-QOL / Ready Set Roll 等修改擲骰流程的模組尚未實測。先以原生流程驗證，再測試你的模組組合。
- 純治療視窗不顯示；混合治療與傷害的特殊活動仍須人工判斷。
- 不會自動尋找角色的獵人印記物品或判斷法術等級。

## 實機驗收

1. 未勾選：傷害與原本相同。
2. 普通 + 獵人印記：多一筆 1d6 力場。
3. 重擊 + 獵人印記：標準重擊設定下，多一筆 2d6 力場。
4. 勾選、取消、再勾選：不得重複累加；重新開視窗全部未勾。
5. 同時勾選兩項：各自保留傷害類型；確認聊天卡與傷害套用。
6. 玩家帳號可以勾選，但無法更改世界選項；取消視窗不擲骰。
7. 治療視窗不顯示，快捷鍵略過視窗不加傷害。
8. 最後再啟用 Midi-QOL 等其他模組測試；若失敗，提供模組版本、錯誤訊息與傷害視窗截圖。

## 實作依據

對照官方 release-5.3.3：
- https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/applications/dice/roll-configuration-dialog.mjs
- https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/applications/dice/damage-configuration-dialog.mjs
- https://github.com/foundryvtt/dnd5e/blob/release-5.3.3/module/dice/damage-roll.mjs

使用 renderDamageRollConfigurationDialog hook、config.rolls 與公開 rebuild()，不覆寫系統擲骰函式。
