// ==UserScript==
// @name         SimCompanies 自动定价助手 (利润函数整合版)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  使用自定义利润公式进行循环递增测试，寻找最优价格
// @match        https://www.simcompanies.com/*
// @match        https://staging.simcompanies.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // setInput: 输入并触发 input 事件
    function setInput(inputNode, value, count = 3) {
        let lastValue = inputNode.value;
        inputNode.value = value;
        let event = new Event("input", { bubbles: true });
        event.simulated = true;
        if (inputNode._valueTracker) inputNode._valueTracker.setValue(lastValue);
        inputNode.dispatchEvent(event);
        if (count >= 0) return setInput(inputNode, value, --count);
    }

    // 获取 React 组件
    function findReactComponent(element) {
        // 动态匹配所有可能的 React 内部属性
        const reactKeys = Object.keys(element).filter(key =>
            key.startsWith('__reactInternalInstance') ||
            key.startsWith('__reactFiber')
        );

        for (const key of reactKeys) {
            let fiberNode = element[key];
            while (fiberNode) {
                if (fiberNode.stateNode?.updateProfitPerUnit) {
                    return fiberNode.stateNode;
                }
                fiberNode = fiberNode.return;
            }
        }
        return null;
    }

    // 计算函数
    const Ul = (overhead, skillCOO) => {
        const r = overhead || 1;
        return r - (r - 1) * skillCOO / 100;
    };

    const lwe = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
    const wv = (e, t, r) => {
        return r === null ? lwe[e][t] : lwe[e][t].quality[r]
    }

    const Upt = (e, t, r, n) => t + (e + n) / r;
    const Hpt = (e, t, r, n, a) => {
        const o = (n + e) / ((t - a) * (t - a));
        return e - (r - t) * (r - t) * o;
    };
    const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
    const zn = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;
    const Bpt = (e, t, r, n, a, o) => {
        const g = zn.RETAIL_ADJUSTMENT[e] ?? 1;
        const s = Math.min(Math.max(2 - n, 0), 2), l = s / 2 + 0.5, c = r / 12;
        const d = zn.PROFIT_PER_BUILDING_LEVEL * (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) * g * (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) + (t.modeledStoreWages ?? 0);
        // console.log(`t.buildingLevelsNeededPerUnitPerHour:${t.buildingLevelsNeededPerUnitPerHour}, t.modeledUnitsSoldAnHour:${t.modeledUnitsSoldAnHour}, t.modeledStoreWages:${t.modeledStoreWages} , s:${s} , c:${c}, g:${g}`)
        const h = t.modeledUnitsSoldAnHour * l;
        const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
        const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
        return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
    };

    const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size) => {
        const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
        if (u <= 0) return NaN;
        const d = u / acc / size;
        return d - d * salesModifier / 100;
    };

    // 主功能
    function initAutoPricing() {
        try {
            const input = document.querySelector('input[name="price"]');
            if (!input) {
                console.warn("[AutoPricing] Price input not found!");
                return;
            }

            const reactInstance = findReactComponent(input);
            if (!reactInstance) {
                console.warn("[AutoPricing] React component not found!", Object.keys(input));
                return;
            }
            const cards = document.querySelectorAll('div[style="overflow: visible;"]');

            cards.forEach(card => {
                if (card.dataset.autoPricingAdded) return;

                const priceInput = card.querySelector('input[name="price"]');
                if (!priceInput) return;

                const comp = findReactComponent(priceInput);
                if (!comp) return;

                const btn = document.createElement('button');
                btn.textContent = '最大时利润';
                btn.style = `
                margin-top: 5px;
                background: #2196F3;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                width: 100%;
            `;

                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const {
                        size, acceleration, economyState, resource,
                        salesModifierWithRecreationBonus, skillCMO, skillCOO,
                        saturation, administrationOverhead, wages,
                        buildingKind, forceQuality
                    } = comp.props;
                    const { cogs, quality, quantity } = comp.state

                    // console.log(`size:${size}, acceleration:${acceleration}, economyState：${economyState},
                    // resource：${resource},salesModifierWithRecreationBonus:${salesModifierWithRecreationBonus},
                    // skillCMO：${skillCMO}, skillCOO:${skillCOO},
                    // saturation:${saturation}, administrationOverhead:${administrationOverhead}, wages:${wages},
                    // buildingKind:${buildingKind}, forceQuality:${forceQuality}，cogs:${cogs}, quality:${quality}, quantity:${quantity}`)
                    // console.log(`zn.PROFIT_PER_BUILDING_LEVEL: ${zn.PROFIT_PER_BUILDING_LEVEL}`)

                    let currentPrice = Math.floor(cogs / quantity) || 1;
                    let bestPrice = currentPrice;
                    let maxProfit = -Infinity;
                    let _, v, b, w, revenue, wagesTotal, secondsToFinish = 0;
                    // console.log(`currentPrice：${currentPrice}, bestPrice：${bestPrice}， maxProfit：${maxProfit}`)

                    // setInput(input, currentPrice.toFixed(2));

                    while (currentPrice > 0) {

                        v = salesModifierWithRecreationBonus + Math.floor(skillCMO / 3);
                        b = Ul(administrationOverhead, skillCOO);
                        w = zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, currentPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size);

                        // console.log(`v:${v}, b:${b}, w:${w}`)

                        revenue = currentPrice * quantity;
                        wagesTotal = Math.ceil(w * wages * acceleration * b / 60 / 60);
                        secondsToFinish = w;

                        // console.log(`revenue:${revenue}, wagesTotal:${wagesTotal}, secondsToFinish:${secondsToFinish}`)
                        if (!secondsToFinish || secondsToFinish <= 0) break;

                        let profit = (revenue - cogs - wagesTotal) / secondsToFinish;
                        if (profit > maxProfit) {
                            maxProfit = profit;
                            bestPrice = currentPrice;
                        }
                        // console.log(`当前定价：${bestPrice}, 当前最大秒利润：${maxProfit}`)
                        if (currentPrice < 8) {
                            currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                        } else if (currentPrice < 2001) {
                            currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                        } else {
                            currentPrice = Math.round(currentPrice + 1);
                        }
                    }

                    setInput(priceInput, bestPrice.toFixed(2));
                };

                priceInput.parentNode.appendChild(btn);
                card.dataset.autoPricingAdded = 'true';
            });
        } catch (err) {
            console.error("[AutoPricing] Critical error:", err);
        }
    }

    setInterval(initAutoPricing, 3000);
    initAutoPricing();
})();
