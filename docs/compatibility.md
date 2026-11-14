# 系統相容性

Optional Damage v0.9.4 宣告支援 DND5e 5.0.0～5.3.3；Foundry 仍使用 v13，本次未擴充至 v12。

## 驗證範圍

- 使用者確認：v0.9.3 在原有世界（Foundry 13.351／DND5e 5.3.3，搭配 Midi-QOL）測試一輪，暫未發現問題。
- v0.9.4 的執行腳本與 v0.9.3 相同；本次只調整相容性宣告與文件。
- 原始碼核對：DND5e release-5.0.0、release-5.1.0、release-5.2.0、release-5.3.3。
- 112 項既有邏輯／模擬介面測試通過。
- 將四個版本原始碼的 buildEvaluate 方法接到資源扣除包裝器，測試預覽不扣除、評估完成後扣除、同批 rolls 重複評估不重扣，四組皆通過。依賴的角色、物品與骰子為模擬物件。
- 未執行完整舊版 Foundry 世界、完整 DND5e 引擎或 Midi-QOL 整合測試；中間各 patch 版沒有逐版世界驗證。相容範圍依上述介面連續性判定。

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
