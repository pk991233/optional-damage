# 系統相容性

Optional Damage v0.9.5 的支援範圍為 Foundry VTT 13 與 DND5e 5.0.0～5.3.3。

## v0.9.5 驗證

- 在 Node.js 24 重跑全部 127 項測試，包括兩種重斬共用最後一個契約位、保留面板的局部重繪、普通與重擊切換、特性來源、自訂別名及舊設定升級。
- DND5e 5.0.0 與 5.3.3 的原生結算程式各驗證 8 種情境，涵蓋視窗起始選擇、最後按鈕以及強力重擊開關。武器與偷襲依系統設定結算，野蠻攻擊只在最後選重擊時加入一顆骰。測試使用模擬的 Foundry 核心物件。
- 最近由使用者完成整輪世界測試的是 v0.9.3，環境為 Foundry 13.351、DND5e 5.3.3 與 Midi-QOL。v0.9.5 尚待實際世界與 Midi-QOL 驗證。

## 先前的相容性核對

v0.9.4 將版本範圍向下擴充至 DND5e 5.0.0。當時核對了 DND5e 5.0.0、5.1.0、5.2.0、5.3.3 的原始碼，將各版本的 `buildEvaluate` 與資源扣除程式接合，檢查預覽、正式擲骰與同批擲骰重複評估。中間各 patch 版尚未逐版進行世界實測。

## 核對的介面

四個版本均保留：
- BasicRoll.buildEvaluate(rolls, config, message) 與 evaluate=false 預覽控制。
- DamageRollConfigurationDialog、config、rebuild() 與 postBuild 傷害設定 hook。
- Item／Activity 的 uses.max、uses.spent。
- Class 的 hd.denomination、hd.max、hd.spent。
- itemUses、activityUses、生命骰消耗對應欄位。

原始碼位置（各連結可切換對應 release 標籤）：
- [BasicRoll](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/dice/basic-roll.mjs)
- [Roll dialog](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/applications/dice/roll-configuration-dialog.mjs)
- [Damage dialog](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/applications/dice/damage-configuration-dialog.mjs)
- [Class](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/data/item/class.mjs)
- [Uses](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/data/shared/uses-field.mjs)
- [Consumption](https://github.com/foundryvtt/dnd5e/blob/release-5.0.0/module/data/activity/fields/consumption-targets-field.mjs)

## 舊版世界實測

使用獨立測試世界，先確認原生傷害視窗，再以與該系統版本相容的 Midi-QOL 測試：
1. 普通附傷與取消視窗。
2. 火／霜巨人次數、至聖斬與魔能重斬法術位。
3. Psionic Energy Die、Focus Point、活殺自在獨立次數。
4. 混合生命骰、最後一次資源、互斥切換。
5. 玩家個人自訂與快捷新增。

本次沒有改寫規則版本，也不會補齊角色卡未匯入的特性。系統版本相容與角色規則採 2014／2024 是不同設定。
