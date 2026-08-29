// ==UserScript==
// @name         自动计算最大时利润
// @namespace    https://github.com/gangbaRuby
// @version      1.33.5
// @license      AGPL-3.0
// @description  在商店计算自动计算最大时利润，在合同、交易所展示最大时利润
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @updateURL    https://sc.22-7.top/scripts/autoMaxPPHPL.user.js
// @downloadURL  https://sc.22-7.top/scripts/autoMaxPPHPL.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      api.simcotools.com
// ==/UserScript==

(() => {
  // src/core/storage.js
  function getRealmIdFromLink() {
    let method1Result = null;
    let method2Result = null;
    const realmLogoImg = document.querySelector('img[alt$="realm logo"]');
    if (realmLogoImg) {
      const src = realmLogoImg.src;
      if (src.includes("Magnates")) {
        method1Result = 0;
      } else if (src.includes("Entrepeneurs")) {
        method1Result = 1;
      }
    }
    const link = document.querySelector('a[href*="/company/"]');
    if (link) {
      const match2 = link.href.match(/\/company\/(\d+)\//);
      if (match2) {
        method2Result = parseInt(match2[1], 10);
      }
    }
    if (method1Result !== null && method2Result !== null) {
      if (method1Result !== method2Result) {
        console.warn(
          `[Realm\u68C0\u6D4B\u51B2\u7A81] \u4E24\u4E2A\u65B9\u6CD5\u83B7\u53D6\u7684 realmId \u4E0D\u4E00\u81F4\uFF1A
\u7B2C\u4E00\u4E2A\u65B9\u6CD5(\u56FE\u7247\u6CD5)\u7ED3\u679C: ${method1Result}
\u7B2C\u4E8C\u4E2A\u65B9\u6CD5(\u94FE\u63A5\u6CD5)\u7ED3\u679C: ${method2Result}
\u5DF2\u8FD4\u56DE\u7B2C\u4E8C\u4E2A\u65B9\u6CD5\u7684\u7ED3\u679C\u4EE5\u786E\u4FDD\u4EE3\u7801\u6B63\u5E38\u8FD0\u884C\u3002`
        );
        return method2Result;
      }
      return method2Result;
    }
    if (method2Result !== null) return method2Result;
    if (method1Result !== null) return method1Result;
    return null;
  }
  var getScopedKey = (k) => {
    const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
    return realmId !== null ? `R${realmId}-${k}` : k;
  };

  // src/features/regionData.js
  var RegionData = /* @__PURE__ */ (() => {
    const getAuthInfo = async () => {
      const Network3 = window.__SC_Network;
      const data2 = await Network3.requestJson("https://www.simcompanies.com/api/v3/companies/auth-data/");
      return {
        realmId: data2.authCompany?.realmId,
        companyId: data2.authCompany?.companyId,
        company: data2.authCompany?.company,
        salesModifier: data2.authCompany?.salesModifier,
        economyState: data2.temporals?.economyState,
        acceleration: data2.levelInfo?.acceleration?.multiplier
      };
    };
    const getCompanies_by_company = async (realmId, company) => {
      const Network3 = window.__SC_Network;
      const formattedCompany = company.replace(/ /g, "-");
      const data2 = await Network3.requestJson(
        `https://www.simcompanies.com/api/v3/companies-by-company/${realmId}/${formattedCompany}/`
      );
      return {
        recreationBonus: data2.infrastructure?.recreationBonus,
        administration: data2.infrastructure?.administrationOverhead
      };
    };
    const getExecutives = async () => {
      const Network3 = window.__SC_Network;
      const response = await Network3.requestJson("https://www.simcompanies.com/api/v3/companies/me/executives/");
      const data2 = response.executives;
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1e3;
      const targetPositions = ["o", "f", "m", "t", "v", "y"];
      return data2.filter(
        (exec) => exec.currentWorkHistory && targetPositions.includes(exec.currentWorkHistory.position) && (!exec.strikeUntil || new Date(exec.strikeUntil) < /* @__PURE__ */ new Date()) && new Date(exec.currentWorkHistory.start) < threeHoursAgo && !exec.currentTraining
      );
    };
    const getResourcesRetailInfo = async (realmId) => {
      const Network3 = window.__SC_Network;
      const data2 = await Network3.requestJson(
        `https://www.simcompanies.com/api/v4/${realmId}/resources-retail-info/`
      );
      const resourcesRetailInfo = [];
      data2.forEach((item) => {
        resourcesRetailInfo.push({
          quality: item.quality,
          dbLetter: item.dbLetter,
          averagePrice: item.averagePrice,
          saturation: item.saturation
        });
      });
      return resourcesRetailInfo;
    };
    const getWeather = async (realmId) => {
      const Network3 = window.__SC_Network;
      try {
        const data2 = await Network3.requestJson(`https://www.simcompanies.com/api/v2/weather/${realmId}/`);
        return {
          Until: data2.until,
          sellingSpeedMultiplier: data2.sellingSpeedMultiplier
        };
      } catch (e) {
        console.warn(`[Weather] Failed to fetch weather for realm ${realmId}:`, e);
        return {
          Until: null,
          sellingSpeedMultiplier: null
        };
      }
    };
    const fetchFullRegionData = async () => {
      const auth = await getAuthInfo();
      const companies_by_company = await getCompanies_by_company(auth.realmId, auth.company);
      const [executives, resourcesRetailInfo, sellingSpeedMultiplier, weatherUntil] = await Promise.all([
        getExecutives(),
        getResourcesRetailInfo(auth.realmId),
        getWeather(auth.realmId)
      ]);
      const calculateExecutiveBonus = (executives2) => {
        let academyActive = 15;
        let COO_Apprentice, CMO_Apprentice;
        try {
          const stored = localStorage.getItem(`SimcompaniesRetailCalculation_${auth.realmId}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed.academyActive === "number") {
              academyActive = parsed.academyActive;
            }
          }
        } catch (e) {
          console.warn("\u26A0\uFE0F \u65E0\u6CD5\u89E3\u6790 SimcompaniesRetailCalculation \u6570\u636E\uFF0C\u4F7F\u7528\u9ED8\u8BA4\u503C 15:", e);
        }
        const skills = executives2.reduce((acc, exec) => {
          if (exec.currentWorkHistory) {
            acc[exec.currentWorkHistory.position] = exec.skills;
          }
          return acc;
        }, {});
        const safeSkill = (position, skillName) => skills[position]?.[skillName] || 0;
        if (academyActive >= 15) {
          COO_Apprentice = safeSkill("v", "coo") / 2;
          CMO_Apprentice = safeSkill("y", "cmo") / 2;
        } else if (academyActive >= 5) {
          COO_Apprentice = safeSkill("v", "coo") / 2;
          CMO_Apprentice = 0;
        } else {
          COO_Apprentice = 0;
          CMO_Apprentice = 0;
        }
        let adminBonus = Math.floor(safeSkill("o", "coo") + COO_Apprentice + (safeSkill("f", "coo") + safeSkill("m", "coo") + safeSkill("t", "coo")) / 4);
        if (adminBonus > 80) {
          adminBonus = 80 + Math.floor((adminBonus - 80) / 2);
        }
        if (adminBonus > 60) {
          adminBonus = 60 + Math.floor((adminBonus - 60) / 2);
        }
        let saleBonus = Math.floor(safeSkill("m", "cmo") + CMO_Apprentice + (safeSkill("o", "cmo") + safeSkill("f", "cmo") + safeSkill("t", "cmo")) / 4);
        if (saleBonus > 80) {
          saleBonus = 80 + Math.floor((saleBonus - 80) / 2);
        }
        if (saleBonus > 60) {
          saleBonus = 60 + Math.floor((saleBonus - 60) / 2);
        }
        saleBonus = Math.floor(saleBonus / 3);
        return {
          saleBonus,
          adminBonus
        };
      };
      return {
        ...auth,
        ...companies_by_company,
        ...calculateExecutiveBonus(executives),
        ResourcesRetailInfo: resourcesRetailInfo,
        sellingSpeedMultiplier,
        weatherUntil,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    };
    return {
      fetchFullRegionData,
      getCurrentRealmId: async () => (await getAuthInfo()).realmId
    };
  })();

  // src/core/requestHooks.js
  (function() {
    const buildings_URL = "/api/v2/companies/me/buildings/";
    const uc = "l";
    function saveMergedLocalStorage(key, newData) {
      try {
        const existing = JSON.parse(localStorage.getItem(key) || "{}");
        const merged = { ...existing, ...newData };
        localStorage.setItem(key, JSON.stringify(merged));
      } catch (e) {
        console.warn("\u26A0\uFE0F localStorage \u5408\u5E76\u5199\u5165\u5931\u8D25\uFF0C\u76F4\u63A5\u4F7F\u7528\u65B0\u6570\u636E", e);
        localStorage.setItem(key, JSON.stringify(newData));
      }
    }
    function processBuildings(buildings) {
      const academyResult = buildings.filter((t) => t.kind === "y" && !t.purchasedRecently).reduce((acc, r) => {
        const busy = r.busy;
        acc.active += !busy && !r.position?.startsWith(uc) ? r.size : 0;
        acc.slots += busy?.expanding ? r.size - 1 : r.size;
        return acc;
      }, { active: 0, slots: 0 });
      const bankResult = buildings.filter((t) => t.kind === "n" && !t.purchasedRecently).reduce((acc, r) => {
        const busy = r.busy;
        acc.active += !busy && !r.position?.startsWith(uc) ? r.size : 0;
        acc.slots += busy?.expanding ? r.size - 1 : r.size;
        return acc;
      }, { active: 0, slots: 0 });
      return {
        active: academyResult.active,
        slots: academyResult.slots,
        bankLevel: bankResult.active
      };
    }
    function handleData(data2) {
      if (!Array.isArray(data2) || data2.length === 0) return;
      const result = processBuildings(data2);
      const realmId = getRealmIdFromLink();
      if (realmId === 0 || realmId === 1) {
        const key = `SimcompaniesRetailCalculation_${realmId}`;
        let stored = {};
        try {
          const raw = localStorage.getItem(key);
          if (raw) stored = JSON.parse(raw);
        } catch (e) {
          console.warn("\u26A0\uFE0F \u8BFB\u53D6 localStorage \u65F6\u89E3\u6790\u5931\u8D25\uFF0C\u521D\u59CB\u5316\u4E3A\u7A7A\u5BF9\u8C61", e);
        }
        stored.buildings = data2;
        const oldAcademyActive = stored.academyActive ?? 0;
        const newAcademyActive = result.active;
        stored.academyActive = newAcademyActive;
        stored.bankLevel = result.bankLevel;
        localStorage.setItem(key, JSON.stringify(stored));
        if (oldAcademyActive !== newAcademyActive) {
          if (typeof RegionData !== "undefined" && RegionData.fetchFullRegionData) {
            RegionData.fetchFullRegionData().then((newData) => {
              const existingRaw = localStorage.getItem(key);
              let existingData = {};
              try {
                existingData = JSON.parse(existingRaw);
              } catch (e) {
              }
              const merged = { ...existingData, ...newData };
              localStorage.setItem(key, JSON.stringify(merged));
            }).catch((err) => console.error("\u274C \u9AD8\u7BA1\u52A0\u6210\u91CD\u65B0\u8BA1\u7B97\u5931\u8D25:", err));
          }
        } else {
        }
      }
    }
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        if (typeof args[0] === "string" && args[0].includes(buildings_URL)) {
          response.clone().json().then(handleData).catch((err) => console.error("\u274C JSON \u89E3\u6790\u5931\u8D25:", err));
        }
      } catch (e) {
        console.error(e);
      }
      return response;
    };
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, async) {
      this.addEventListener("load", function() {
        if (url && url.includes(buildings_URL) && this.responseText) {
          try {
            handleData(JSON.parse(this.responseText));
          } catch (e) {
            console.error("\u274C XHR JSON \u89E3\u6790\u5931\u8D25:", e);
          }
        }
      });
      return originalXHR.apply(this, arguments);
    };
  })();
  (function() {
    const resources_URL_PATTERN = /\/api\/v3\/resources\/\d+\//;
    function handleData(data2) {
      if (!Array.isArray(data2) || data2.length === 0) return;
      const realmId = getRealmIdFromLink();
      if (realmId !== 0 && realmId !== 1) return;
      const key = `SimcompaniesRetailCalculation_${realmId}`;
      try {
        const existing = JSON.parse(localStorage.getItem(key) || "{}");
        existing.warehouseResources = data2;
        localStorage.setItem(key, JSON.stringify(existing));
      } catch (e) {
        console.warn("\u26A0\uFE0F \u4ED3\u5E93\u6570\u636E\u5199\u5165\u5931\u8D25", e);
        localStorage.setItem(key, JSON.stringify({ warehouseResources: data2 }));
      }
    }
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        if (typeof args[0] === "string" && resources_URL_PATTERN.test(args[0])) {
          response.clone().json().then(handleData).catch((err) => console.error("\u274C \u4ED3\u5E93 JSON \u89E3\u6790\u5931\u8D25:", err));
        }
      } catch (e) {
        console.error(e);
      }
      return response;
    };
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, async) {
      this.addEventListener("load", function() {
        if (url && resources_URL_PATTERN.test(url) && this.responseText) {
          try {
            handleData(JSON.parse(this.responseText));
          } catch (e) {
            console.error("\u274C \u4ED3\u5E93 XHR JSON \u89E3\u6790\u5931\u8D25:", e);
          }
        }
      });
      return originalXHR.apply(this, arguments);
    };
  })();

  // src/core/exportInfo.js
  var providers = [];
  function registerExportInfo(provider) {
    if (!provider || typeof provider !== "object") return;
    providers.push(provider);
  }
  function collectKeys(provider, realmId) {
    const keys = typeof provider.keys === "function" ? provider.keys(realmId) : Array.isArray(provider.keys) ? provider.keys : [];
    return Array.isArray(keys) ? keys : [];
  }
  function keyMatches(provider, realmId, key) {
    if (!provider.match) return false;
    const pattern = typeof provider.match === "function" ? provider.match(realmId) : provider.match;
    if (pattern instanceof RegExp) return pattern.test(key);
    return false;
  }
  function readRaw(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const entry = { raw };
    try {
      entry.parsed = JSON.parse(raw);
    } catch (e) {
    }
    return entry;
  }
  function collectExportData() {
    const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
    const realm = {};
    const global = {};
    const realmSeen = /* @__PURE__ */ new Set();
    const globalSeen = /* @__PURE__ */ new Set();
    const add = (target, seen, key) => {
      if (seen.has(key)) return;
      const entry = readRaw(key);
      if (entry === null) return;
      seen.add(key);
      target[key] = entry;
    };
    for (const provider of providers) {
      const isRealm = provider.scope === "realm";
      const target = isRealm ? realm : global;
      const seen = isRealm ? realmSeen : globalSeen;
      for (const key of collectKeys(provider, realmId)) add(target, seen, key);
      if (provider.match) {
        for (const key of Object.keys(localStorage)) {
          if (keyMatches(provider, realmId, key)) add(target, seen, key);
        }
      }
    }
    const meta = {
      pluginName: typeof GM_info !== "undefined" ? GM_info.script.name : "autoMaxPPHPL",
      scriptVersion: typeof GM_info !== "undefined" ? GM_info.script.version : "\u672A\u77E5",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pageUrl: location.href,
      realmId,
      registeredProviders: providers.map((p) => p.name || "\u672A\u547D\u540D"),
      realmKeyCount: Object.keys(realm).length,
      globalKeyCount: Object.keys(global).length
    };
    return { meta, realm, global };
  }
  function downloadExportData() {
    const data2 = collectExportData();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(data2, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SC_Export_${data2.meta.realmId ?? "unknown"}_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    return data2;
  }
  window.SC_ExportInfo = {
    registerExportInfo,
    collectExportData,
    downloadExportData
  };

  // src/features/autoRefresh.js
  (function() {
    const CUSTOM_AMOUNTS_STORAGE_KEY = "SC_AutoAmount_CustomAmounts";
    const ENABLED_STORAGE_KEY = "SC_AutoAmount_Enabled";
    const DEFAULT_AMOUNTS_STRING = "10pm";
    const DEFAULT_BUTTON_CLASS = "btn btn-secondary";
    registerExportInfo({
      name: "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F\u8BBE\u7F6E",
      scope: "global",
      keys: [ENABLED_STORAGE_KEY, CUSTOM_AMOUNTS_STORAGE_KEY]
    });
    const CARD_SELECTOR = ".col-xs-6.css-0.ewayztq2, .col-xs-6.resources.text-center";
    const PROCESSED_DATA_ATTRIBUTE = "data-custom-amount-added";
    function isAutoAmountEnabled() {
      const stored = localStorage.getItem(ENABLED_STORAGE_KEY);
      if (stored === null) {
        return true;
      }
      return stored === "true";
    }
    function saveAutoAmountEnabled(isEnabled) {
      localStorage.setItem(ENABLED_STORAGE_KEY, isEnabled ? "true" : "false");
    }
    function loadCustomAmounts() {
      const stored = localStorage.getItem(CUSTOM_AMOUNTS_STORAGE_KEY);
      if (stored !== null) {
        const normalizedStored = stored.replace(/，/g, ",");
        return normalizedStored.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      }
      return DEFAULT_AMOUNTS_STRING.split(",").map((s) => s.trim());
    }
    function saveCustomAmounts(amounts) {
      const validAmounts = amounts.map((s) => String(s).trim()).filter((s) => s.length > 0);
      const saveString = validAmounts.join(",");
      localStorage.setItem(CUSTOM_AMOUNTS_STORAGE_KEY, saveString);
      initAutoAmountButtons(true);
    }
    function setInput(inputNode, value, count = 3) {
      let lastValue = inputNode.value;
      inputNode.value = value;
      let event = new Event("input", { bubbles: true });
      event.simulated = true;
      if (inputNode._valueTracker) {
        inputNode._valueTracker.setValue(lastValue);
      }
      inputNode.dispatchEvent(event);
      if (count > 0) {
        return setInput(inputNode, value, --count);
      }
    }
    function showConfigModal() {
      const currentAmounts = loadCustomAmounts();
      const amountsString = currentAmounts.join(", ");
      const modalId = "autoamount-config-modal";
      document.getElementById(modalId)?.remove();
      const bgSum = (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g) || []).map(Number).reduce((a, b) => a + b, 0);
      const isDark = bgSum < 380;
      const bg = isDark ? "#333" : "#fff";
      const fg = isDark ? "#EEE" : "#333";
      const border = isDark ? "#555" : "#ccc";
      const inputBg = isDark ? "#2C2C2C" : "#f5f5f5";
      const inputFg = isDark ? "#EEE" : "#333";
      const inputBorder = isDark ? "#666" : "#bbb";
      const codeBg = isDark ? "#444" : "#e8e8e8";
      const codeFg = isDark ? "#ffb74d" : "#c62828";
      const overlayBg = "rgba(0,0,0,0.7)";
      const shadow = "0 5px 15px rgba(0,0,0,0.5)";
      const btnCancelBg = isDark ? "#555" : "#e0e0e0";
      const btnCancelFg = isDark ? "white" : "#333";
      const modal = document.createElement("div");
      modal.id = modalId;
      modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${overlayBg};z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;`;
      modal.innerHTML = `
                <div style="background:${bg};color:${fg};padding:0;border-radius:6px;box-shadow:${shadow};width:90%;max-width:450px;border:1px solid ${border};">
                    <div style="padding:15px;border-bottom:1px solid ${border};">
                        <h4 style="margin:0;font-size:18px;font-weight:600;">\u8BBE\u7F6E\u81EA\u5B9A\u4E49\u6570\u91CF/\u65F6\u957F</h4>
                    </div>
                    <div style="padding:15px;">
                        <p style="margin-top:0;margin-bottom:15px;font-size:14px;line-height:1.6;">
                            \u4F7F\u7528<strong style="color:#FF8888;">\u9017\u53F7\uFF08, \u6216 \uFF0C\uFF09</strong>\u5206\u9694\uFF0C\u53EF\u5728\u63D2\u4EF6\u83DC\u5355\u4E2D\u7981\u7528\u6B64\u529F\u80FD\u3002\u652F\u6301\u683C\u5F0F\uFF1A<br>
                            \u2022 \u65F6\u95F4\u70B9\uFF1A<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">10pm</code>\u3001<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">11:30</code> \u2192 \u4ECA\u665A/\u660E\u5929\u8BE5\u65F6\u523B\u7684\u5206\u949F\u6570<br>
                            \u2022 \u660E\u5929\u65F6\u523B\uFF1A<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+14:13</code>\u3001<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+2pm</code> \u2192 \u5F3A\u5236\u660E\u5929\u8BE5\u65F6\u523B<br>
                            \u2022 \u540E\u5929\u65F6\u523B\uFF1A<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">++14:13</code>\u3001<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">++2pm</code> \u2192 \u5F3A\u5236\u540E\u5929\u8BE5\u65F6\u523B<br>
                            \u2022 \u660E\u5929\u65F6\u957F\uFF1A<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">+11h11m</code> \u2192 24\u5C0F\u65F6 + \u6307\u5B9A\u65F6\u957F<br>
                            \u2022 \u6301\u7EED\u65F6\u95F4\uFF1A<code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">1d12h30m</code> \u2192 \u7D2F\u52A0\u4E3A\u603B\u5206\u949F<br>
                            \u5B57\u6BCD\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF0C\u534A\u89D2\u5168\u89D2\u5747\u53EF\u3002
                        </p>
                        <textarea id="autoamount-config-input"
                            style="width:100%;height:80px;margin-bottom:20px;padding:8px;border:1px solid ${inputBorder};border-radius:4px;box-sizing:border-box;font-size:14px;color:${inputFg};background:${inputBg};resize:vertical;"></textarea>
                        <div style="display:flex;justify-content:flex-end;gap:10px;">
                            <button id="autoamount-config-cancel" style="background-color:${btnCancelBg};color:${btnCancelFg};border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">\u53D6\u6D88</button>
                            <button id="autoamount-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;transition:background-color 0.2s;">\u4FDD\u5B58</button>
                        </div>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);
      const inputElement = document.getElementById("autoamount-config-input");
      const saveButton = document.getElementById("autoamount-config-save");
      const cancelButton = document.getElementById("autoamount-config-cancel");
      inputElement.value = amountsString;
      cancelButton.addEventListener("click", () => modal.remove());
      saveButton.addEventListener("click", () => {
        const newString = inputElement.value;
        const normalizedString = newString.replace(/，/g, ",");
        const newAmounts = normalizedString.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        saveCustomAmounts(newAmounts);
        modal.remove();
      });
      const applyHoverStyle = (element, normalColor, hoverColor) => {
        element.addEventListener("mouseenter", () => element.style.backgroundColor = hoverColor);
        element.addEventListener("mouseleave", () => element.style.backgroundColor = normalColor);
      };
      applyHoverStyle(cancelButton, isDark ? "#555" : "#e0e0e0", isDark ? "#444" : "#ccc");
      applyHoverStyle(saveButton, "#5cb85c", "#4cae4c");
    }
    function initAutoAmountButtons(forceReload = false) {
      if (!isAutoAmountEnabled()) {
        document.querySelectorAll(`.autoamount-custom-btn`).forEach((btn) => btn.remove());
        document.querySelectorAll(`[${PROCESSED_DATA_ATTRIBUTE}]`).forEach((card) => {
          card.removeAttribute(PROCESSED_DATA_ATTRIBUTE);
        });
        return;
      }
      if (forceReload) {
        document.querySelectorAll(`.autoamount-custom-btn`).forEach((btn) => btn.remove());
        document.querySelectorAll(`[${PROCESSED_DATA_ATTRIBUTE}]`).forEach((card) => {
          card.removeAttribute(PROCESSED_DATA_ATTRIBUTE);
        });
      }
      const customAmounts = loadCustomAmounts();
      requestAnimationFrame(() => {
        const targetDivs = document.querySelectorAll(CARD_SELECTOR);
        targetDivs.forEach((card, index) => {
          try {
            if (card.hasAttribute(PROCESSED_DATA_ATTRIBUTE)) {
              return;
            }
            const input = card.querySelector('input[name="amount"], input[name="quantity"]');
            let buttonContainer = null;
            buttonContainer = card.querySelector("div.text-center");
            if (!buttonContainer) {
              const candidateDivs = card.querySelectorAll("div");
              if (candidateDivs.length > 0) {
                const lastDiv = candidateDivs[candidateDivs.length - 1];
                if (lastDiv.querySelector("button")) {
                  buttonContainer = lastDiv;
                }
              }
            }
            if (input && buttonContainer) {
              const existingButton = buttonContainer.querySelector("button");
              let buttonClass = existingButton ? existingButton.className : DEFAULT_BUTTON_CLASS;
              const configButton = document.createElement("button");
              configButton.className = `${buttonClass} autoamount-custom-btn`;
              configButton.type = "button";
              configButton.role = "button";
              configButton.textContent = "+";
              configButton.style.fontWeight = "bold";
              configButton.style.color = "white";
              configButton.style.backgroundColor = "#4CAF50";
              configButton.style.textTransform = "none";
              configButton.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                showConfigModal();
              });
              buttonContainer.prepend(configButton);
              customAmounts.slice().reverse().forEach((amount) => {
                const newButton = document.createElement("button");
                newButton.className = `${buttonClass} autoamount-custom-btn`;
                newButton.type = "button";
                newButton.role = "button";
                newButton.textContent = amount;
                newButton.style.textTransform = "none";
                newButton.addEventListener("click", (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const valueToSet = getCalculatedAmount(amount);
                  setInput(input, valueToSet);
                });
                buttonContainer.prepend(newButton);
              });
              card.setAttribute(PROCESSED_DATA_ATTRIBUTE, "true");
            }
          } catch (error) {
            console.error(`[\u6A21\u57575-1 \u9519\u8BEF] \u5904\u7406\u7B2C ${index + 1} \u5F20\u5361\u7247\u65F6\u53D1\u751F\u672A\u6355\u83B7\u9519\u8BEF:`, error);
            console.error("\u5BFC\u81F4\u9519\u8BEF\u7684\u5361\u7247\u5143\u7D20:", card);
          }
        });
      });
    }
    window.isAutoAmountEnabled = isAutoAmountEnabled;
    window.saveAutoAmountEnabled = saveAutoAmountEnabled;
    window.initAutoAmountButtons = initAutoAmountButtons;
    function getCalculatedAmount(amountString) {
      const today = /* @__PURE__ */ new Date();
      let s = amountString.replace(/：/g, ":").replace(/，/g, ",").replace(/[Ａ-Ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/[ａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).trim();
      const lower = s.toLowerCase();
      const doublePlusTimeMatch = lower.match(/^\+\+(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
      if (doublePlusTimeMatch) {
        let hours = parseInt(doublePlusTimeMatch[1], 10);
        const minutes = parseInt(doublePlusTimeMatch[2], 10);
        const ampm = doublePlusTimeMatch[3];
        if (ampm === "pm" && hours !== 12) hours += 12;
        else if (ampm === "am" && hours === 12) hours = 0;
        const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
        const diffMs = targetTime.getTime() - today.getTime() + 2 * 24 * 60 * 60 * 1e3;
        return `${Math.floor(diffMs / 6e4)}m`;
      }
      if (lower.startsWith("++")) {
        const rest = lower.slice(2);
        const doublePlusAmpmMatch = rest.match(/^(\d{1,2})\s*(am|pm)$/);
        if (doublePlusAmpmMatch) {
          let hours = parseInt(doublePlusAmpmMatch[1], 10);
          const ampm = doublePlusAmpmMatch[2];
          if (ampm === "pm" && hours !== 12) hours += 12;
          else if (ampm === "am" && hours === 12) hours = 0;
          const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
          const diffMs = targetTime.getTime() - today.getTime() + 2 * 24 * 60 * 60 * 1e3;
          return `${Math.floor(diffMs / 6e4)}m`;
        }
      }
      const plusTimeMatch = lower.match(/^\+(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
      if (plusTimeMatch) {
        let hours = parseInt(plusTimeMatch[1], 10);
        const minutes = parseInt(plusTimeMatch[2], 10);
        const ampm = plusTimeMatch[3];
        if (ampm === "pm" && hours !== 12) hours += 12;
        else if (ampm === "am" && hours === 12) hours = 0;
        const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
        const diffMs = targetTime.getTime() - today.getTime() + 24 * 60 * 60 * 1e3;
        return `${Math.floor(diffMs / 6e4)}m`;
      }
      if (lower.startsWith("+")) {
        const rest = lower.slice(1);
        const plusAmpmMatch = rest.match(/^(\d{1,2})\s*(am|pm)$/);
        if (plusAmpmMatch) {
          let hours = parseInt(plusAmpmMatch[1], 10);
          const ampm = plusAmpmMatch[2];
          if (ampm === "pm" && hours !== 12) hours += 12;
          else if (ampm === "am" && hours === 12) hours = 0;
          const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
          const diffMs = targetTime.getTime() - today.getTime() + 24 * 60 * 60 * 1e3;
          return `${Math.floor(diffMs / 6e4)}m`;
        }
        const durPattern2 = /(\d+\.?\d*)\s*([dhm])/gi;
        let totalMinutes2 = 0;
        let durMatch2;
        let hasDuration2 = false;
        while ((durMatch2 = durPattern2.exec(rest)) !== null) {
          hasDuration2 = true;
          const val = parseFloat(durMatch2[1]);
          const unit = durMatch2[2].toLowerCase();
          if (unit === "d") totalMinutes2 += val * 1440;
          else if (unit === "h") totalMinutes2 += val * 60;
          else if (unit === "m") totalMinutes2 += val;
        }
        if (hasDuration2) {
          totalMinutes2 += 1440;
          return `${Math.floor(totalMinutes2)}m`;
        }
      }
      const timeMatch = lower.match(/^(\d{1,2}):(\d{1,2})\s*(am|pm)?$/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const ampm = timeMatch[3];
        if (ampm === "pm" && hours !== 12) hours += 12;
        else if (ampm === "am" && hours === 12) hours = 0;
        const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, 0, 0);
        let diffMs = targetTime.getTime() - today.getTime();
        if (diffMs < 0) diffMs += 24 * 60 * 60 * 1e3;
        return `${Math.floor(diffMs / 6e4)}m`;
      }
      const standaloneAmpm = lower.match(/^(\d{1,2})\s*(am|pm)$/);
      if (standaloneAmpm) {
        let hours = parseInt(standaloneAmpm[1], 10);
        const ampm = standaloneAmpm[2];
        if (ampm === "pm" && hours !== 12) hours += 12;
        else if (ampm === "am" && hours === 12) hours = 0;
        const targetTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, 0, 0, 0);
        let diffMs = targetTime.getTime() - today.getTime();
        if (diffMs < 0) diffMs += 24 * 60 * 60 * 1e3;
        return `${Math.floor(diffMs / 6e4)}m`;
      }
      const durPattern = /(\d+\.?\d*)\s*([dhm])/gi;
      let totalMinutes = 0;
      let durMatch;
      let hasDuration = false;
      while ((durMatch = durPattern.exec(lower)) !== null) {
        hasDuration = true;
        const val = parseFloat(durMatch[1]);
        const unit = durMatch[2].toLowerCase();
        if (unit === "d") {
          totalMinutes += val * 1440;
        } else if (unit === "h") {
          totalMinutes += val * 60;
        } else if (unit === "m") {
          totalMinutes += val;
        }
      }
      if (hasDuration) {
        return `${Math.floor(totalMinutes)}m`;
      }
      return s;
    }
    function observeCardsForAutoAmount() {
      let debounceTimer;
      let lateCheckTimer;
      const targetNode = document.body;
      const CHECK_SELECTORS = [
        'div[style="overflow: visible;"]',
        CARD_SELECTOR.split(",").map((s) => s.trim()).join(",")
      ];
      const observer = new MutationObserver((mutationsList) => {
        clearTimeout(debounceTimer);
        clearTimeout(lateCheckTimer);
        debounceTimer = setTimeout(() => {
          const hasRelevantChanges = mutationsList.some((mutation) => {
            return mutation.type === "childList" && mutation.addedNodes.length > 0 && Array.from(mutation.addedNodes).some((node) => {
              return node.nodeType === 1 && CHECK_SELECTORS.some(
                (selector) => node.matches(selector) || node.querySelector(selector)
              );
            });
          });
          if (hasRelevantChanges) {
            initAutoAmountButtons(false);
            lateCheckTimer = setTimeout(() => {
              initAutoAmountButtons(false);
            }, 500);
          }
        }, 100);
      });
      observer.observe(targetNode, {
        childList: true,
        subtree: true
      });
      function ensureInputsLoaded() {
        let tries = 0;
        const maxTries = 50;
        const timer = setInterval(() => {
          const inputs = document.querySelectorAll('input[name="amount"], input[name="quantity"]');
          if (inputs.length > 0 || tries >= maxTries) {
            clearInterval(timer);
            if (inputs.length > 0) {
              initAutoAmountButtons();
            }
          }
          tries++;
        }, 100);
      }
      requestAnimationFrame(ensureInputsLoaded);
    }
    observeCardsForAutoAmount();
  })();

  // src/features/paQuestAnswers.js
  var PAQuestAnswers = (function() {
    const PA_DATA_KEY = "SC_PA_Quests_Cache";
    const PA_DATA_URL = "https://sc.22-7.top/scripts/PA-Quests.json";
    const CACHE_TTL = 36e5;
    const MATCH_THRESHOLD = 0.7;
    registerExportInfo({
      name: "PA \u4EFB\u52A1\u7B54\u6848\u7F13\u5B58",
      scope: "global",
      keys: [PA_DATA_KEY]
    });
    let questData = null;
    let dataLoadAttempted = false;
    let initAttempted = false;
    let observer = null;
    let cleanupTimer = null;
    function isEnabled() {
      return window.isPageModuleEnabled ? window.isPageModuleEnabled("paQuestAnswers") : true;
    }
    async function loadData() {
      if (dataLoadAttempted) return questData;
      dataLoadAttempted = true;
      const cached = localStorage.getItem(PA_DATA_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            questData = parsed.data;
            return questData;
          }
        } catch (e) {
        }
      }
      try {
        const resp = await fetch(PA_DATA_URL, { cache: "no-cache" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data2 = await resp.json();
        if (Array.isArray(data2) && data2.length > 0) {
          questData = data2;
          localStorage.setItem(PA_DATA_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: data2
          }));
        }
      } catch (e) {
        console.error("[PA\u4EFB\u52A1] \u6570\u636E\u52A0\u8F7D\u5931\u8D25:", e);
        if (!questData && cached) {
          try {
            questData = JSON.parse(cached).data;
          } catch (e2) {
          }
        }
      }
      return questData;
    }
    function calcMatchRate(text, question) {
      const t = text.toLowerCase().replace(/\s+/g, "").replace(/[^a-z\u4e00-\u9fff]/g, "");
      const q = question.toLowerCase().replace(/\s+/g, "").replace(/\$%s/g, "").replace(/%s/g, "").replace(/%\([\w]+\)\w/g, "").replace(/:re-\d+:/g, "").replace(/[^a-z\u4e00-\u9fff]/g, "");
      if (!q || !t) return 0;
      let qi = 0;
      for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
      }
      const qToT = qi / q.length;
      let ti2 = 0;
      for (let qi2 = 0; qi2 < q.length && ti2 < t.length; qi2++) {
        if (q[qi2] === t[ti2]) ti2++;
      }
      const tToQ = ti2 / t.length;
      return qToT >= 0.85 ? qToT : Math.min(qToT, tToQ);
    }
    function findBestMatch(text) {
      if (!questData || !text || text.length < 3) return null;
      let best = null;
      let bestScore = 0;
      for (const q of questData) {
        const variants = [];
        if (q.q_sc) variants.push({ text: q.q_sc, lang: "sc" });
        if (q.q_tc) variants.push({ text: q.q_tc, lang: "tc" });
        if (q.q_en) variants.push({ text: q.q_en, lang: "en" });
        for (const v of variants) {
          const score = calcMatchRate(text, v.text);
          if (score > bestScore) {
            bestScore = score;
            best = { quest: q, lang: v.lang, qText: v.text };
          }
        }
      }
      return bestScore >= MATCH_THRESHOLD ? best : null;
    }
    function extractText(element) {
      const parts = [];
      function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = (node.textContent || "").trim();
          if (t) parts.push(t);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName;
          if (tag === "A" || tag === "SCRIPT" || tag === "STYLE") return;
          for (let child = node.firstChild; child; child = child.nextSibling) {
            walk(child);
          }
        }
      }
      walk(element);
      return parts.join("").trim();
    }
    function getTextBefore(element, stopEl) {
      const parts = [];
      function walk(node) {
        if (node === stopEl) return true;
        if (node.nodeType === Node.TEXT_NODE) {
          const t = (node.textContent || "").trim();
          if (t) parts.push(t);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tag = node.tagName;
          if (tag === "A" || tag === "SCRIPT" || tag === "STYLE") return false;
          for (let child = node.firstChild; child; child = child.nextSibling) {
            if (walk(child)) return true;
          }
        }
        return false;
      }
      walk(element);
      return parts.join("").trim();
    }
    function getMessageTexts(element) {
      var paReply = element.querySelector("a.pa-reply");
      if (paReply) {
        var text = getTextBefore(element, paReply);
        if (text) return [{ text, el: element }];
        return [];
      }
      var results = [];
      var children = element.children;
      if (children.length > 1) {
        for (var i = 0; i < children.length; i++) {
          var childText = extractText(children[i]);
          if (childText && childText.length > 3) {
            results.push({ text: childText, el: children[i] });
          }
        }
        var fullText = extractText(element);
        if (fullText) results.push({ text: fullText, el: element });
      }
      if (results.length === 0) {
        var fullText = extractText(element);
        if (fullText) results.push({ text: fullText, el: element });
      }
      return results;
    }
    function findPaMessageElement(link) {
      var el = link.parentElement;
      while (el && el !== document.body) {
        if (el.tagName === "DIV") {
          var text = getTextBefore(el, link);
          if (text && text.length >= 3 && !isChatContainer(el) && !el.querySelector(".input-group")) {
            return el;
          }
        }
        el = el.parentElement;
      }
      return null;
    }
    function isSafeAnswerParent(el) {
      if (!el || el === document.body) return false;
      if (isChatContainer(el)) return false;
      if (el.querySelector && el.querySelector(".input-group")) return false;
      if (el.querySelector && el.querySelector('div.css-xo2rg1.e1llepen2, div[style*="column-reverse"][style*="overflow"]')) return false;
      if (el.querySelector && el.querySelector("a.pa-reply")) return true;
      return !!(el.parentElement && isChatContainer(el.parentElement));
    }
    function createAnswerUI(match2) {
      const { quest, lang } = match2;
      const answer = quest["a_" + lang] || quest.a_sc || quest.a_tc || quest.a_en || "";
      const effect = quest.effect || "";
      const box = document.createElement("div");
      box.className = "sc-pa-answer-box";
      box.style.cssText = "margin-top:6px;padding:8px 10px;border-radius:6px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:3px;";
      const answerRow = document.createElement("div");
      answerRow.style.cssText = "display:flex;align-items:flex-start;gap:6px;";
      const ansLabel = document.createElement("span");
      ansLabel.style.cssText = "font-weight:bold;color:#16a34a;white-space:nowrap;flex-shrink:0;";
      ansLabel.textContent = "\u7B54\u6848\uFF1A";
      const ansValue = document.createElement("span");
      ansValue.style.cssText = "color:#333;word-break:break-word;flex:1;";
      ansValue.textContent = answer;
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "\u590D\u5236";
      copyBtn.title = "\u590D\u5236\u7B54\u6848\u548C\u6548\u679C";
      copyBtn.style.cssText = "background:none;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px;padding:0 5px;line-height:1.8;flex-shrink:0;color:#666;transition:all 0.2s;";
      copyBtn.onmouseenter = function() {
        this.style.borderColor = "#666";
        this.style.color = "#333";
      };
      copyBtn.onmouseleave = function() {
        this.style.borderColor = "#ccc";
        this.style.color = "#666";
      };
      copyBtn.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        const copyStr = "\u7B54\u6848: " + answer + (effect ? "\n\u6548\u679C: " + effect : "");
        navigator.clipboard.writeText(copyStr).then(function() {
          copyBtn.textContent = "\u2705";
          setTimeout(function() {
            copyBtn.textContent = "\u{1F4CB}";
          }, 2e3);
        }).catch(function() {
          const ta = document.createElement("textarea");
          ta.value = copyStr;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          copyBtn.textContent = "\u2705";
          setTimeout(function() {
            copyBtn.textContent = "\u{1F4CB}";
          }, 2e3);
        });
      };
      answerRow.appendChild(ansLabel);
      answerRow.appendChild(ansValue);
      answerRow.appendChild(copyBtn);
      box.appendChild(answerRow);
      if (effect) {
        const effectRow = document.createElement("div");
        effectRow.style.cssText = "display:flex;align-items:flex-start;gap:6px;";
        const effLabel = document.createElement("span");
        effLabel.style.cssText = "font-weight:bold;color:#ea580c;white-space:nowrap;flex-shrink:0;";
        effLabel.textContent = "\u6548\u679C\uFF1A";
        const effValue = document.createElement("span");
        effValue.style.cssText = "color:#555;word-break:break-word;";
        effValue.textContent = effect;
        effectRow.appendChild(effLabel);
        effectRow.appendChild(effValue);
        box.appendChild(effectRow);
      }
      return box;
    }
    function processMessage(element) {
      if (element.scPaProcessed) return;
      element.scPaProcessed = true;
      if (!isSafeAnswerParent(element)) {
        return;
      }
      var entries = getMessageTexts(element);
      for (var ti = 0; ti < entries.length; ti++) {
        if (!entries[ti].text || entries[ti].text.length < 3) continue;
        var match2 = findBestMatch(entries[ti].text);
        if (match2) {
          if (element.querySelector(".sc-pa-answer-box")) return;
          var answerUI = createAnswerUI(match2);
          answerUI.dataset.scPaQuestion = match2.qText;
          var target = element;
          if (entries[ti].el !== element && entries[ti].el.tagName === "DIV" && isSafeAnswerParent(entries[ti].el)) {
            target = entries[ti].el;
          }
          if (!isSafeAnswerParent(target)) return;
          target.appendChild(answerUI);
          return;
        }
      }
    }
    function scanPage() {
      if (!questData || questData.length === 0) return;
      document.querySelectorAll("a.pa-reply").forEach(function(link) {
        var msgEl = findPaMessageElement(link);
        if (msgEl && !msgEl.scPaProcessed) {
          processMessage(msgEl);
        }
      });
      var chatContainers = findChatContainers();
      chatContainers.forEach(function(container) {
        container.querySelectorAll(":scope > div").forEach(function(msgEl) {
          if (!msgEl.scPaProcessed) {
            processMessage(msgEl);
          }
        });
      });
      var paReplyLinksForContainer = document.querySelectorAll("a.pa-reply");
      if (paReplyLinksForContainer.length > 0) {
        var paContainer = paReplyLinksForContainer[0].parentElement;
        for (var i = 0; i < 10 && paContainer && paContainer !== document.body; i++) {
          var allInside = true;
          for (var j = 0; j < paReplyLinksForContainer.length; j++) {
            if (!paContainer.contains(paReplyLinksForContainer[j])) {
              allInside = false;
              break;
            }
          }
          if (allInside && paContainer.children.length >= 2) break;
          paContainer = paContainer.parentElement;
        }
        if (paContainer && paContainer !== document.body && !paContainer.querySelector(".sc-pa-answer-box")) {
          Array.from(paContainer.children).forEach(function(child) {
            if (!child.scPaProcessed && child.textContent.trim().length > 3 && !child.querySelector("a.pa-reply") && !child.querySelector(".sc-pa-answer-box")) {
              processMessage(child);
            }
          });
        }
      }
    }
    function findChatContainers() {
      const byClass = document.querySelectorAll("div.css-xo2rg1.e1llepen2");
      if (byClass.length > 0) return byClass;
      return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
    }
    function isChatContainer(el) {
      if (!el || el.nodeType !== 1 || !el.matches) return false;
      return el.matches("div.css-xo2rg1.e1llepen2") || el.matches('div[style*="column-reverse"][style*="overflow"]');
    }
    function isMessageLevelElement(el) {
      if (!el || el === document.body || isChatContainer(el)) return false;
      if (el.querySelector && el.querySelector("a.pa-reply")) return true;
      return !!(el.parentElement && isChatContainer(el.parentElement));
    }
    function cleanupStaleAnswers() {
      var boxes = document.querySelectorAll(".sc-pa-answer-box");
      for (var i = 0; i < boxes.length; i++) {
        var box = boxes[i];
        var parent = box.parentElement;
        if (!parent || !parent.isConnected) {
          box.remove();
          continue;
        }
        var qText = box.dataset.scPaQuestion;
        var valid = false;
        if (qText && !isChatContainer(parent)) {
          var entries = getMessageTexts(parent);
          for (var ti = 0; ti < entries.length; ti++) {
            if (calcMatchRate(entries[ti].text, qText) >= MATCH_THRESHOLD) {
              valid = true;
              break;
            }
          }
        }
        if (valid) continue;
        box.remove();
        parent.scPaProcessed = false;
        if (isMessageLevelElement(parent)) {
          processMessage(parent);
        }
      }
    }
    function scheduleCleanup() {
      if (cleanupTimer) return;
      cleanupTimer = setTimeout(function() {
        cleanupTimer = null;
        cleanupStaleAnswers();
      }, 300);
    }
    async function init2() {
      if (!/\/messages(\/|$)/.test(location.href)) {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        initAttempted = false;
        dataLoadAttempted = false;
        return;
      }
      if (!isEnabled()) return;
      await loadData();
      if (!questData || questData.length === 0) {
        dataLoadAttempted = false;
        setTimeout(init2, 3e3);
        return;
      }
      if (initAttempted) return;
      initAttempted = true;
      scanPage();
      cleanupStaleAnswers();
      if (observer) observer.disconnect();
      observer = new MutationObserver(function(mutations) {
        if (!isEnabled()) return;
        for (var mi = 0; mi < mutations.length; mi++) {
          var m = mutations[mi];
          for (var ni = 0; ni < m.addedNodes.length; ni++) {
            var n = m.addedNodes[ni];
            if (n.nodeType === 1) {
              scanElement(n);
            }
          }
        }
        scheduleCleanup();
      });
      findChatContainers().forEach(function(c) {
        observer.observe(c, { childList: true, subtree: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    function scanElement(element) {
      if (!questData || questData.length === 0) return;
      if (element.tagName === "A" && element.classList.contains("pa-reply")) {
        var msgEl = findPaMessageElement(element);
        if (msgEl && !msgEl.scPaProcessed) {
          processMessage(msgEl);
        }
        return;
      }
      if (element.matches && element.matches('div[style*="column-reverse"][style*="overflow"]')) {
        element.querySelectorAll(":scope > div").forEach(function(msgEl2) {
          if (!msgEl2.scPaProcessed) processMessage(msgEl2);
        });
        return;
      }
      if (element.querySelectorAll) {
        var links = element.querySelectorAll("a.pa-reply");
        if (links.length > 0) {
          links.forEach(function(link) {
            var msgEl2 = findPaMessageElement(link);
            if (msgEl2 && !msgEl2.scPaProcessed) {
              processMessage(msgEl2);
            }
          });
        }
      }
      if (element.querySelectorAll && !isChatContainer(element)) {
        var nestedContainers = element.querySelectorAll('div.css-xo2rg1.e1llepen2, div[style*="column-reverse"][style*="overflow"]');
        nestedContainers.forEach(function(c) {
          c.querySelectorAll(":scope > div").forEach(function(msgEl2) {
            if (!msgEl2.scPaProcessed) processMessage(msgEl2);
          });
        });
      }
      if (!element.scPaProcessed && element.nodeType === 1 && element.textContent.trim().length > 5) {
        if (element.matches && element.matches('div[style*="column-reverse"]')) return;
        processMessage(element);
      }
    }
    var lastUrl = location.href;
    new MutationObserver(function() {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        initAttempted = false;
        dataLoadAttempted = false;
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        setTimeout(init2, 300);
      }
    }).observe(document, { subtree: true, childList: true });
    setTimeout(init2, 500);
    return { init: init2 };
  })();

  // src/features/pageObserver.js
  var ResourceMarketHandler = { init: (...args) => window.SC_Modules?.ResourceMarketHandler?.init(...args) };
  var incomingContractsHandler = { init: (...args) => window.SC_Modules?.incomingContractsHandler?.init(...args) };
  var outgoingContractMPHandler = { init: (...args) => window.SC_Modules?.outgoingContractMPHandler?.init(...args) };
  var ExecutiveTrainingModule = { init: (...args) => window.SC_Modules?.ExecutiveTrainingModule?.init(...args) };
  var FormerExecutivesModule = { forceInject: (...args) => window.SC_Modules?.FormerExecutivesModule?.forceInject(...args) };
  var LandscapeIdleBuildingHighlight = { init: (...args) => window.SC_Modules?.LandscapeIdleBuildingHighlight?.init(...args) };
  var RestaurantStockReminder = { init: (...args) => window.SC_Modules?.RestaurantStockReminder?.init(...args) };
  (function() {
    const PAGE_ACTIONS = {
      marketPage: {
        //交易所页面
        pattern: /^https:\/\/www\.simcompanies\.com(?:\/[^\/]+)?\/market\/resource\/(\d+)\/?$/,
        action: (url) => {
          let messageIconEnabled = false;
          try {
            const config = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
            messageIconEnabled = config["marketMessageIcon"] === true;
          } catch (e) {
          }
          if (!isPageModuleEnabled("marketProfit") && !messageIconEnabled) return;
          const match2 = url.match(/\/resource\/(\d+)\/?/);
          const resourceId = match2 ? match2[1] : null;
          if (resourceId) {
            ResourceMarketHandler.init(resourceId);
          }
        }
      },
      contractPage: {
        //合同页面
        pattern: /^https:\/\/www\.simcompanies\.com(?:\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/,
        action: (url) => {
          if (!isPageModuleEnabled("contractProfit")) return;
          incomingContractsHandler.init();
        }
      },
      outgoingContractPage: {
        //出库合同/出售页面
        pattern: /^https:\/\/www\.simcompanies\.com(?:\/[a-z-]+)?\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/,
        action: (url) => {
          if (!isPageModuleEnabled("outgoingMP")) return;
          outgoingContractMPHandler.init();
        }
      },
      executivePage: {
        //高管挖人
        pattern: /\/executives\/([a-z0-9-]+)\/?$/,
        action: (url) => {
          if (!isPageModuleEnabled("executiveHistory")) return;
          const match2 = url.match(/\/executives\/([a-z0-9-]+)\/?$/);
          const slotCode = match2 ? match2[1] : null;
          if (slotCode) {
            setTimeout(() => {
              ExecutiveTrainingModule.init(slotCode);
            }, 400);
          }
        }
      },
      formerExecutivesPage: {
        //前任高管
        pattern: /\/headquarters\/executives\/?$/,
        action: (url) => {
          if (!isPageModuleEnabled("formerExecEnhance")) return;
          setTimeout(() => {
            if (typeof FormerExecutivesModule.forceInject === "function") {
              FormerExecutivesModule.forceInject();
            }
          }, 500);
        }
      },
      buildingPage: {
        //建筑页面
        pattern: /\/b\/\d+\/?$/,
        action: () => {
          RestaurantStockReminder.init();
          const tryInit = (delay, retriesLeft) => {
            setTimeout(() => {
              if (!/\/b\/\d+\/?$/.test(location.href)) return;
              if (typeof window.initAutoAmountButtons === "function") {
                window.initAutoAmountButtons();
              }
              if (typeof window.initAutoPricing === "function") {
                window.initAutoPricing();
              }
              if (retriesLeft > 0) {
                setTimeout(() => {
                  const hasAutoAmount = document.querySelector("[data-custom-amount-added]");
                  const hasAutoPricing = document.querySelector("[data-auto-pricing-added]");
                  if (!hasAutoAmount && !hasAutoPricing) {
                    tryInit(delay * 2, retriesLeft - 1);
                  }
                }, 200);
              }
            }, delay);
          };
          tryInit(300, 3);
        }
      },
      landscapePage: {
        //地图页面空闲建筑高亮
        pattern: /\/landscape\/?$/,
        action: () => {
          setTimeout(() => {
            LandscapeIdleBuildingHighlight.init();
          }, 500);
        }
      }
    };
    function handlePage() {
      const url = location.href;
      for (const { pattern, action } of Object.values(PAGE_ACTIONS)) {
        if (pattern.test(url)) {
          action(url);
          return;
        }
      }
    }
    let lastUrl = "";
    const observer = new MutationObserver(() => {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        handlePage();
      }
    });
    observer.observe(document, { subtree: true, childList: true });
    setTimeout(handlePage, 0);
  })();

  // src/features/landscapeIdleBuildingHighlight.js
  var LandscapeIdleBuildingHighlight2 = /* @__PURE__ */ (function() {
    const EXCLUDED_KINDS = ["n", "y", "3", "4", "5"];
    function getBuildingsData() {
      const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
      if (realmId === null) return null;
      try {
        const raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
        if (!raw) return null;
        const data2 = JSON.parse(raw);
        return data2.buildings || null;
      } catch (e) {
        return null;
      }
    }
    function processBuildings() {
      if (!/\/landscape\/?$/.test(location.href)) return;
      if (typeof window.isPageModuleEnabled === "function" && !window.isPageModuleEnabled("landscapeHighlight")) {
        return;
      }
      const excludedKinds = EXCLUDED_KINDS;
      const buildingsData = getBuildingsData();
      const links = document.querySelectorAll('a[href*="/b/"]');
      if (links.length === 0) {
        setTimeout(processBuildings, 1e3);
        return;
      }
      links.forEach((link, index) => {
        let buildingKind = null;
        let kindSource = "";
        const classMatch = link.className.match(/test-building-([A-Za-z0-9])/);
        if (classMatch) {
          buildingKind = classMatch[1];
          kindSource = "class";
        } else {
          const hrefMatch = link.href.match(/\/b\/(\d+)\/?/);
          if (hrefMatch && buildingsData) {
            const buildingId = parseInt(hrefMatch[1], 10);
            const bData = buildingsData.find((b) => b.id === buildingId);
            if (bData) {
              buildingKind = bData.kind;
              kindSource = "data";
            }
          }
        }
        if (!buildingKind) {
          return;
        }
        const isExcluded = excludedKinds.includes(buildingKind);
        if (isExcluded) return;
        const lvlSpan = Array.from(link.querySelectorAll("span")).find((span) => /lvl\s+\d+/i.test(span.textContent));
        if (lvlSpan) {
          const spanParent = lvlSpan.parentElement;
          if (spanParent) {
            Array.from(spanParent.children).forEach((child) => {
              if (child.tagName === "SPAN") {
                child.dataset.scLandscapeHighlight = "true";
                child.style.backgroundColor = "#FFEB3B";
                child.style.color = "#333";
                child.style.padding = "1px 4px";
                child.style.borderRadius = "3px";
                child.style.fontWeight = "bold";
              }
            });
          }
        } else {
        }
      });
    }
    function clearHighlights() {
      document.querySelectorAll("[data-sc-landscape-highlight]").forEach((el) => {
        el.style.backgroundColor = "";
        el.style.color = "";
        el.style.padding = "";
        el.style.borderRadius = "";
        el.style.fontWeight = "";
        delete el.dataset.scLandscapeHighlight;
      });
    }
    function init2() {
      if (!/\/landscape\/?$/.test(location.href)) return;
      setTimeout(processBuildings, 500);
    }
    return { init: init2 };
  })();
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.LandscapeIdleBuildingHighlight = LandscapeIdleBuildingHighlight2;

  // src/constants/resourceMap.js
  var resourceIdNameMap = { 1: "\u7535\u529B", 2: "\u6C34", 3: "\u82F9\u679C", 4: "\u6A58\u5B50", 5: "\u8461\u8404", 6: "\u8C37\u7269", 7: "\u725B\u6392", 8: "\u9999\u80A0", 9: "\u9E21\u86CB", 10: "\u539F\u6CB9", 11: "\u6C7D\u6CB9", 12: "\u67F4\u6CB9", 13: "\u8FD0\u8F93\u5355\u4F4D", 14: "\u77FF\u7269", 15: "\u94DD\u571F\u77FF", 16: "\u7845\u6750", 17: "\u5316\u5408\u7269", 18: "\u94DD\u6750", 19: "\u5851\u6599", 20: "\u5904\u7406\u5668", 21: "\u7535\u5B50\u5143\u4EF6", 22: "\u7535\u6C60", 23: "\u663E\u793A\u5C4F", 24: "\u667A\u80FD\u624B\u673A", 25: "\u5E73\u677F\u7535\u8111", 26: "\u7B14\u8BB0\u672C\u7535\u8111", 27: "\u663E\u793A\u5668", 28: "\u7535\u89C6\u673A", 29: "\u4F5C\u7269\u7814\u7A76", 30: "\u80FD\u6E90\u7814\u7A76", 31: "\u91C7\u77FF\u7814\u7A76", 32: "\u7535\u5668\u7814\u7A76", 33: "\u755C\u7267\u7814\u7A76", 34: "\u5316\u5B66\u7814\u7A76", 35: "\u8F6F\u4EF6", 36: "undefined", 37: "undefined", 38: "undefined", 39: "undefined", 40: "\u68C9\u82B1", 41: "\u68C9\u5E03", 42: "\u94C1\u77FF\u77F3", 43: "\u94A2\u6750", 44: "\u6C99\u5B50", 45: "\u73BB\u7483", 46: "\u76AE\u9769", 47: "\u8F66\u8F7D\u7535\u8111", 48: "\u7535\u52A8\u9A6C\u8FBE", 49: "\u8C6A\u534E\u8F66\u5185\u9970", 50: "\u57FA\u672C\u5185\u9970", 51: "\u8F66\u8EAB", 52: "\u5185\u71C3\u673A", 53: "\u7ECF\u6D4E\u7535\u52A8\u8F66", 54: "\u8C6A\u534E\u7535\u52A8\u8F66", 55: "\u7ECF\u6D4E\u71C3\u6CB9\u8F66", 56: "\u8C6A\u534E\u71C3\u6CB9\u8F66", 57: "\u5361\u8F66", 58: "\u6C7D\u8F66\u7814\u7A76", 59: "\u65F6\u88C5\u7814\u7A76", 60: "\u5185\u8863", 61: "\u624B\u5957", 62: "\u88D9\u5B50", 63: "\u9AD8\u8DDF\u978B", 64: "\u624B\u888B", 65: "\u8FD0\u52A8\u978B", 66: "\u79CD\u5B50", 67: "\u5723\u8BDE\u7206\u7AF9", 68: "\u91D1\u77FF\u77F3", 69: "\u91D1\u6761", 70: "\u540D\u724C\u624B\u8868", 71: "\u9879\u94FE", 72: "\u7518\u8517", 73: "\u4E59\u9187", 74: "\u7532\u70F7", 75: "\u78B3\u7EA4\u7EF4", 76: "\u78B3\u7EA4\u590D\u5408\u6750", 77: "\u673A\u8EAB", 78: "\u673A\u7FFC", 79: "\u7CBE\u5BC6\u7535\u5B50\u5143\u4EF6", 80: "\u98DE\u884C\u8BA1\u7B97\u673A", 81: "\u5EA7\u8231", 82: "\u59FF\u6001\u63A7\u5236\u5668", 83: "\u706B\u7BAD\u71C3\u6599", 84: "\u71C3\u6599\u50A8\u7F50", 85: "\u56FA\u4F53\u71C3\u6599\u52A9\u63A8\u5668", 86: "\u706B\u7BAD\u53D1\u52A8\u673A", 87: "\u9694\u70ED\u677F", 88: "\u79BB\u5B50\u63A8\u8FDB\u5668", 89: "\u55B7\u6C14\u53D1\u52A8\u673A", 90: "\u4E9A\u8F68\u9053\u4E8C\u7EA7\u706B\u7BAD", 91: "\u4E9A\u8F68\u9053\u706B\u7BAD", 92: "\u8F68\u9053\u52A9\u63A8\u5668", 93: "\u661F\u9645\u98DE\u8239", 94: "BFR", 95: "\u55B7\u6C14\u5BA2\u673A", 96: "\u8C6A\u534E\u98DE\u673A", 97: "\u5355\u5F15\u64CE\u98DE\u673A", 98: "\u65E0\u4EBA\u673A", 99: "\u4EBA\u9020\u536B\u661F", 100: "\u822A\u7A7A\u822A\u5929\u7814\u7A76", 101: "\u94A2\u7B4B\u6DF7\u51DD\u571F", 102: "\u7816\u5757", 103: "\u6C34\u6CE5", 104: "\u9ECF\u571F", 105: "\u77F3\u7070\u77F3", 106: "\u6728\u6750", 107: "\u94A2\u7B4B", 108: "\u6728\u677F", 109: "\u7A97\u6237", 110: "\u5DE5\u5177", 111: "\u5EFA\u7B51\u9884\u6784\u4EF6", 112: "\u63A8\u571F\u673A", 113: "\u6750\u6599\u7814\u7A76", 114: "\u673A\u5668\u4EBA", 115: "\u725B", 116: "\u732A", 117: "\u725B\u5976", 118: "\u5496\u5561\u8C46", 119: "\u5496\u5561\u7C89", 120: "\u852C\u83DC", 121: "\u9762\u5305", 122: "\u829D\u58EB", 123: "\u82F9\u679C\u6D3E", 124: "\u6A59\u6C41", 125: "\u82F9\u679C\u6C41", 126: "\u59DC\u6C41\u6C7D\u6C34", 127: "\u62AB\u8428", 128: "\u9762\u6761", 129: "\u6C49\u5821\u5305", 130: "\u5343\u5C42\u9762", 131: "\u8089\u4E38", 132: "\u6DF7\u5408\u679C\u6C41", 133: "\u9762\u7C89", 134: "\u9EC4\u6CB9", 135: "\u7CD6", 136: "\u53EF\u53EF", 137: "\u9762\u56E2", 138: "\u9171\u6C41", 139: "\u52A8\u7269\u9972\u6599", 140: "\u5DE7\u514B\u529B", 141: "\u690D\u7269\u6CB9", 142: "\u6C99\u62C9", 143: "\u5496\u55B1\u89D2", 144: "\u5723\u8BDE\u88C5\u9970\u54C1", 145: "\u98DF\u8C31", 146: "\u5357\u74DC", 147: "\u6770\u514B\u706F\u7B3C", 148: "\u5973\u5DEB\u670D", 149: "\u5357\u74DC\u6C64", 150: "\u6811", 151: "\u590D\u6D3B\u8282\u5154\u5154", 152: "\u658B\u6708\u7CD6\u679C", 153: "\u5DE7\u514B\u529B\u51B0\u6DC7\u6DCB", 154: "\u82F9\u679C\u51B0\u6DC7\u6DCB", 155: "\u5976\u6CB9\u9E21\u86CB" };

  // src/features/restaurantStockReminder.js
  var RestaurantStockReminder2 = (function() {
    const MENU_LABELS = ["\u83DC\u5355", "Menu", "Restaurant menu", "\u83DC\u55AE"];
    const BLOCK_ATTR = "data-sc-restaurant-menu";
    const STORAGE_REGION_KEY = (realmId) => `SimcompaniesRetailCalculation_${realmId}`;
    const SETTINGS_KEY_BASE = "SC-RestaurantStock_Settings";
    const LEGACY_SETTINGS_KEY = "SC_RestaurantStock_Settings";
    const CYCLES_PER_DAY = 2;
    const DEFAULT_WARN_DAYS = 2;
    const DEFAULT_TARGET_DAYS = 2;
    const QUALITY_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
    registerExportInfo({
      name: "\u9910\u9986\u5907\u8D27\u63D0\u9192\u8BBE\u7F6E",
      scope: "realm",
      keys: (realmId) => [getScopedKey(SETTINGS_KEY_BASE)]
    });
    const DISH_COEFF = {
      saladBar: { 117: 288, 121: 24.89, 134: 92.6, 122: 38.196, 119: 96.312, 123: 16.667 },
      mains: { 129: 3.608, 130: 4.073, 131: 3.505, 142: 9.402, 143: 10.093, 149: 9.2 },
      drinks: { 132: 4.04, 124: 144, 125: 128.955, 126: 113.984 }
    };
    const PARTITION_MULTIPLIER = { 1: 2.1, 2: 1, 3: 0.9, 4: 0.8, 5: 0.8, 6: 0.8 };
    const DEFAULT_MULTIPLIER = 0.8;
    const PARTITIONS = [
      { key: "saladBar", title: "\u6C99\u62C9\u5427" },
      { key: "mains", title: "\u4E3B\u83DC" },
      { key: "drinks", title: "\u996E\u6599" }
    ];
    const state2 = {
      watchTimer: null,
      blockNode: null,
      containerNode: null,
      lastMenuJson: "",
      lastBuildingId: "",
      view: "current",
      // 'current' | 'all' | 'quality'
      showSettings: false,
      restaurant: null,
      allRestaurants: []
    };
    function loadSettings() {
      const realmId = getRealmIdFromLink();
      if (realmId === null) return { warnDays: DEFAULT_WARN_DAYS, targetDays: DEFAULT_TARGET_DAYS, qualities: {} };
      let raw = localStorage.getItem(getScopedKey(SETTINGS_KEY_BASE));
      if (raw === null) {
        const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
        if (legacy !== null) {
          try {
            localStorage.setItem(getScopedKey(SETTINGS_KEY_BASE), legacy);
          } catch (e) {
          }
          raw = legacy;
        }
      }
      try {
        const parsed = JSON.parse(raw || "{}");
        const warnDays = Number.isFinite(Number(parsed.warnDays)) && Number(parsed.warnDays) >= 1 ? Number(parsed.warnDays) : DEFAULT_WARN_DAYS;
        const targetDays = Number.isFinite(Number(parsed.targetDays)) && Number(parsed.targetDays) >= 1 ? Number(parsed.targetDays) : DEFAULT_TARGET_DAYS;
        return {
          warnDays,
          targetDays,
          qualities: normalizeQualities(parsed.qualities)
        };
      } catch (e) {
        return { warnDays: DEFAULT_WARN_DAYS, targetDays: DEFAULT_TARGET_DAYS, qualities: {} };
      }
    }
    function normalizeQualities(qs) {
      const out = {};
      if (!qs || typeof qs !== "object") return out;
      for (const rid of Object.keys(qs)) {
        const per = qs[rid];
        if (!per || typeof per !== "object") continue;
        out[rid] = {};
        for (const kind of Object.keys(per)) {
          out[rid][kind] = normalizeQualityValue(per[kind]);
        }
      }
      return out;
    }
    function normalizeQualityValue(v) {
      let r;
      if (v && typeof v === "object" && v.min !== void 0 && v.max !== void 0) {
        r = { min: v.min ?? "auto", max: v.max ?? "auto" };
      } else if (v === void 0 || v === null || v === "" || v === "auto") {
        r = { min: "auto", max: "auto" };
      } else {
        r = { min: String(v), max: String(v) };
      }
      if (r.min !== "auto" && r.max !== "auto" && Number(r.min) > Number(r.max)) {
        const t = r.min;
        r.min = r.max;
        r.max = t;
      }
      return r;
    }
    function saveSettings(settings) {
      const realmId = getRealmIdFromLink();
      if (realmId === null) return;
      try {
        localStorage.setItem(getScopedKey(SETTINGS_KEY_BASE), JSON.stringify(settings));
      } catch (e) {
      }
    }
    function qualityRangeFor(settings, restaurantId, kind) {
      const v = settings.qualities && settings.qualities[restaurantId] && settings.qualities[restaurantId][kind];
      return v && typeof v === "object" ? { min: v.min ?? "auto", max: v.max ?? "auto" } : { min: "auto", max: "auto" };
    }
    function isFullRange(range) {
      return (range.min === "auto" || range.min === void 0) && (range.max === "auto" || range.max === void 0);
    }
    function rangeCovers(range, q) {
      if (isFullRange(range)) return true;
      const qn = Number(q);
      const min = range.min === "auto" ? 0 : Number(range.min);
      const max = range.max === "auto" ? 12 : Number(range.max);
      return qn >= min && qn <= max;
    }
    function rangeBucket(range) {
      return isFullRange(range) ? "auto" : `${range.min === "auto" ? "auto" : range.min}|${range.max === "auto" ? "auto" : range.max}`;
    }
    function qualityTagText(range) {
      if (isFullRange(range)) return "";
      const min = range.min === "auto" ? null : Number(range.min);
      const max = range.max === "auto" ? null : Number(range.max);
      if (min !== null && max !== null && min === max) return `(Q${min})`;
      if (min !== null && max !== null) return `(Q${min}-Q${max})`;
      if (min !== null) return `(Q${min}+)`;
      return `(\u2264Q${max})`;
    }
    function isEnabled() {
      return typeof window.isPageModuleEnabled !== "function" || window.isPageModuleEnabled("restaurantStock");
    }
    function init2() {
      startWatch();
    }
    function startWatch() {
      if (state2.watchTimer) return;
      state2.watchTimer = setInterval(mainFunc, 1200);
      mainFunc();
    }
    function stopWatch() {
      if (state2.watchTimer) {
        clearInterval(state2.watchTimer);
        state2.watchTimer = null;
      }
    }
    function getBuildingIdFromUrl() {
      const match2 = location.href.match(/\/b\/(\d+)(?:\/|$)/);
      return match2 ? match2[1] : null;
    }
    function loadRegionData() {
      const realmId = getRealmIdFromLink();
      if (realmId === null) return null;
      try {
        const raw = localStorage.getItem(STORAGE_REGION_KEY(realmId));
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    function findRestaurant(buildings, buildingId) {
      if (!Array.isArray(buildings)) return null;
      return buildings.find((b) => b && b.kind === "r" && String(b.id) === String(buildingId)) || null;
    }
    function findMenuContainer() {
      const labels = document.querySelectorAll("label");
      for (const label of labels) {
        const text = label.textContent ? label.textContent.trim() : "";
        if (MENU_LABELS.includes(text)) {
          const container = label.parentElement;
          if (container && container !== document.body) return container;
        }
      }
      return null;
    }
    function dishName(kind) {
      return resourceIdNameMap[kind] || `#${kind}`;
    }
    function perCycleConsume(level, kind, partitionCount, isLuxury, coeff) {
      const multiplier = PARTITION_MULTIPLIER[partitionCount] ?? DEFAULT_MULTIPLIER;
      const luxuryFactor = isLuxury ? 0.5 : 1;
      return Math.ceil((level || 1) * coeff * multiplier * luxuryFactor);
    }
    function stockList(resources) {
      if (!resources) return null;
      if (Array.isArray(resources)) return resources;
      if (Array.isArray(resources.resources)) return resources.resources;
      if (Array.isArray(resources.items)) return resources.items;
      return null;
    }
    function buildStockMap(resources, range) {
      const list = stockList(resources);
      if (!list) return null;
      const full = isFullRange(range);
      const min = full ? null : range.min === "auto" ? 0 : Number(range.min);
      const max = full ? null : range.max === "auto" ? 12 : Number(range.max);
      const map = /* @__PURE__ */ new Map();
      for (const entry of list) {
        if (entry.blocked === true) continue;
        if (!full) {
          const q = Number(entry.quality);
          if (!Number.isFinite(q) || q < min || q > max) continue;
        }
        const entryKind = entry.kind ?? entry.resource ?? entry.resourceId ?? entry.id;
        if (entryKind === null || entryKind === void 0) continue;
        const amount = entry.amount ?? entry.quantity ?? 0;
        if (typeof amount !== "number" || !Number.isFinite(amount)) continue;
        const key = String(entryKind);
        map.set(key, (map.get(key) || 0) + amount);
      }
      return map;
    }
    function stockForKind(stockMap, kind) {
      if (!stockMap) return null;
      const key = String(kind);
      return stockMap.has(key) ? stockMap.get(key) : 0;
    }
    function otherRestaurantCountForDish(allRestaurants, currentId, kind) {
      let count = 0;
      for (const r of allRestaurants) {
        if (String(r.id) === String(currentId)) continue;
        const props = r.restaurantProperties || {};
        let has = false;
        for (const p of PARTITIONS) {
          const items = Array.isArray(props[p.key]) ? props[p.key] : [];
          if (items.some((item) => String(item.kind) === String(kind))) {
            has = true;
            break;
          }
        }
        if (has) count++;
      }
      return count;
    }
    function getMenuRows(restaurant, settings) {
      const props = restaurant.restaurantProperties || {};
      const isLuxury = props.isLuxury === true;
      const level = restaurant.size ?? 1;
      const counts = {};
      const dishes = [];
      for (const p of PARTITIONS) {
        const items = Array.isArray(props[p.key]) ? props[p.key] : [];
        counts[p.key] = items.length;
        for (const item of items) {
          dishes.push({ partition: p.key, kind: item.kind });
        }
      }
      return dishes.map((d) => {
        const coeff = DISH_COEFF[d.partition] && DISH_COEFF[d.partition][d.kind];
        const perCycle = coeff ? perCycleConsume(level, d.kind, counts[d.partition], isLuxury, coeff) : null;
        const range = qualityRangeFor(settings, restaurant.id, d.kind);
        return { kind: d.kind, name: dishName(d.kind), perCycle, range };
      });
    }
    function buildCurrentTable(restaurant, allRestaurants, settings) {
      const rows = getMenuRows(restaurant, settings);
      if (rows.length === 0) {
        return '<div style="opacity:.75;padding:4px 2px;">\u8BE5\u9910\u9986\u672A\u9009\u62E9\u4EFB\u4F55\u83DC\u54C1</div>';
      }
      const rowHtml = rows.map((r) => {
        const otherCount = otherRestaurantCountForDish(allRestaurants, restaurant.id, r.kind);
        const otherHint = otherCount > 0 ? `<span style="opacity:.6;margin-left:4px;">\uFF08\u8FD8\u6709${otherCount}\u5BB6\u9910\u9986\u5728\u6D88\u8017\uFF09</span>` : "";
        const qualityTag = qualityTagText(r.range);
        const dailyText = r.perCycle === null ? "\u2014" : (r.perCycle * CYCLES_PER_DAY).toLocaleString();
        return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${rangeBucket(r.range)}" style="border-bottom:1px solid rgba(128,128,128,.15);">
                <td style="padding:3px 6px;">${r.name}${qualityTag ? ` <span style="opacity:.7;">${qualityTag}</span>` : ""}${otherHint}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">\u2014</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${dailyText}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">\u2014</td>
                <td data-sc-shortfall data-sc-shortfall-raw="" style="padding:3px 6px;text-align:right;cursor:pointer;" title="\u70B9\u51FB\u590D\u5236\u5DEE\u91CF">\u2014</td>
            </tr>`;
      }).join("");
      return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">\u83DC\u54C1</th>
                        <th style="padding:3px 6px;text-align:right;">\u5E93\u5B58</th>
                        <th style="padding:3px 6px;text-align:right;">\u6BCF\u65E5\u6D88\u8017</th>
                        <th style="padding:3px 6px;text-align:right;">\u5269\u4F59\u5929\u6570</th>
                        <th style="padding:3px 6px;text-align:right;">\u5DEE\u91CF</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }
    function buildAllTable(allRestaurants, settings) {
      const buckets = /* @__PURE__ */ new Map();
      for (const r of allRestaurants) {
        const props = r.restaurantProperties || {};
        if (!props) continue;
        const isLuxury = props.isLuxury === true;
        const level = r.size ?? 1;
        for (const p of PARTITIONS) {
          const items = Array.isArray(props[p.key]) ? props[p.key] : [];
          const count = items.length;
          for (const item of items) {
            const coeff = DISH_COEFF[p.key] && DISH_COEFF[p.key][item.kind];
            if (!coeff) continue;
            const perCycle = perCycleConsume(level, item.kind, count, isLuxury, coeff);
            const range = qualityRangeFor(settings, r.id, item.kind);
            const bucket = rangeBucket(range);
            const key = `${item.kind}|${bucket}`;
            const entry = buckets.get(key) || { kind: String(item.kind), bucket, range, dailyTotal: 0, restCount: 0 };
            entry.dailyTotal += perCycle * CYCLES_PER_DAY;
            entry.restCount += 1;
            buckets.set(key, entry);
          }
        }
      }
      const resources = loadRegionData()?.warehouseResources ?? null;
      const rows = [...buckets.values()].map((b) => {
        const stockMap = buildStockMap(resources, b.range);
        const stock = stockForKind(stockMap, b.kind);
        const days = stock !== null && b.dailyTotal > 0 ? stock / b.dailyTotal : null;
        const shortfall = stock !== null && b.dailyTotal > 0 ? Math.max(0, Math.ceil(b.dailyTotal * settings.targetDays) - stock) : null;
        return { ...b, name: dishName(b.kind), stock, days, shortfall };
      });
      rows.sort((a, b) => {
        if (a.days === null && b.days === null) return 0;
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });
      if (rows.length === 0) {
        return '<div style="opacity:.75;padding:4px 2px;">\u672A\u68C0\u6D4B\u5230\u53EF\u8BA1\u7B97\u83DC\u54C1\uFF08\u6216\u6CA1\u6709\u9910\u9986\uFF09</div>';
      }
      const rowHtml = rows.map((r) => {
        const warn = r.days !== null && r.days < settings.warnDays;
        const daysText = r.days === null ? "\u2014" : warn ? `\u26A0\uFE0F ${r.days.toFixed(2)}` : r.days.toFixed(2);
        const shortfallText = r.shortfall === null ? "\u2014" : r.shortfall.toLocaleString();
        const qualityTag = qualityTagText(r.range);
        return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${r.bucket}" style="border-bottom:1px solid rgba(128,128,128,.15);${warn ? "background:rgba(220,38,38,.15);" : ""}">
                <td style="padding:3px 6px;">${r.name}${qualityTag ? ` <span style="opacity:.7;">${qualityTag}</span>` : ""}</td>
                <td data-sc-restcount style="padding:3px 6px;text-align:right;">${r.restCount}</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.dailyTotal.toLocaleString()}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">${r.stock === null ? "\u2014" : r.stock.toLocaleString()}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">${daysText}</td>
                <td data-sc-shortfall data-sc-shortfall-raw="${r.shortfall === null ? "" : r.shortfall}" style="padding:3px 6px;text-align:right;cursor:pointer;" title="\u70B9\u51FB\u590D\u5236\u5DEE\u91CF">${shortfallText}</td>
            </tr>`;
      }).join("");
      return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">\u83DC\u54C1</th>
                        <th style="padding:3px 6px;text-align:right;">\u6D89\u53CA\u9910\u9986</th>
                        <th style="padding:3px 6px;text-align:right;">\u6BCF\u65E5\u6D88\u8017</th>
                        <th style="padding:3px 6px;text-align:right;">\u5E93\u5B58</th>
                        <th style="padding:3px 6px;text-align:right;">\u5269\u4F59\u5929\u6570</th>
                        <th style="padding:3px 6px;text-align:right;">\u5DEE\u91CF</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }
    function buildQualityDetailTable(allRestaurants, settings) {
      const agg = /* @__PURE__ */ new Map();
      let hasExplicitRange = false;
      for (const r of allRestaurants) {
        const props = r.restaurantProperties || {};
        if (!props) continue;
        const isLuxury = props.isLuxury === true;
        const level = r.size ?? 1;
        for (const p of PARTITIONS) {
          const items = Array.isArray(props[p.key]) ? props[p.key] : [];
          const count = items.length;
          for (const item of items) {
            const coeff = DISH_COEFF[p.key] && DISH_COEFF[p.key][item.kind];
            if (!coeff) continue;
            const perCycle = perCycleConsume(level, item.kind, count, isLuxury, coeff);
            const daily = perCycle * CYCLES_PER_DAY;
            const range = qualityRangeFor(settings, r.id, item.kind);
            if (!isFullRange(range)) hasExplicitRange = true;
            const kindKey = String(item.kind);
            let entry = agg.get(kindKey);
            if (!entry) {
              entry = { dailyByQuality: /* @__PURE__ */ new Map(), restByQuality: /* @__PURE__ */ new Map() };
              agg.set(kindKey, entry);
            }
            for (const q of QUALITY_VALUES) {
              if (!rangeCovers(range, q)) continue;
              entry.dailyByQuality.set(q, (entry.dailyByQuality.get(q) || 0) + daily);
              entry.restByQuality.set(q, (entry.restByQuality.get(q) || 0) + 1);
            }
          }
        }
      }
      const resources = loadRegionData()?.warehouseResources ?? null;
      const stockCache = /* @__PURE__ */ new Map();
      const stockMapForQ = (q) => {
        if (!stockCache.has(q)) stockCache.set(q, buildStockMap(resources, { min: q, max: q }));
        return stockCache.get(q);
      };
      const rows = [];
      for (const [kind, entry] of agg.entries()) {
        for (const q of QUALITY_VALUES) {
          const daily = entry.dailyByQuality.get(q);
          const restCount = entry.restByQuality.get(q);
          if (!daily || !restCount) continue;
          const stock = stockForKind(stockMapForQ(q), kind);
          if (!hasExplicitRange && (stock === null || stock === 0)) continue;
          const days = stock !== null && daily > 0 ? stock / daily : null;
          const shortfall = stock !== null && daily > 0 ? Math.max(0, Math.ceil(daily * settings.targetDays) - stock) : null;
          rows.push({ kind, name: dishName(kind), q, restCount, daily, stock, days, shortfall });
        }
      }
      rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : Number(a.q) - Number(b.q));
      if (rows.length === 0) {
        return '<div style="opacity:.75;padding:4px 2px;">\u672A\u68C0\u6D4B\u5230\u53EF\u8BA1\u7B97\u83DC\u54C1\uFF08\u6216\u6CA1\u6709\u9910\u9986\uFF09</div>';
      }
      const rowHtml = rows.map((r) => {
        const warn = r.days !== null && r.days < settings.warnDays;
        const daysText = r.days === null ? "\u2014" : warn ? `\u26A0\uFE0F ${r.days.toFixed(2)}` : r.days.toFixed(2);
        const shortfallText = r.shortfall === null ? "\u2014" : r.shortfall.toLocaleString();
        return `
            <tr data-sc-kind="${r.kind}" data-sc-quality="${r.q}|${r.q}" style="border-bottom:1px solid rgba(128,128,128,.15);${warn ? "background:rgba(220,38,38,.15);" : ""}">
                <td style="padding:3px 6px;">${r.name}</td>
                <td style="padding:3px 6px;text-align:right;">Q${r.q}</td>
                <td data-sc-restcount style="padding:3px 6px;text-align:right;">${r.restCount}</td>
                <td data-sc-daily style="padding:3px 6px;text-align:right;">${r.daily.toLocaleString()}</td>
                <td data-sc-stock style="padding:3px 6px;text-align:right;">${r.stock === null ? "\u2014" : r.stock.toLocaleString()}</td>
                <td data-sc-days style="padding:3px 6px;text-align:right;">${daysText}</td>
                <td data-sc-shortfall data-sc-shortfall-raw="${r.shortfall === null ? "" : r.shortfall}" style="padding:3px 6px;text-align:right;cursor:pointer;" title="\u70B9\u51FB\u590D\u5236\u5DEE\u91CF">${shortfallText}</td>
            </tr>`;
      }).join("");
      return `
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid rgba(128,128,128,.35);">
                        <th style="padding:3px 6px;">\u83DC\u54C1</th>
                        <th style="padding:3px 6px;text-align:right;">\u54C1\u8D28</th>
                        <th style="padding:3px 6px;text-align:right;">\u8986\u76D6\u9910\u9986</th>
                        <th style="padding:3px 6px;text-align:right;">\u6BCF\u65E5\u6D88\u8017</th>
                        <th style="padding:3px 6px;text-align:right;">\u5E93\u5B58</th>
                        <th style="padding:3px 6px;text-align:right;">\u5269\u4F59\u5929\u6570</th>
                        <th style="padding:3px 6px;text-align:right;">\u5DEE\u91CF</th>
                    </tr>
                </thead>
                <tbody>${rowHtml}</tbody>
            </table>`;
    }
    function qualityRangeSelectHtml(range, restId, kind) {
      const cur = { min: range.min ?? "auto", max: range.max ?? "auto" };
      const options = ['<option value="auto">\u81EA\u52A8</option>'].concat(QUALITY_VALUES.map((q) => `<option value="${q}">Q${q}</option>`)).join("");
      const mark = (selVal) => {
        if (selVal === "auto") return options;
        return options.replace(`<option value="${selVal}">Q${selVal}</option>`, `<option value="${selVal}" selected>Q${selVal}</option>`);
      };
      const minSelect = `<select data-sc-quality-min data-rest="${restId}" data-kind="${kind}" style="font-size:11px;padding:0 2px;">${mark(cur.min)}</select>`;
      const maxSelect = `<select data-sc-quality-max data-rest="${restId}" data-kind="${kind}" style="font-size:11px;padding:0 2px;">${mark(cur.max)}</select>`;
      return `<span style="white-space:nowrap;">\u4ECE ${minSelect} \u5230 ${maxSelect}</span>`;
    }
    function buildSettingsHtml(settings, currentRestaurant) {
      const restHtml = (currentRestaurant ? [currentRestaurant] : []).map((r) => {
        const props = r.restaurantProperties || {};
        const dishSpans = [];
        for (const p of PARTITIONS) {
          const items = Array.isArray(props[p.key]) ? props[p.key] : [];
          for (const item of items) {
            const range = qualityRangeFor(settings, r.id, item.kind);
            dishSpans.push(`<span style="margin-right:8px;">${dishName(item.kind)} ${qualityRangeSelectHtml(range, r.id, item.kind)}</span>`);
          }
        }
        return `
            <div style="margin-top:6px;border-top:1px dashed rgba(128,128,128,.25);padding-top:4px;">
                <div style="display:flex;flex-wrap:wrap;gap:2px 10px;">${dishSpans.join("") || '<span style="opacity:.6;">\uFF08\u65E0\u5DF2\u9009\u83DC\u54C1\uFF09</span>'}</div>
            </div>`;
      }).join("");
      return `
            <div style="margin-top:8px;border-top:1px dashed rgba(128,128,128,.35);padding-top:6px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap;">
                    <span style="display:inline-flex;align-items:center;gap:4px;">\u9884\u8B66\u5929\u6570
                        <input data-sc-warn-days type="number" min="1" value="${settings.warnDays}" style="width:52px;font-size:11px;padding:1px 4px;"></span>
                    <span style="display:inline-flex;align-items:center;gap:4px;">\u76EE\u6807\u5929\u6570
                        <input data-sc-target-days type="number" min="1" value="${settings.targetDays}" style="width:52px;font-size:11px;padding:1px 4px;"></span>
                    <span style="opacity:.65;">\u5DEE\u91CF = \u2308\u6BCF\u65E5\u6D88\u8017 \xD7 \u76EE\u6807\u5929\u6570\u2309 \u2212 \u5E93\u5B58\uFF1B\u5269\u4F59\u5929\u6570\u4F4E\u4E8E\u9884\u8B66\u5929\u6570 \u2192 \u26A0\uFE0F \u9AD8\u4EAE</span>
                </div>
                ${restHtml || '<div style="opacity:.65;">\u5F53\u524D\u9875\u9762\u4E0D\u662F\u9910\u9986</div>'}
            </div>`;
    }
    function renderIntoBlock(block, restaurant, allRestaurants) {
      const settings = loadSettings();
      const view = state2.view;
      const body = view === "all" ? buildAllTable(allRestaurants, settings) : view === "quality" ? buildQualityDetailTable(allRestaurants, settings) : buildCurrentTable(restaurant, allRestaurants, settings);
      const settingsArea = state2.showSettings ? buildSettingsHtml(settings, restaurant) : "";
      const modeText = view === "all" ? "\u5168\u90E8\u9910\u9986" : view === "quality" ? "\u54C1\u8D28\u660E\u7EC6" : "\u5F53\u524D\u9910\u9986";
      const viewBtnText = view === "all" ? "\u663E\u793A\u5F53\u524D\u9910\u9986" : "\u663E\u793A\u5168\u90E8\u9910\u9986";
      const detailBtnText = view === "quality" ? "\u5173\u95ED\u660E\u7EC6" : "\u54C1\u8D28\u660E\u7EC6";
      block.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <div style="font-weight:bold;">\u9910\u9986\u5907\u8D27\u63D0\u9192<span style="font-weight:normal;opacity:.75;margin-left:4px;">\uFF08${modeText}\uFF09</span></div>
                <div style="display:flex;gap:4px;">
                    <button data-sc-view-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">${viewBtnText}</button>
                    <button data-sc-detail-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">${detailBtnText}</button>
                    <button data-sc-settings-toggle type="button" style="font-size:11px;line-height:1.4;padding:1px 8px;border:1px solid rgba(128,128,128,.4);border-radius:4px;background:transparent;cursor:pointer;">\u5F53\u524D\u9910\u9986\u8BBE\u7F6E</button>
                </div>
            </div>
            ${body}
            ${settingsArea}
            <div style="opacity:.55;margin-top:4px;font-size:11px;">* \u9875\u9762\u5185\u4FEE\u6539\u83DC\u5355\u540E\uFF0C\u672C\u63D0\u9192\u9700\u91CD\u65B0\u8FDB\u5165\u9910\u9986\u9875\u624D\u4F1A\u66F4\u65B0</div>`;
    }
    function refreshStocks() {
      const block = state2.blockNode;
      if (!block || !block.isConnected) return;
      const region = loadRegionData();
      const resources = region ? region.warehouseResources : null;
      const settings = loadSettings();
      const fullRange = { min: "auto", max: "auto" };
      const mapCache = /* @__PURE__ */ new Map();
      const mapFor = (bucket) => {
        if (!mapCache.has(bucket)) {
          const range = bucket === "auto" ? fullRange : (() => {
            const [min, max] = bucket.split("|");
            return { min, max };
          })();
          mapCache.set(bucket, buildStockMap(resources, range));
        }
        return mapCache.get(bucket);
      };
      const rows = block.querySelectorAll("tr[data-sc-kind]");
      rows.forEach((row) => {
        const kind = row.getAttribute("data-sc-kind");
        const bucket = row.getAttribute("data-sc-quality") || "auto";
        const stock = stockForKind(mapFor(bucket), kind);
        const dailyCell = row.querySelector("[data-sc-daily]");
        const daily = dailyCell ? parseInt(String(dailyCell.textContent || "").replace(/[^\d]/g, ""), 10) : 0;
        const stockCell = row.querySelector("[data-sc-stock]");
        if (stockCell) {
          const stockText = stock === null ? "\u2014" : stock.toLocaleString();
          if (stockCell.textContent !== stockText) stockCell.textContent = stockText;
        }
        const daysCell = row.querySelector("[data-sc-days]");
        if (daysCell) {
          const days = stock !== null && daily > 0 ? stock / daily : null;
          const warn = days !== null && days < settings.warnDays;
          const daysText = days === null ? "\u2014" : warn ? `\u26A0\uFE0F ${days.toFixed(2)}` : days.toFixed(2);
          if (daysCell.textContent !== daysText) daysCell.textContent = daysText;
          row.style.background = warn ? "rgba(220,38,38,.15)" : "";
        }
        const shortfallCell = row.querySelector("[data-sc-shortfall]");
        if (shortfallCell) {
          const shortfall = stock !== null && daily > 0 ? Math.max(0, Math.ceil(daily * settings.targetDays) - stock) : null;
          const raw = shortfall === null ? "" : String(shortfall);
          const shortfallText = shortfall === null ? "\u2014" : shortfall.toLocaleString();
          if (shortfallCell.getAttribute("data-sc-shortfall-raw") !== raw) {
            shortfallCell.setAttribute("data-sc-shortfall-raw", raw);
          }
          if (shortfallCell.textContent !== shortfallText && !shortfallCell.dataset.scCopied) {
            shortfallCell.textContent = shortfallText;
          }
        }
      });
    }
    function fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {
      }
      ta.remove();
    }
    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    }
    function removeBlock() {
      if (state2.blockNode && state2.blockNode.isConnected) {
        state2.blockNode.remove();
      }
      state2.blockNode = null;
      state2.containerNode = null;
      state2.lastMenuJson = "";
      state2.lastBuildingId = "";
      state2.restaurant = null;
      state2.allRestaurants = [];
    }
    function currentMenuJson(restaurant, allRestaurants) {
      return state2.view === "all" || state2.view === "quality" ? JSON.stringify((allRestaurants || []).map((r) => r.restaurantProperties || {})) : JSON.stringify(restaurant.restaurantProperties || {});
    }
    function ensureBlock(container, restaurant, allRestaurants, buildingId) {
      const menuJson = currentMenuJson(restaurant, allRestaurants);
      if (state2.blockNode && state2.blockNode.isConnected && state2.containerNode === container && state2.lastBuildingId === buildingId && state2.lastMenuJson === menuJson) {
        return;
      }
      const block = state2.blockNode && state2.blockNode.isConnected ? state2.blockNode : document.createElement("div");
      if (!block.isConnected) {
        block.setAttribute(BLOCK_ATTR, String(restaurant.id));
        block.style.cssText = [
          "margin-top:10px",
          "padding:8px 10px",
          "border-top:1px dashed rgba(128,128,128,.5)",
          "border-bottom:1px dashed rgba(128,128,128,.5)",
          "font-size:12px",
          "line-height:1.6"
        ].join(";");
        block.addEventListener("click", (e) => {
          const toggle = e.target.closest("[data-sc-view-toggle]");
          if (toggle) {
            state2.view = state2.view === "all" ? "current" : "all";
            renderIntoBlock(block, state2.restaurant, state2.allRestaurants);
            state2.lastMenuJson = currentMenuJson(state2.restaurant, state2.allRestaurants);
            refreshStocks();
            return;
          }
          const detailBtn = e.target.closest("[data-sc-detail-toggle]");
          if (detailBtn) {
            state2.view = state2.view === "quality" ? "current" : "quality";
            renderIntoBlock(block, state2.restaurant, state2.allRestaurants);
            state2.lastMenuJson = currentMenuJson(state2.restaurant, state2.allRestaurants);
            refreshStocks();
            return;
          }
          const settingsBtn = e.target.closest("[data-sc-settings-toggle]");
          if (settingsBtn) {
            state2.showSettings = !state2.showSettings;
            renderIntoBlock(block, state2.restaurant, state2.allRestaurants);
            refreshStocks();
            return;
          }
          const shortfall = e.target.closest("[data-sc-shortfall]");
          if (shortfall) {
            const raw = shortfall.getAttribute("data-sc-shortfall-raw");
            if (raw !== null && raw !== "") {
              copyText(raw);
              shortfall.dataset.scCopied = "1";
              shortfall.textContent = `\u2713 ${Number(raw).toLocaleString()}`;
              setTimeout(() => {
                delete shortfall.dataset.scCopied;
              }, 1200);
            }
            return;
          }
        });
        block.addEventListener("change", (e) => {
          const settings = loadSettings();
          const warnInput = e.target.closest("[data-sc-warn-days]");
          if (warnInput) {
            const v = Number(warnInput.value);
            settings.warnDays = Number.isFinite(v) && v >= 1 ? v : DEFAULT_WARN_DAYS;
            saveSettings(settings);
            refreshStocks();
            return;
          }
          const targetInput = e.target.closest("[data-sc-target-days]");
          if (targetInput) {
            const v = Number(targetInput.value);
            settings.targetDays = Number.isFinite(v) && v >= 1 ? v : DEFAULT_TARGET_DAYS;
            saveSettings(settings);
            refreshStocks();
            return;
          }
          const qualityMin = e.target.closest("[data-sc-quality-min]");
          const qualityMax = e.target.closest("[data-sc-quality-max]");
          if (qualityMin || qualityMax) {
            const restId = (qualityMin || qualityMax).getAttribute("data-rest");
            const kind = (qualityMin || qualityMax).getAttribute("data-kind");
            const range = qualityRangeFor(settings, restId, kind);
            if (qualityMin) range.min = qualityMin.value;
            if (qualityMax) range.max = qualityMax.value;
            const minN = range.min === "auto" ? 0 : Number(range.min);
            const maxN = range.max === "auto" ? 12 : Number(range.max);
            if (minN > maxN) {
              if (qualityMin) range.max = range.min;
              else range.min = range.max;
            }
            if (!settings.qualities[restId]) settings.qualities[restId] = {};
            settings.qualities[restId][kind] = range;
            saveSettings(settings);
            renderIntoBlock(block, state2.restaurant, state2.allRestaurants);
            state2.lastMenuJson = currentMenuJson(state2.restaurant, state2.allRestaurants);
            refreshStocks();
            return;
          }
        });
        container.appendChild(block);
      }
      state2.blockNode = block;
      state2.containerNode = container;
      state2.restaurant = restaurant;
      state2.allRestaurants = allRestaurants || [];
      state2.lastBuildingId = buildingId;
      state2.lastMenuJson = menuJson;
      renderIntoBlock(block, restaurant, state2.allRestaurants);
    }
    function mainFunc() {
      if (!isEnabled()) {
        removeBlock();
        return;
      }
      const buildingId = getBuildingIdFromUrl();
      if (!buildingId) {
        removeBlock();
        return;
      }
      if (state2.lastBuildingId && state2.lastBuildingId !== buildingId) {
        state2.view = "current";
        state2.showSettings = false;
      }
      const region = loadRegionData();
      const buildings = region ? region.buildings : null;
      const restaurant = findRestaurant(buildings, buildingId);
      if (!restaurant) {
        removeBlock();
        return;
      }
      const allRestaurants = Array.isArray(buildings) ? buildings.filter((b) => b && b.kind === "r") : [];
      const container = findMenuContainer();
      if (!container) {
        removeBlock();
        return;
      }
      ensureBlock(container, restaurant, allRestaurants, buildingId);
      refreshStocks();
    }
    return { init: init2 };
  })();
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.RestaurantStockReminder = RestaurantStockReminder2;

  // src/utils/ui.js
  var isDarkMode = () => {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const sum = (bg.match(/\d+/g) || []).map(Number).reduce((a, b) => a + b, 0);
    return sum < 380;
  };
  var DM = () => isDarkMode();
  var theme = {
    get bg() {
      return DM() ? "#1e1e1e" : "#ffffff";
    },
    get bg2() {
      return DM() ? "#2c2c2c" : "#f5f5f5";
    },
    get bg3() {
      return DM() ? "#333333" : "#e8e8e8";
    },
    get bg4() {
      return DM() ? "#444444" : "#dddddd";
    },
    get bg5() {
      return DM() ? "#222222" : "#fafafa";
    },
    get fg() {
      return DM() ? "#efefef" : "#333333";
    },
    get fg2() {
      return DM() ? "#cccccc" : "#555555";
    },
    get fg3() {
      return DM() ? "#aaaaaa" : "#777777";
    },
    get fg4() {
      return DM() ? "#aaaaaa" : "#666666";
    },
    // 提升浅色对比度 #999→#666
    get border() {
      return DM() ? "#555555" : "#cccccc";
    },
    get border2() {
      return DM() ? "#444444" : "#dddddd";
    },
    get inputBg() {
      return DM() ? "#222222" : "#ffffff";
    },
    get inputFg() {
      return DM() ? "#efefef" : "#333333";
    },
    get toastBg() {
      return DM() ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";
    },
    get toastFg() {
      return DM() ? "#efefef" : "#333333";
    },
    get dangerFg() {
      return "#d32f2f";
    },
    // 统一使用较深红色，避免依赖颜色区分
    get successFg() {
      return "#2e7d32";
    },
    // 统一使用较深绿色
    get accent() {
      return "#2196F3";
    }
  };
  function showToast(message, type = "error") {
    let toast = document.getElementById("auto-pricing-toast");
    if (!toast) {
      const d = DM();
      toast = document.createElement("div");
      toast.id = "auto-pricing-toast";
      toast.style = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${d ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)"};
            color: ${d ? "#efefef" : "#333"};
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 99999;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            font-size: 14px;
            pointer-events: none;
            opacity: 0;
            max-width: 85vw;
            width: max-content;
            min-width: 200px;
            word-wrap: break-word;
            white-space: normal;
            text-align: center;
            box-sizing: border-box;
            line-height: 1.4;
        `;
      document.body.appendChild(toast);
    }
    toast.style.borderLeft = type === "error" ? "5px solid #ff4444" : "5px solid #4CAF50";
    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.top = "25px";
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.top = "10px";
    }, 3500);
  }

  // src/features/formerExecutivesModule.js
  var FormerExecutivesModule2 = (function() {
    const FORMER_EXEC_API_REGEX = /\/api\/v2\/companies\/(\d+)\/former-executives\//;
    const EXEC_DETAIL_API = (id) => `/api/v4/executives/${id}/`;
    const getScopedKey2 = (k) => {
      const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
      return realmId !== null ? `R${realmId}-${k}` : k;
    };
    const load = (k) => {
      try {
        return JSON.parse(localStorage.getItem(getScopedKey2(k)) || "[]");
      } catch {
        return [];
      }
    };
    const save = (k, d) => {
      localStorage.setItem(getScopedKey2(k), JSON.stringify(d));
    };
    const positionMap = (p) => ({
      o: "COO",
      f: "CFO",
      m: "CMO",
      t: "CTO",
      v: "COO\u5B66\u5F92",
      x: "CFO\u5B66\u5F92",
      y: "CMO\u5B66\u5F92",
      z: "CTO\u5B66\u5F92",
      "1": "\u804C\u54581",
      "2": "\u804C\u54582",
      "3": "\u804C\u54583",
      "4": "\u804C\u54584",
      "5": "\u804C\u54585"
    })[p] || p;
    const trainingNameMap = (t) => ({
      o: "\u7BA1\u7406\u57F9\u8BAD",
      f: "\u4F1A\u8BA1\u8BFE\u7A0B",
      m: "\u6C9F\u901A\u5DE5\u4F5C\u5BA4",
      t: "\u79D1\u5B66\u754C\u7814\u8BA8\u4F1A",
      g: "\u5404\u9886\u57DF\u8BFE\u7A0B"
    })[t] || t;
    const getCompanyLink = (realm, name) => `https://www.simcompanies.com/company/${realm}/${encodeURIComponent(name)}/`;
    function injectStyles() {
      if (document.getElementById("sc-module15-styles")) return;
      const d15s = DM();
      const style = document.createElement("style");
      style.id = "sc-module15-styles";
      style.textContent = `
            @keyframes sc-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .sc-spinner { border: 3px solid ${d15s ? "#444" : "#f3f3f3"}; border-top: 3px solid #2196f3; border-radius: 50%; width: 30px; height: 30px; animation: sc-spin 1s linear infinite; margin: 0 auto 10px auto; }
            .sc-modal-btn { margin-left: auto; padding: 6px 12px; background-color: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: all 0.2s; }
            .sc-modal-btn:hover { background-color: #1976d2; transform: translateY(-1px); box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        `;
      document.head.appendChild(style);
    }
    function processData(url, d) {
      if (!d) return;
      if (FORMER_EXEC_API_REGEX.test(url)) {
        const executives = d.executives || [];
        if (executives.length > 0) {
          save("SC-former-executives", executives);
          setTimeout(injectMoreInfoButtons, 500);
        }
      }
    }
    const _fetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await _fetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0].url || "";
      if (FORMER_EXEC_API_REGEX.test(url)) {
        res.clone().text().then((text) => {
          try {
            processData(url, JSON.parse(text));
          } catch (e) {
          }
        });
      }
      return res;
    };
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, url) {
      if (typeof url === "string" && FORMER_EXEC_API_REGEX.test(url)) {
        this.addEventListener("load", function() {
          try {
            if (this.responseText) {
              const d = JSON.parse(this.responseText);
              processData(url, d);
            }
          } catch (e) {
          }
        });
      }
      return _open.apply(this, arguments);
    };
    function showExecutiveModal(executiveId) {
      const existingModal = document.getElementById("sc-exec-modal-overlay");
      if (existingModal) existingModal.remove();
      const originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const overlay = document.createElement("div");
      overlay.id = "sc-exec-modal-overlay";
      overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.5); z-index: 99999;
            display: flex; justify-content: center; align-items: center;
            opacity: 0; transition: opacity 0.2s ease-in-out;
        `;
      const d15 = DM();
      const modal = document.createElement("div");
      modal.style.cssText = `
            background: ${d15 ? "#1e1e1e" : "#fff"}; border-radius: 8px; width: 450px; max-width: 90vw;
            max-height: 85vh; overflow-y: auto; padding: 20px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2); position: relative;
            font-family: sans-serif; transform: scale(0.95); transition: transform 0.2s ease-in-out;
            color: ${d15 ? "#efefef" : "#333"};
        `;
      modal.innerHTML = `
            <div style="display:flex; justify-content:flex-end;">
                <button id="sc-modal-close-temp" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15 ? "#aaa" : "#999"}; line-height:1;">&times;</button>
            </div>
            <div style="text-align:center; padding: 30px 20px; color:${d15 ? "#bbb" : "#666"};">
                <div class="sc-spinner"></div>
                <div>\u6B63\u5728\u8C03\u53D6\u9AD8\u7BA1\u6863\u6848...</div>
            </div>
        `;
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        modal.style.transform = "scale(1)";
      });
      const closeModal = () => {
        overlay.style.opacity = "0";
        modal.style.transform = "scale(0.95)";
        setTimeout(() => {
          overlay.remove();
          document.body.style.overflow = originalBodyOverflow;
          document.removeEventListener("keydown", handleEsc);
        }, 200);
      };
      overlay.onclick = (e) => {
        if (e.target === overlay) closeModal();
      };
      document.getElementById("sc-modal-close-temp").onclick = closeModal;
      const handleEsc = (e) => {
        if (e.key === "Escape") closeModal();
      };
      document.addEventListener("keydown", handleEsc);
      fetch(EXEC_DETAIL_API(executiveId)).then((res) => res.json()).then((data2) => {
        const trainings = data2.trainings || [];
        let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };
        const d15r = DM();
        const modalBg = d15r ? "#1e1e1e" : "#fff";
        const modalFg = d15r ? "#efefef" : "#333";
        const modalFg2 = d15r ? "#ccc" : "#555";
        const modalFg3 = d15r ? "#aaa" : "#888";
        const modalFg4 = d15r ? "#bbb" : "#666";
        const modalBorder1 = d15r ? "#444" : "#eee";
        const modalBorder2 = d15r ? "#3a3a3a" : "#e9ecef";
        const modalBg1 = d15r ? "#2a2a2a" : "#f8f9fa";
        const modalBg2 = d15r ? "#1a1a2e" : "#eef7ff";
        const modalBg2border = d15r ? "#2a3a5e" : "#cce5ff";
        const modalBg3 = d15r ? "#333" : "#fff";
        const linkColor = "#2196f3";
        const historyHtml = trainings.map((t) => {
          total.coo += t.skillCoo || 0;
          total.cfo += t.skillCfo || 0;
          total.cmo += t.skillCmo || 0;
          total.cto += t.skillCto || 0;
          const details = [];
          if (t.skillCoo) details.push(`\u7BA1\u7406+${t.skillCoo}`);
          if (t.skillCfo) details.push(`\u4F1A\u8BA1+${t.skillCfo}`);
          if (t.skillCmo) details.push(`\u6C9F\u901A+${t.skillCmo}`);
          if (t.skillCto) details.push(`\u79D1\u5B66+${t.skillCto}`);
          const detailStr = details.length > 0 ? `<span style="color:${d15r ? "#999" : "#777"}; margin-left:4px;">(${details.join(" ")})</span>` : "";
          const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm, t.employer.company);
          return `<div style="padding:6px 0; border-bottom:1px dashed ${modalBorder1}; color:${modalFg2}; font-size:14px;">\u5728 <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}</div>`;
        }).join("") || `<div style="color:${d15r ? "#888" : "#999"}; text-align:center; padding:10px;">\u65E0\u5386\u53F2\u57F9\u8BAD\u8BB0\u5F55</div>`;
        const workHistoryHtml = data2.workHistory?.map((w) => {
          const isCurrent = !w.end;
          const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm, w.employer.company);
          const posName = positionMap(w.position);
          return `
                    <div style="padding:8px 0; border-bottom:1px solid ${modalBorder1}; ${isCurrent ? "background: " + (d15r ? "#1a1a2e" : "#eef7ff") + "; padding-left:5px; border-left:3px solid #2196f3;" : ""}">
                        <span style="color:${d15r ? "#ccc" : "#444"}; font-size:14px;">
                            ${isCurrent ? "\u2B50 " : ""}\u5728
                            <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none; font-weight:${isCurrent ? "bold" : "normal"};">${w.employer.company}</a>
                            \u62C5\u4EFB <b>${w.daysActive}</b> \u5929\u7684 <b>${posName}</b>
                            ${isCurrent ? ` <span style="color:${d15r ? "#81c784" : "#2e7d32"}; font-size:13px;">(\u5F53\u524D\u6240\u5728\u804C\u4F4D)</span>` : ""}
                        </span>
                    </div>`;
        }).join("") || `<div style="color:${d15r ? "#888" : "#999"}; text-align:center; padding:10px;">\u65E0\u4ECE\u4E1A\u8BB0\u5F55</div>`;
        const currentTrainingStatus = data2.currentTraining ? `<b style="color:${linkColor};">${trainingNameMap(data2.currentTraining.training)}</b>` : `<span style="color:${d15r ? "#888" : "#999"};">\u5F53\u524D\u65E0\u57F9\u8BAD</span>`;
        modal.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid ${modalBorder1}; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0 0 4px 0; font-size:18px; color:${modalFg};">${data2.name}</h3>
                            <div style="color:${modalFg3}; font-size:12px;">\u9AD8\u7BA1ID: ${data2.id}</div>
                        </div>
                        <button id="sc-modal-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15r ? "#aaa" : "#999"}; line-height:1; padding:0 0 5px 10px;">&times;</button>
                    </div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">\u{1F4CA} \u57F9\u8BAD\u6280\u80FD\u603B\u8BA1 <span style="font-weight:normal; color:${modalFg3}; font-size:12px;">(\u5B8C\u6210 ${trainings.length} \u6B21)</span></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">\u7BA1\u7406:</span> <b style="color:${d15r ? "#ef5350" : "#d32f2f"};">+${total.coo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">\u4F1A\u8BA1:</span> <b style="color:${d15r ? "#ef5350" : "#d32f2f"};">+${total.cfo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">\u6C9F\u901A:</span> <b style="color:${d15r ? "#ef5350" : "#d32f2f"};">+${total.cmo}</b>
                        </div>
                        <div style="background:${modalBg1}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBorder2}; display:flex; justify-content:space-between;">
                            <span style="color:${modalFg4};">\u79D1\u5B66:</span> <b style="color:${d15r ? "#ef5350" : "#d32f2f"};">+${total.cto}</b>
                        </div>
                    </div>
                    <div style="font-size:14px; margin-bottom:20px; background:${modalBg2}; padding:8px 12px; border-radius:6px; border:1px solid ${modalBg2border};">
                        <span style="color:${modalFg4};">\u8FDB\u884C\u4E2D\uFF1A</span>${currentTrainingStatus}
                    </div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">\u{1F4BC} \u4ECE\u4E1A\u5C65\u5386</div>
                    <div style="max-height:160px; overflow-y:auto; background:${modalBg3}; border:1px solid ${modalBorder1}; border-radius:6px; padding:0 12px; margin-bottom:20px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${workHistoryHtml}</div>

                    <div style="font-size:14px; font-weight:bold; color:${modalFg2}; margin-bottom:8px;">\u{1F393} \u8BE6\u7EC6\u57F9\u8BAD\u5386\u53F2</div>
                    <div style="max-height:160px; overflow-y:auto; background:${modalBg3}; border:1px solid ${modalBorder1}; border-radius:6px; padding:0 12px; box-shadow:inset 0 1px 3px rgba(0,0,0,0.02);">${historyHtml}</div>
                `;
        document.getElementById("sc-modal-close").onclick = closeModal;
      }).catch(() => {
        const d15e = DM();
        modal.innerHTML = `
                    <div style="display:flex; justify-content:flex-end;">
                        <button id="sc-modal-close-err" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d15e ? "#aaa" : "#999"}; line-height:1;">&times;</button>
                    </div>
                    <div style="text-align:center; padding: 30px 20px;">
                        <div style="color:${d15e ? "#ef5350" : "#d32f2f"}; font-size:40px; margin-bottom:10px;">\u26A0\uFE0F</div>
                        <div style="color:${d15e ? "#ef5350" : "#d32f2f"}; font-weight:bold; margin-bottom:15px;">\u6863\u6848\u8C03\u53D6\u5931\u8D25</div>
                        <div style="color:${d15e ? "#bbb" : "#666"}; font-size:14px;">\u7F51\u7EDC\u53EF\u80FD\u5F00\u5C0F\u5DEE\u4E86\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002</div>
                    </div>
                `;
        document.getElementById("sc-modal-close-err").onclick = closeModal;
      });
    }
    function injectMoreInfoButtons() {
      if (!isPageModuleEnabled("formerExecEnhance")) return;
      const rows = document.querySelectorAll(".css-19er0v9");
      if (rows.length === 0) return;
      const storedExecs = load("SC-former-executives");
      if (storedExecs.length === 0) return;
      rows.forEach((row) => {
        if (row.dataset.scInjected) return;
        const infoDiv = row.children[1];
        if (!infoDiv) return;
        const nameElement = infoDiv.children[0];
        if (!nameElement) return;
        const nameText = nameElement.textContent || "";
        const nameMatch = nameText.match(/(.+?)\s*\(\d+岁\)/) || nameText.match(/(.+?)\s*\(\d+/);
        const execName = nameMatch ? nameMatch[1].trim() : nameText.trim();
        const execData = storedExecs.find((e) => e.name === execName);
        if (execData) {
          row.style.display = "flex";
          row.style.alignItems = "center";
          const btn = document.createElement("button");
          btn.className = "sc-modal-btn";
          btn.textContent = "\u8BE6\u7EC6";
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showExecutiveModal(execData.id);
          };
          row.appendChild(btn);
          row.dataset.scInjected = "true";
        }
      });
    }
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (let mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        clearTimeout(window._scInjectTimer);
        window._scInjectTimer = setTimeout(injectMoreInfoButtons, 300);
      }
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        injectStyles();
        observer.observe(document.body, { childList: true, subtree: true });
      });
    } else {
      injectStyles();
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return { forceInject: injectMoreInfoButtons };
  })();
  registerExportInfo({
    name: "\u524D\u4EFB\u9AD8\u7BA1\u8BB0\u5F55",
    scope: "realm",
    keys: (realmId) => realmId === null ? ["SC-former-executives"] : [`R${realmId}-SC-former-executives`]
  });
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.FormerExecutivesModule = FormerExecutivesModule2;

  // src/features/executiveTrainingModule.js
  var ExecutiveTrainingModule2 = (function() {
    let panelRelocateTimer = null;
    let currentPanelRenderTimer = null;
    const OFFERS_URL = "/api/v2/companies/executives/my-offers/";
    const NOTIFICATIONS_KEYWORD = "/game-notifications/";
    const EXEC_API_REGEX = /\/api\/v4\/executives\/(\d+)\/$/;
    const CURRENT_EXECS_API_REGEX = /\/api\/v3\/companies\/\d+\/executives\/?(\?|$)/;
    const CURRENT_EXECS_STORAGE_KEY = "SC-Current-Executives";
    const SLOT_MAP = {
      "coo": "o",
      "cfo": "f",
      "cmo": "m",
      "cto": "t",
      "coo-apprentice": "v",
      "cfo-apprentice": "x",
      "cmo-apprentice": "y",
      "cto-apprentice": "z",
      "g1": "1",
      "g2": "2",
      "g3": "3",
      "g4": "4",
      "g5": "5"
    };
    const getScopedKey2 = (k) => {
      const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
      return realmId !== null ? `R${realmId}-${k}` : k;
    };
    const load = (k) => {
      const key = getScopedKey2(k);
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    };
    const save = (k, d) => {
      const key = getScopedKey2(k);
      localStorage.setItem(key, JSON.stringify(d));
    };
    const upsert = (arr, obj2, key) => {
      const i = arr.findIndex((x) => x[key] === obj2[key]);
      if (i === -1) arr.push(obj2);
      else arr[i] = obj2;
      return arr;
    };
    const positionMap = (p) => ({
      o: "COO",
      f: "CFO",
      m: "CMO",
      t: "CTO",
      v: "COO\u5B66\u5F92",
      x: "CFO\u5B66\u5F92",
      y: "CMO\u5B66\u5F92",
      z: "CTO\u5B66\u5F92",
      "1": "\u804C\u54581",
      "2": "\u804C\u54582",
      "3": "\u804C\u54583",
      "4": "\u804C\u54584",
      "5": "\u804C\u54585"
    })[p] || p;
    const trainingNameMap = (t) => ({
      o: "\u7BA1\u7406\u57F9\u8BAD",
      f: "\u4F1A\u8BA1\u8BFE\u7A0B",
      m: "\u6C9F\u901A\u5DE5\u4F5C\u5BA4",
      t: "\u79D1\u5B66\u754C\u7814\u8BA8\u4F1A",
      g: "\u5404\u9886\u57DF\u8BFE\u7A0B"
    })[t] || t;
    const getCompanyLink = (realm, name) => `https://www.simcompanies.com/company/${realm}/${encodeURIComponent(name)}/`;
    const getCurrentExecSlot = () => {
      const match2 = location.pathname.match(/\/executives\/([a-z0-9-]+)\/?$/);
      return match2 ? SLOT_MAP[match2[1]] || null : null;
    };
    const getCurrentExecRecord = () => {
      const slot = getCurrentExecSlot();
      if (!slot) return null;
      return load(CURRENT_EXECS_STORAGE_KEY).find((e) => e.position === slot) || null;
    };
    const getCurrentExecPanelContainer = () => document.querySelector("#page .row > .col-lg-6") || null;
    const getReactFiber = (el) => {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
      return key ? el[key] : null;
    };
    const getHostNodeFromFiber = (fiber) => {
      const queue = [fiber];
      while (queue.length) {
        const node = queue.pop();
        if (!node) continue;
        if (node.stateNode instanceof Element) return node.stateNode;
        if (node.sibling) queue.push(node.sibling);
        if (node.child) queue.push(node.child);
      }
      return null;
    };
    const getCurrentExecTrainingSummaryNode = (execId) => {
      const page = document.getElementById("page");
      if (!page || execId == null) return null;
      const findKeyedTop = (rootFiber) => {
        const queue = [rootFiber];
        while (queue.length) {
          const node = queue.pop();
          if (!node) continue;
          if (node.key === "top") {
            const host = getHostNodeFromFiber(node);
            const hasProgress = !!(host && host.querySelector('[role="progressbar"]'));
            if (hasProgress) {
              return host;
            }
          }
          if (node.sibling) queue.push(node.sibling);
          if (node.child) queue.push(node.child);
        }
        return null;
      };
      for (const el of page.querySelectorAll("div")) {
        const fiber = getReactFiber(el);
        if (!fiber) continue;
        let node = fiber;
        while (node) {
          const props = node.memoizedProps;
          if (props && props.executive && String(props.executive.id) === String(execId)) {
            const found = findKeyedTop(node);
            if (found) return found;
            break;
          }
          node = node.return;
        }
      }
      const pageFound = findKeyedTop(getReactFiber(page));
      return pageFound;
    };
    const clearCurrentPanelRenderTimer = () => {
      if (currentPanelRenderTimer) {
        clearInterval(currentPanelRenderTimer);
        currentPanelRenderTimer = null;
      }
    };
    window.addEventListener("pagehide", clearCurrentPanelRenderTimer, { once: true });
    const ensureAgencyPanelRelocated = () => {
      const panel = document.getElementById("sc-plugin-panel");
      if (!panel) {
        if (panelRelocateTimer) {
          clearInterval(panelRelocateTimer);
          panelRelocateTimer = null;
        }
        return;
      }
      if (getValidTargetContainer()) return;
      const firstCol = getCurrentExecPanelContainer();
      if (firstCol && panel.parentElement !== firstCol) {
        firstCol.appendChild(panel);
      }
    };
    const startAgencyPanelRelocateWatch = () => {
      if (panelRelocateTimer) return;
      panelRelocateTimer = setInterval(ensureAgencyPanelRelocated, 500);
      window.addEventListener("pagehide", () => {
        if (panelRelocateTimer) {
          clearInterval(panelRelocateTimer);
          panelRelocateTimer = null;
        }
        clearCurrentPanelRenderTimer();
      }, { once: true });
    };
    const isExecutiveHistoryEnabled = () => typeof window.isPageModuleEnabled === "function" ? window.isPageModuleEnabled("executiveHistory") : true;
    function processCurrentExecutives(d) {
      const list = Array.isArray(d) ? d : d.executives || [];
      const current = list.filter((e) => e && e.id != null).map((e) => ({
        id: e.id,
        name: e.name || "",
        age: e.age ?? null,
        position: e.currentWorkHistory?.position ?? e.position ?? null
      })).filter((e) => e.position != null);
      if (current.length > 0) save(CURRENT_EXECS_STORAGE_KEY, current);
    }
    function getValidTargetContainer() {
      const TARGET_BUTTON_CLASS = "css-1r3lxky";
      const PARENT_CONTAINER_CLASS = "css-1flj9lk";
      const btn = document.querySelector(`button.${TARGET_BUTTON_CLASS}`);
      if (btn && btn.parentElement && btn.parentElement.classList.contains(PARENT_CONTAINER_CLASS)) {
        return btn.parentElement;
      }
      return null;
    }
    function renderSkillPanel(data2, isError = false, mode = "agency") {
      const targetContainer = mode === "current" ? getCurrentExecPanelContainer() : getValidTargetContainer();
      const panelId = mode === "current" ? "sc-current-exec-panel" : "sc-plugin-panel";
      const existingPanel = document.getElementById(panelId);
      if (!targetContainer || mode !== "current" && existingPanel) return;
      if (mode === "current") clearCurrentPanelRenderTimer();
      const d14 = DM();
      const panel = existingPanel || document.createElement("div");
      panel.id = panelId;
      const baseStyle = `margin-top: 12px; padding: 12px; border-radius: 4px; font-family: sans-serif; font-size: 14px; background-color: ${d14 ? "#2c2c2c" : "#f2f2f2"}; border: 1px solid ${d14 ? "#555" : "#d1d1d1"}; color: ${d14 ? "#efefef" : "#333"};${mode === "current" ? " width:100%; box-sizing:border-box;" : ""}`;
      let contentHtml = "";
      if (isError) {
        const errBg = d14 ? "#3a2e1a" : "#fff3cd";
        const errFg = d14 ? "#f0c040" : "#856404";
        const errBorder = d14 ? "#5a4a20" : "#ffeeba";
        contentHtml = `<div style="color: ${errFg}; background-color: ${errBg}; border: 1px solid ${errBorder}; padding: 8px; border-radius: 4px; font-size: 14px;">` + String.fromCodePoint(9888, 65039) + ` <b>\u5339\u914D\u5931\u8D25\uFF1A</b> \u672A\u5728\u901A\u77E5\u4E2D\u627E\u5230\u6B64\u6B21\u6316\u4EBA\u4FE1\u606F\u3002</div>
                <div style="margin-top:10px; padding:8px; background-color:${d14 ? "#3a2020" : "#fff5f5"}; border:1px solid ${d14 ? "#5a3030" : "#ffcccc"}; border-radius:4px; font-size:14px; color:${d14 ? "#ef5350" : "#c62828"}; line-height:1.4;">
                    <b>\u26A0\uFE0F\u8BF7\u6CE8\u610F\uFF1A</b><br>
                    1. \u672C\u529F\u80FD\u4E3A\u63D2\u4EF6\u529F\u80FD\uFF0C<b>\u7981\u6B62\u5728\u6E38\u620F\u5185\u804A\u5929\u5BA4\u63D0\u53CA</b>\u3002<br>
                    2. \u82E5\u5728\u53D1\u9001\u901A\u77E5\u524D\u70B9\u5F00\u9AD8\u7BA1\uFF0C\u5219\u53EF\u80FD\u5BFC\u81F4\u6B64\u6B21\u6316\u4EBA\u6570\u636E\u4E0D\u518D\u663E\u793A\u3002<br>
                    3. \u82E5\u901A\u77E5\u5185\u9AD8\u7BA1\u88AB\u4ED6\u4EBA\u62A2\u5148\u62DB\u52DF\uFF0C<b>\u5728\u70B9\u51FB"\u5BFB\u627E\u5176\u4ED6\u5019\u9009\u4EBA"\u540E\u663E\u793A\u7684\u6570\u636E\u65E0\u6548</b>\u3002
                </div>`;
      } else {
        const currentRealm2 = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
        const fg2 = d14 ? "#bbb" : "#555";
        const fg3 = d14 ? "#999" : "#777";
        const fg4 = d14 ? "#aaa" : "#888";
        const border1 = d14 ? "#555" : "#eee";
        const border2 = d14 ? "#444" : "#ddd";
        const border3 = d14 ? "#555" : "#ccc";
        const bg1 = d14 ? "#3a3a3a" : "#e6e6e6";
        const bg2 = d14 ? "#333" : "#fff";
        const bg3 = d14 ? "#333333" : "#e8e8e8";
        const bg4 = d14 ? "#3a2020" : "#fff5f5";
        const bg4border = d14 ? "#5a3030" : "#ffcccc";
        const linkColor = "#2196f3";
        const trainings = Array.isArray(data2.trainings) ? data2.trainings : [];
        const currentTraining = data2.currentTraining || null;
        const trainingTime = (t) => {
          const raw = t?.datetime || t?.start || t?.end || t?.time;
          const ts = raw ? Date.parse(raw) : NaN;
          return Number.isNaN(ts) ? Infinity : ts;
        };
        const formatTrainingTime = (t) => {
          const raw = t?.datetime || t?.start || t?.end || t?.time;
          const d = new Date(raw);
          if (!raw || Number.isNaN(d.getTime())) return "";
          const parts = new Intl.DateTimeFormat("zh-CN", {
            timeZone: "Asia/Shanghai",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }).formatToParts(d);
          const map = {};
          parts.forEach((p) => {
            map[p.type] = p.value;
          });
          return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
        };
        const isCurrentTrainingEntry = (t) => {
          if (currentTraining) {
            if (t.id != null && currentTraining.id != null && String(t.id) === String(currentTraining.id)) return true;
            if (t.datetime && currentTraining.datetime && t.datetime === currentTraining.datetime) return true;
          }
          const startRaw = t?.datetime || t?.start || t?.time;
          const start = startRaw ? Date.parse(startRaw) : NaN;
          if (Number.isNaN(start) || start > Date.now() || t.end) return false;
          return start + 27 * 60 * 60 * 1e3 > Date.now();
        };
        const sortedTrainings = [...trainings].sort((a, b) => trainingTime(a) - trainingTime(b));
        const completedTrainings = sortedTrainings.filter((t) => !isCurrentTrainingEntry(t));
        let total = { coo: 0, cfo: 0, cmo: 0, cto: 0 };
        sortedTrainings.forEach((t) => {
          total.coo += t.skillCoo || 0;
          total.cfo += t.skillCfo || 0;
          total.cmo += t.skillCmo || 0;
          total.cto += t.skillCto || 0;
        });
        const historyHtml = sortedTrainings.map((t, index) => {
          const isCurrent = isCurrentTrainingEntry(t);
          const details = [];
          if (t.skillCoo) details.push(`\u7BA1\u7406+${t.skillCoo}`);
          if (t.skillCfo) details.push(`\u4F1A\u8BA1+${t.skillCfo}`);
          if (t.skillCmo) details.push(`\u6C9F\u901A+${t.skillCmo}`);
          if (t.skillCto) details.push(`\u79D1\u5B66+${t.skillCto}`);
          const detailStr = details.length > 0 ? `<span style="color:${fg3}; margin-left:4px;">(${details.join(" ")})</span>` : "";
          const timeText = formatTrainingTime(t);
          const timeHtml = timeText ? `<span style="color:${fg3}; margin-left:6px;">${timeText}</span>` : "";
          const currentBadge = isCurrent ? `<span style="color:${d14 ? "#81c784" : "#2e7d32"}; margin-left:4px;">\uFF08\u6B63\u5728\u57F9\u8BAD\uFF09</span>` : "";
          const cUrl = getCompanyLink(t.employer.realmId ?? currentRealm2, t.employer.company);
          return `<div style="padding:2px 0; border-bottom:1px dashed ${border1}; color:${fg2}; font-size:14px;">${index + 1}. \u5728 <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none;">${t.employer.company}</a> ${trainingNameMap(t.training)}${detailStr}${timeHtml}${currentBadge}</div>`;
        }).join("") || "\u65E0\u5386\u53F2\u57F9\u8BAD\u8BB0\u5F55";
        const workHistoryHtml = data2.workHistory?.map((w) => {
          const isCurrent = !w.end;
          const cUrl = getCompanyLink(w.employer.realmId ?? currentRealm2, w.employer.company);
          const posName = positionMap(w.position);
          return `
                    <div style="padding:4px 0; border-bottom:1px solid ${border1}; ${isCurrent ? "background: " + bg3 + ";" : ""}">
                        <span style="color:${d14 ? "#ccc" : "#444"}; font-size:14px;">
                            ${isCurrent ? "\u2B50 " : ""}\u5728
                            <a href="${cUrl}" target="_blank" style="color:${linkColor}; text-decoration:none; font-weight:${isCurrent ? "bold" : "normal"};">${w.employer.company}</a>
                            \u62C5\u4EFB <b>${w.daysActive}</b> \u5929\u7684 <b>${posName}</b>
                            ${isCurrent ? ` <span style="color:${d14 ? "#81c784" : "#2e7d32"}; font-size:14px;">(\u5F53\u524D\u6240\u5728\u804C\u4F4D)</span>` : ""}
                        </span>
                    </div>`;
        }).join("") || "\u65E0\u4ECE\u4E1A\u8BB0\u5F55";
        const currentTrainingStatus = data2.currentTraining ? `<b style="color:${linkColor};">${trainingNameMap(data2.currentTraining.training)}</b>` : `<span style="color:${d14 ? "#888" : "#999"};">\u5F53\u524D\u65E0\u57F9\u8BAD</span>`;
        const panelTitle = mode === "current" ? "\u73B0\u4EFB\u9AD8\u7BA1\u8BE6\u60C5" : "\u9AD8\u7BA1\u89E3\u6790";
        const warningHtml = mode === "current" ? "" : `<div style="margin-top:10px; padding:8px; background-color:${d14 ? "#3a2020" : "#fff5f5"}; border:1px solid ${d14 ? "#5a3030" : "#ffcccc"}; border-radius:4px; font-size:14px; color:${d14 ? "#ef5350" : "#c62828"}; line-height:1.4;">
                    <b>\u26A0\uFE0F\u8BF7\u6CE8\u610F\uFF1A</b><br>
                    1. \u672C\u529F\u80FD\u4E3A\u63D2\u4EF6\u529F\u80FD\uFF0C<b>\u7981\u6B62\u5728\u6E38\u620F\u5185\u804A\u5929\u5BA4\u63D0\u53CA</b>\u3002<br>
                    2. \u82E5\u5728\u53D1\u9001\u901A\u77E5\u524D\u70B9\u5F00\u9AD8\u7BA1\uFF0C\u5219\u53EF\u80FD\u5BFC\u81F4\u6B64\u6B21\u6316\u4EBA\u6570\u636E\u4E0D\u518D\u663E\u793A\u3002<br>
                    3. \u82E5\u901A\u77E5\u5185\u9AD8\u7BA1\u88AB\u4ED6\u4EBA\u62A2\u5148\u62DB\u52DF\uFF0C<b>\u5728\u70B9\u51FB\u201C\u5BFB\u627E\u5176\u4ED6\u5019\u9009\u4EBA\u201D\u540E\u663E\u793A\u7684\u6570\u636E\u65E0\u6548</b>\u3002
                </div>`;
        contentHtml = `
                <div style="font-weight:bold; border-bottom:1px solid ${d14 ? "#555" : "#ccc"}; padding-bottom:5px; margin-bottom:8px; display:flex; justify-content:space-between;">${panelTitle} <span style="color:${d14 ? "#aaa" : "#888"}; font-size:14px; font-weight:normal;">\u9AD8\u7BA1\u540D\u5B57: ${data2.name}  ID: ${data2.id}</span></div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? "#bbb" : "#666"}; margin-bottom:4px;">\u{1F4CA} \u76EE\u524D\u57F9\u8BAD\u6280\u80FD\u603B\u548C <span style="font-weight:normal; color:${d14 ? "#aaa" : "#888"};">(\u5DF2\u5B8C\u6210 ${completedTrainings.length} \u6B21)</span></div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:6px;">
                    <div style="background:${d14 ? "#3a3a3a" : "#e6e6e6"}; padding:4px 8px; border:1px solid ${d14 ? "#444" : "#ddd"};">\u7BA1\u7406: <b style="color:${d14 ? "#ef5350" : "#d32f2f"};">+${total.coo}</b></div>
                    <div style="background:${d14 ? "#3a3a3a" : "#e6e6e6"}; padding:4px 8px; border:1px solid ${d14 ? "#444" : "#ddd"};">\u4F1A\u8BA1: <b style="color:${d14 ? "#ef5350" : "#d32f2f"};">+${total.cfo}</b></div>
                    <div style="background:${d14 ? "#3a3a3a" : "#e6e6e6"}; padding:4px 8px; border:1px solid ${d14 ? "#444" : "#ddd"};">\u6C9F\u901A: <b style="color:${d14 ? "#ef5350" : "#d32f2f"};">+${total.cmo}</b></div>
                    <div style="background:${d14 ? "#3a3a3a" : "#e6e6e6"}; padding:4px 8px; border:1px solid ${d14 ? "#444" : "#ddd"};">\u79D1\u5B66: <b style="color:${d14 ? "#ef5350" : "#d32f2f"};">+${total.cto}</b></div>
                </div>
                <div style="font-size:14px; margin-bottom:10px; padding-left:2px;">
                    <span style="color:${d14 ? "#bbb" : "#666"};">\u8FDB\u884C\u4E2D\uFF1A</span>${currentTrainingStatus}
                </div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? "#bbb" : "#666"}; margin-bottom:4px;">\u{1F4BC} \u4ECE\u4E1A\u5C65\u5386</div>
                <div style="max-height:100px; overflow-y:auto; background:${d14 ? "#333" : "#fff"}; border:1px solid ${d14 ? "#444" : "#ddd"}; padding:4px; margin-bottom:10px; font-size:14px;">${workHistoryHtml}</div>

                <div style="font-size:14px; font-weight:bold; color:${d14 ? "#bbb" : "#666"}; margin-bottom:4px;">\u{1F393} \u8BE6\u7EC6\u57F9\u8BAD\u5386\u53F2</div>
                <div style="max-height:100px; overflow-y:auto; background:${d14 ? "#333" : "#fff"}; border:1px solid ${d14 ? "#444" : "#ddd"}; padding:4px; font-size:14px;">${historyHtml}</div>

                ${warningHtml}`;
      }
      panel.style = baseStyle;
      panel.innerHTML = contentHtml;
      if (mode === "current") {
        panel.dataset.scExecId = data2?.id != null ? String(data2.id) : "";
        const anchor = getCurrentExecTrainingSummaryNode(data2?.id);
        if (anchor) {
          anchor.after(panel);
        } else {
          const startedAt = Date.now();
          clearCurrentPanelRenderTimer();
          currentPanelRenderTimer = setInterval(() => {
            const retryAnchor = getCurrentExecTrainingSummaryNode(data2?.id);
            if (retryAnchor) {
              clearCurrentPanelRenderTimer();
              retryAnchor.after(panel);
            } else if (Date.now() - startedAt > 5e3) {
              clearCurrentPanelRenderTimer();
              if (targetContainer) targetContainer.appendChild(panel);
            }
          }, 200);
        }
      } else {
        targetContainer.after(panel);
        startAgencyPanelRelocateWatch();
      }
    }
    function processData(url, d) {
      if (!d) return;
      if (isExecutiveHistoryEnabled() && CURRENT_EXECS_API_REGEX.test(url)) {
        processCurrentExecutives(d);
        return;
      }
      if (EXEC_API_REGEX.test(url)) {
        if (getValidTargetContainer()) {
          renderSkillPanel(d);
        } else {
          const current = getCurrentExecRecord();
          const execMatch = url.match(EXEC_API_REGEX);
          const currentSlot = getCurrentExecSlot();
          const detailPosition = d?.currentWorkHistory?.position;
          const matchesSlot = currentSlot != null && (detailPosition === currentSlot || current && execMatch && Number(execMatch[1]) === Number(current.id));
          if (execMatch && matchesSlot && getCurrentExecPanelContainer()) {
            if (isExecutiveHistoryEnabled()) renderSkillPanel(d, false, "current");
          }
        }
      }
      if (url.includes(OFFERS_URL)) {
        let s = load("SC-my-offers");
        const newOffers = d.offers || [];
        if (newOffers.length > 0) {
          const incomingSlots = newOffers.map((o) => o.slotPosition);
          s = s.filter((oldItem) => !incomingSlots.includes(oldItem.slotPosition));
          newOffers.forEach((o) => {
            if (o.id) {
              s.push({ id: o.id, slotPosition: o.slotPosition });
            }
          });
        }
        save("SC-my-offers", s);
      }
      if (url.includes(NOTIFICATIONS_KEYWORD)) {
        let s = load("SC-AGENCY_FOUND_EXECUTIVE");
        const list = Array.isArray(d) ? d : d.notifications || [];
        list.filter((n) => n.notificationKind === "AGENCY_FOUND_EXECUTIVE").forEach((n) => {
          s = upsert(s, { executiveId: n.executiveId, offerId: n.offerId }, "offerId");
        });
        if (s.length > 100) s = s.slice(-100);
        save("SC-AGENCY_FOUND_EXECUTIVE", s);
      }
    }
    const _fetch = window.fetch;
    window.fetch = async function(...args) {
      const res = await _fetch.apply(this, args);
      const url = typeof args[0] === "string" ? args[0] : args[0].url || "";
      if (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url) || CURRENT_EXECS_API_REGEX.test(url)) {
        res.clone().text().then((text) => {
          try {
            processData(url, JSON.parse(text));
          } catch (e) {
          }
        });
      }
      return res;
    };
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, url) {
      if (typeof url === "string" && (url.includes(OFFERS_URL) || url.includes(NOTIFICATIONS_KEYWORD) || EXEC_API_REGEX.test(url) || CURRENT_EXECS_API_REGEX.test(url))) {
        this.addEventListener("load", function() {
          try {
            if (this.responseText) {
              const d = JSON.parse(this.responseText);
              processData(url, d);
            }
          } catch (e) {
          }
        });
      }
      return _open.apply(this, arguments);
    };
    return {
      init: function(slotCode) {
        const internalSlot = SLOT_MAP[slotCode];
        if (!internalSlot) return;
        const offers = load("SC-my-offers");
        const found = load("SC-AGENCY_FOUND_EXECUTIVE");
        const o = offers.find((x) => x.slotPosition === internalSlot);
        if (o) {
          const f = found.find((x) => x.offerId === o.id);
          if (f) {
            _fetch(`/api/v4/executives/${f.executiveId}/`).then((r) => r.json()).then(renderSkillPanel);
          } else {
            renderSkillPanel(null, true);
          }
        } else {
          renderSkillPanel(null, true);
        }
      }
    };
  })();
  registerExportInfo({
    name: "\u9AD8\u7BA1\u57F9\u8BAD\u4E0E\u73B0\u4EFB\u9AD8\u7BA1\u8BB0\u5F55",
    scope: "realm",
    keys: (realmId) => realmId === null ? ["SC-my-offers", "SC-AGENCY_FOUND_EXECUTIVE", "SC-Current-Executives"] : [`R${realmId}-SC-my-offers`, `R${realmId}-SC-AGENCY_FOUND_EXECUTIVE`, `R${realmId}-SC-Current-Executives`]
  });
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.ExecutiveTrainingModule = ExecutiveTrainingModule2;

  // src/features/outgoingContractMPHandler.js
  registerExportInfo({
    name: "\u51FA\u5E93\u5408\u540C MP \u8BBE\u7F6E",
    scope: "global",
    keys: ["SC_OutgoingMP_Presets", "SC_OutgoingMP_UseInput"]
  });
  registerExportInfo({
    name: "\u51FA\u5E93\u5408\u540C VWAP \u7F13\u5B58",
    scope: "realm",
    match: (realmId) => realmId === null ? /(?!)/ : new RegExp(`^SC_OutgoingVWAP_Cache_${realmId}_\\d+_\\d+$`)
  });
  var outgoingContractMPHandler2 = (function() {
    const STORAGE_KEY = "SC_OutgoingMP_Presets";
    const USE_INPUT_KEY = "SC_OutgoingMP_UseInput";
    const DEFAULT_PRESETS = "MP-4%";
    let initTimer = null;
    let _qualityCache = {};
    const VWAP_CACHE_KEY = "SC_OutgoingVWAP_Cache";
    const VWAP_CACHE_MS = 10 * 60 * 1e3;
    async function getVWAPData(realmId, resourceId, quality) {
      const cacheKey = `${VWAP_CACHE_KEY}_${realmId}_${resourceId}_${quality}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const p = JSON.parse(cached);
          if (Date.now() - p.t < VWAP_CACHE_MS) {
            mpLog("VWAP \u7F13\u5B58\u547D\u4E2D, \u503C:", p.v);
            return p.v;
          }
        }
      } catch (e) {
      }
      mpLog("VWAP \u7F13\u5B58\u672A\u547D\u4E2D, \u53D1\u8D77\u7F51\u7EDC\u8BF7\u6C42...");
      const tStart = Date.now();
      try {
        const url = `https://api.simcotools.com/v1/realms/${realmId}/market/vwaps/${resourceId}/${quality}`;
        const vwap = await new Promise((resolve) => {
          if (typeof GM_xmlhttpRequest === "function") {
            GM_xmlhttpRequest({
              method: "GET",
              url,
              onload: function(resp) {
                try {
                  const data2 = JSON.parse(resp.responseText);
                  const v = typeof data2 === "number" ? data2 : data2.vwap || data2.price || data2.value || Array.isArray(data2.vwaps) && data2.vwaps[0]?.vwap || Array.isArray(data2) && data2[0]?.vwap;
                  console.log("[VWAP] API\u8FD4\u56DE:", { status: resp.status, raw: resp.responseText?.substring(0, 100), parsed: v });
                  resolve(typeof v === "number" && v > 0 ? v : null);
                } catch (e) {
                  console.warn("[VWAP] \u89E3\u6790\u5931\u8D25:", e);
                  resolve(null);
                }
              },
              onerror: function(e) {
                console.warn("[VWAP] GM_xmlhttpRequest \u9519\u8BEF:", e);
                resolve(null);
              },
              ontimeout: function() {
                console.warn("[VWAP] \u8BF7\u6C42\u8D85\u65F6");
                resolve(null);
              },
              timeout: 1e4
            });
          } else {
            fetch(url).then((r) => r.json()).then((data2) => {
              const v = typeof data2 === "number" ? data2 : data2.vwap || data2.price || data2.value || Array.isArray(data2.vwaps) && data2.vwaps[0]?.vwap || Array.isArray(data2) && data2[0]?.vwap;
              console.log("[VWAP] fetch\u8FD4\u56DE:", v);
              resolve(typeof v === "number" && v > 0 ? v : null);
            }).catch((e) => {
              console.warn("[VWAP] fetch\u5931\u8D25:", e);
              resolve(null);
            });
          }
        });
        if (vwap !== null) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: vwap }));
          } catch (e) {
          }
          mpLog("VWAP \u7F51\u7EDC\u8BF7\u6C42\u5B8C\u6210, \u8017\u65F6:", Date.now() - tStart, "ms, \u503C:", vwap);
          return vwap;
        }
        mpLog("VWAP \u7F51\u7EDC\u8BF7\u6C42\u65E0\u6709\u6548\u503C, \u8017\u65F6:", Date.now() - tStart, "ms");
      } catch (e) {
        mpLog("VWAP \u8BF7\u6C42\u5F02\u5E38:", e.message);
      }
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const p = JSON.parse(cached);
          return p.v;
        }
      } catch (e) {
      }
      return null;
    }
    function isUseInputEnabled() {
      return localStorage.getItem(USE_INPUT_KEY) === "true";
    }
    function toggleUseInput() {
      const enabled = !isUseInputEnabled();
      localStorage.setItem(USE_INPUT_KEY, enabled ? "true" : "false");
      initButtons();
      return enabled;
    }
    function loadPresets() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        return stored.replace(/，/g, ",").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      }
      return DEFAULT_PRESETS.split(",").map((s) => s.trim());
    }
    function savePresets(presets) {
      localStorage.setItem(STORAGE_KEY, presets.join(","));
      initButtons();
    }
    function showConfigModal() {
      const currentPresets = loadPresets();
      const presetsString = currentPresets.join(", ");
      const modalId = "outgoingmp-config-modal";
      document.getElementById(modalId)?.remove();
      const bgSum = (window.getComputedStyle(document.body).backgroundColor.match(/\d+/g) || []).map(Number).reduce((a, b) => a + b, 0);
      const isDark = bgSum < 380;
      const bg = isDark ? "#333" : "#fff";
      const fg = isDark ? "#EEE" : "#333";
      const border = isDark ? "#555" : "#ccc";
      const inputBg = isDark ? "#2C2C2C" : "#f5f5f5";
      const inputFg = isDark ? "#EEE" : "#333";
      const inputBorder = isDark ? "#666" : "#bbb";
      const codeBg = isDark ? "#444" : "#e8e8e8";
      const codeFg = isDark ? "#ffb74d" : "#c62828";
      const overlayBg = "rgba(0,0,0,0.7)";
      const shadow = "0 5px 15px rgba(0,0,0,0.5)";
      const btnCancelBg = isDark ? "#555" : "#e0e0e0";
      const btnCancelFg = isDark ? "white" : "#333";
      const modal = document.createElement("div");
      modal.id = modalId;
      modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:${overlayBg};z-index:99999;display:flex;justify-content:center;align-items:flex-start;padding-top:5vh;box-sizing:border-box;`;
      modal.innerHTML = `
                <div style="background:${bg};color:${fg};padding:0;border-radius:6px;box-shadow:${shadow};width:90%;max-width:450px;border:1px solid ${border};">
                    <div style="padding:15px;border-bottom:1px solid ${border};">
                        <h4 style="margin:0;font-size:18px;font-weight:600;">MP-?%\u51FA\u5E93\u4EF7\u8BBE\u7F6E</h4>
                    </div>
                    <div style="padding:15px;">
                        <p style="margin-top:0;margin-bottom:15px;font-size:14px;line-height:1.6;">
                            \u4F7F\u7528<strong style="color:#FF8888;">\u9017\u53F7\uFF08, \u6216 \uFF0C\uFF09</strong>\u5206\u9694\u3002\u4F7F\u7528MP\xB1%\u6216\u8005VWAP\xB1%\u3002\u652F\u6301\uFF1A<br>
                            \u2022 <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-4%</code> \u2192 MP -4%<br>
                            \u2022 <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+5%</code> \u2192 MP +5%<br>
                            \u2022 <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP-10</code> \u2192 MP -$10<br>
                            \u2022 <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">MP+6</code> \u2192 MP +$6<br>
                            \u2022 <code style="background:${codeBg};color:${codeFg};padding:1px 4px;border-radius:3px;">VWAP-4%</code> \u2192 VWAP -4%<br>
                            VWAP\u6765\u81EAsimcotools.com\u3002\u5B57\u6BCD\u4E0D\u533A\u5206\u5927\u5C0F\u5199\uFF0C\u534A\u89D2\u5168\u89D2\u5747\u53EF\u3002
                        </p>
                        <textarea id="outgoingmp-config-input"
                            style="width:100%;height:80px;margin-bottom:12px;padding:8px;border:1px solid ${inputBorder};border-radius:4px;box-sizing:border-box;font-size:14px;color:${inputFg};background:${inputBg};resize:vertical;"></textarea>
                        <div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:13px;color:${fg};">\u6839\u636E\u8F93\u5165\u6846\u5DF2\u6709\u4EF7\u683C\u8BA1\u7B97\uFF1A</span>
                            <button id="outgoingmp-useinput-toggle" type="button" style="padding:4px 12px;border:1px solid ${inputBorder};border-radius:4px;cursor:pointer;font-size:13px;background:${inputBg};color:${inputFg};"></button>
                            <span style="font-size:11px;color:${isDark ? "#aaa" : "#888"};">\u5F00\u542F\u540E\uFF0C\u82E5\u8F93\u5165\u6846\u5DF2\u586B\u4EF7\u683C\uFF0C\u5219\u6309\u94AE\u5C06\u4EE5\u8F93\u5165\u6846\u5185\u5DF2\u586B\u4EF7\u683C\uFF08\u800C\u975E\u5E02\u573A\u6700\u4F4E\u4EF7\uFF09\u4E3A\u57FA\u7840\u8BA1\u7B97</span>
                        </div>
                        <div style="display:flex;justify-content:flex-end;gap:10px;">
                            <button id="outgoingmp-config-cancel" style="background-color:${btnCancelBg};color:${btnCancelFg};border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">\u53D6\u6D88</button>
                            <button id="outgoingmp-config-save" style="background-color:#5cb85c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;font-size:14px;">\u4FDD\u5B58</button>
                        </div>
                    </div>
                </div>
            `;
      document.body.appendChild(modal);
      const inputEl = document.getElementById("outgoingmp-config-input");
      inputEl.value = presetsString;
      const useInputToggle = document.getElementById("outgoingmp-useinput-toggle");
      const updateToggleBtn = () => {
        const on = isUseInputEnabled();
        useInputToggle.textContent = on ? "\u270E \u5F00" : "\u270E \u5173";
        useInputToggle.style.color = on ? "#4CAF50" : "";
      };
      updateToggleBtn();
      useInputToggle.addEventListener("click", () => {
        toggleUseInput();
        updateToggleBtn();
      });
      document.getElementById("outgoingmp-config-cancel").addEventListener("click", () => modal.remove());
      document.getElementById("outgoingmp-config-save").addEventListener("click", () => {
        const newString = inputEl.value.replace(/，/g, ",");
        const newPresets = newString.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        savePresets(newPresets);
        modal.remove();
      });
    }
    function parseResourceId() {
      const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
      if (!link) return null;
      const match2 = link.href.match(/\/resource\/(\d+)\//);
      return match2 ? parseInt(match2[1], 10) : null;
    }
    async function parseQuality() {
      const resourceId = parseResourceId();
      if (resourceId === null) return 0;
      if (_qualityCache[resourceId] !== void 0 && _qualityCache[resourceId] >= 0) {
        mpLog("parseQuality \u7F13\u5B58\u547D\u4E2D:", _qualityCache[resourceId]);
        return _qualityCache[resourceId];
      }
      const startUrl = location.href;
      const MAX_WAIT = 3e3;
      const RETRY_INTERVAL = 200;
      const startTime = Date.now();
      let loopCount = 0;
      const SELL_ORDER_TEXTS = ["\u5F53\u524D\u4EA4\u6613\u6240\u5356\u5355", "Current exchange orders", "\u7576\u524D\u4EA4\u6613\u6240\u8CE3\u55AE"];
      const FILTER_BTN_TEXTS = ["\u6309\u54C1\u8D28\u8FC7\u6EE4", "Filter by quality", "\u6309\u54C1\u8CEA\u904E\u6FFE"];
      const SHOW_ALL_TEXTS = ["Show all", "\u663E\u793A\u6240\u6709", "\u986F\u793A\u6240\u6709"];
      const AVG_PRICE_TITLES = ["\u5E73\u5747\u96F6\u552E\u4EF7\u683C", "Average retail price", "\u5E73\u5747\u96F6\u552E\u50F9\u683C"];
      while (Date.now() - startTime < MAX_WAIT) {
        if (location.href !== startUrl) return 0;
        let s1Quality = null;
        let s1FilterBtn = false;
        let s1ShowAllBtn = false;
        let s1Found = false;
        let s1RawText = "";
        let s1BtnRaw = "";
        const allSpans = document.querySelectorAll("span");
        for (const span of allSpans) {
          const b = span.querySelector("b");
          if (!b) continue;
          const text = b.textContent?.trim() || "";
          if (SELL_ORDER_TEXTS.some((t) => text.includes(t))) {
            s1Found = true;
            s1RawText = text;
            const qMatch = text.match(/Q(\d+)\+/);
            if (qMatch) {
              s1Quality = parseInt(qMatch[1], 10);
            }
            const btnText = span.querySelector("button")?.textContent || "";
            s1BtnRaw = btnText;
            s1ShowAllBtn = SHOW_ALL_TEXTS.some((t) => btnText.includes(t));
            s1FilterBtn = FILTER_BTN_TEXTS.some((t) => btnText.includes(t));
            break;
          }
        }
        const extractQualityFromEl = (el) => {
          const txt = el.textContent?.trim() || "";
          const numMatch = txt.match(/^(\d+)/);
          if (numMatch) return parseInt(numMatch[1], 10);
          const svgCount = el.querySelectorAll(".svg-inline--fa.fa-star").length;
          return svgCount > 0 ? svgCount : null;
        };
        let s2Quality = null;
        let s2RawTxt = "";
        const titleSelector = AVG_PRICE_TITLES.map((t) => `[title="${t}"]`).join(", ");
        const avgPriceEl = document.querySelector(titleSelector);
        if (avgPriceEl) {
          const sibling = avgPriceEl.nextElementSibling;
          if (sibling) {
            s2RawTxt = sibling.textContent?.trim() || "";
            s2Quality = extractQualityFromEl(sibling);
          }
        } else {
          let qualityEl = null;
          const allEls = document.querySelectorAll("*");
          for (const el of allEls) {
            for (const node of el.childNodes) {
              if (node.nodeType === 3 && node.textContent?.includes("\u5408\u5E76\u6210\u672C")) {
                let next = node.nextSibling;
                while (next) {
                  if (next.nodeType === 1) {
                    qualityEl = next;
                    break;
                  }
                  next = next.nextSibling;
                }
                if (qualityEl) {
                  let q = extractQualityFromEl(qualityEl);
                  let fallback = qualityEl.nextElementSibling;
                  while (q === null && fallback) {
                    qualityEl = fallback;
                    q = extractQualityFromEl(fallback);
                    if (q !== null) break;
                    fallback = fallback.nextElementSibling;
                  }
                }
                break;
              }
            }
            if (qualityEl) break;
          }
          if (qualityEl) {
            s2RawTxt = qualityEl.textContent?.trim() || "";
            s2Quality = extractQualityFromEl(qualityEl);
            if (s2Quality !== null) {
              mpLog("\u7B56\u75652 \u4ECE\u5408\u5E76\u6210\u672C\u540E\u5144\u5F1F\u5143\u7D20:", s2Quality, "txt:", s2RawTxt.substring(0, 30));
            }
          }
        }
        mpLog("parseQuality \u8F6E\u8BE2#" + loopCount + " s1Found=" + s1Found + ' rawText="' + (s1RawText || "").substring(0, 80) + '" qMatch=' + s1Quality + ' btn="' + (s1BtnRaw || "").substring(0, 30) + '" showAll=' + s1ShowAllBtn + " filter=" + s1FilterBtn + " s2El=" + (avgPriceEl ? "avgprice" : "cost") + ' s2Txt="' + (s2RawTxt || "").substring(0, 30) + '" s2Q=' + s2Quality);
        if (s1Found || s2Quality !== null) {
          if (s1Quality !== null && s1ShowAllBtn) {
            _qualityCache[resourceId] = s1Quality;
            mpLog("parseQuality \u60C5\u51B51(\u53EF\u4FE1Q):", s1Quality);
            return s1Quality;
          }
          if (s1Found && s1Quality === null && !s1FilterBtn && !s1ShowAllBtn) {
            _qualityCache[resourceId] = 0;
            mpLog("parseQuality \u60C5\u51B53(\u53EF\u4FE1Q0)");
            return 0;
          }
          if (s1FilterBtn && s2Quality !== null) {
            _qualityCache[resourceId] = s2Quality;
            mpLog("parseQuality \u60C5\u51B52(\u5E73\u5747\u96F6\u552E\u4EF7\u683C):", s2Quality);
            return s2Quality;
          }
          if (!s1Found && s2Quality !== null) {
            _qualityCache[resourceId] = s2Quality;
            mpLog("parseQuality \u60C5\u51B54(\u7EAF\u5E73\u5747\u96F6\u552E\u4EF7\u683C):", s2Quality);
            return s2Quality;
          }
          if (s1Found) {
            mpLog("parseQuality \u8F6E\u8BE2#" + loopCount + " \u672A\u5339\u914D: s1Q=" + s1Quality + " showAll=" + s1ShowAllBtn + " filter=" + s1FilterBtn + " s2Q=" + s2Quality);
          }
        }
        await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
        loopCount++;
      }
      mpLog("parseQuality \u8D85\u65F6\u9000\u51FA, loopCount:", loopCount);
      _qualityCache[resourceId] = 0;
      return 0;
    }
    function getCachedMarketData(realmId, resourceId) {
      const keys = [`market_all_${realmId}_${resourceId}`, `market_${realmId}_${resourceId}`];
      let bestData = null, bestTs = 0;
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const ts = parsed.timestamp || 0;
          if (ts > bestTs) {
            const arr = Array.isArray(parsed) ? parsed : parsed.data;
            if (Array.isArray(arr) && arr.length > 0 && typeof arr[0].quality === "number") {
              bestData = arr;
              bestTs = ts;
            }
          }
        } catch (e) {
        }
      }
      mpLog("getCachedMarketData \u7ED3\u679C:", bestData ? `ts=${bestTs} age=${Date.now() - bestTs}ms rows=${bestData.length}` : "null");
      return { data: bestData, ts: bestTs };
    }
    async function refreshMarketData(realmId, resourceId) {
      mpLog("refreshMarketData \u5F00\u59CB\u8BF7\u6C42...");
      const tStart = Date.now();
      try {
        const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
        const resp = await fetch(url);
        const json = await resp.json();
        mpLog("refreshMarketData \u5B8C\u6210, \u8017\u65F6:", Date.now() - tStart, "ms, \u72B6\u6001:", resp.status, "\u6761\u6570:", Array.isArray(json) ? json.length : "\u975E\u6570\u7EC4");
        if (Array.isArray(json)) {
          localStorage.setItem(`market_all_${realmId}_${resourceId}`, JSON.stringify({ timestamp: Date.now(), data: json }));
          return json;
        }
      } catch (e) {
        mpLog("refreshMarketData \u5931\u8D25:", e.message);
      }
      return null;
    }
    function findLowestMP(marketData, resourceId, targetQuality) {
      const exactOnly = resourceId === 150;
      let bestPrice = Infinity, bestQuality = null;
      for (const entry of marketData) {
        const p = parseFloat(entry.price);
        const q = entry.quality;
        if (p <= 0) continue;
        if (exactOnly && q !== targetQuality) continue;
        if (!exactOnly && q < targetQuality) continue;
        if (p < bestPrice) {
          bestPrice = p;
          bestQuality = q;
        }
      }
      return bestPrice !== Infinity ? { price: bestPrice, quality: bestQuality } : null;
    }
    function findExactQualityPrice(marketData, targetQuality) {
      let bestPrice = Infinity;
      for (const entry of marketData) {
        const p = parseFloat(entry.price);
        if (p > 0 && entry.quality === targetQuality && p < bestPrice) {
          bestPrice = p;
        }
      }
      return bestPrice !== Infinity ? bestPrice : null;
    }
    function calcTargetPrice(mpPrice, preset) {
      const s = preset.trim().toLowerCase();
      let m = s.match(/^(?:mp|vwap)\s*([+-])\s*([\d.]+)\s*%$/);
      if (m) {
        const pct = parseFloat(m[2]) / 100;
        return m[1] === "-" ? mpPrice * (1 - pct) : mpPrice * (1 + pct);
      }
      m = s.match(/^(?:mp|vwap)\s*-\s*([\d.]+)$/);
      if (m && !s.includes("%")) return mpPrice - parseFloat(m[1]);
      m = s.match(/^(?:mp|vwap)\s*\+\s*([\d.]+)$/);
      if (m && !s.includes("%")) return mpPrice + parseFloat(m[1]);
      m = s.match(/^([\d.]+)$/);
      if (m) return parseFloat(m[1]);
      return null;
    }
    const SELL_STEPS = [
      [2e4, 500],
      [1e4, 100],
      [5e3, 25],
      [1e3, 10],
      [500, 5],
      [200, 2],
      [100, 1],
      [50, 0.5],
      [20, 0.25],
      [5, 0.1],
      [2, 0.05],
      [1, 0.01],
      [0.5, 5e-3],
      [0, 1e-3]
    ];
    function roundToStep(price, isContract) {
      if (isContract) return Math.round(price * 1e3) / 1e3;
      for (const [threshold, step] of SELL_STEPS) {
        if (price >= threshold) {
          if (step >= 1) {
            return Math.round(price / step) * step;
          } else {
            const mult = Math.round(1 / step);
            return Math.round(price * mult) / mult;
          }
        }
      }
      return Math.round(price * 1e3) / 1e3;
    }
    function getSellStep(price) {
      for (const [threshold, step] of SELL_STEPS) {
        if (price >= threshold) return step;
      }
      return 1e-3;
    }
    let _skipInputRefresh = false;
    function setInputValue(input, value, count = 3) {
      _skipInputRefresh = true;
      const lastValue = input.value;
      input.value = value;
      const event = new Event("input", { bubbles: true });
      event.simulated = true;
      if (input._valueTracker) input._valueTracker.setValue(lastValue);
      input.dispatchEvent(event);
      setTimeout(() => {
        _skipInputRefresh = false;
      }, 100);
      if (count > 0) return setInputValue(input, value, --count);
    }
    const MP_DEBUG = false;
    function mpLog(...args) {
      if (MP_DEBUG) console.log("[MP-DEBUG]", Date.now(), "|", ...args);
    }
    async function initButtons() {
      mpLog("initButtons \u5F00\u59CB");
      document.querySelectorAll(".outgoingmp-btn-row").forEach((r) => r.remove());
      document.querySelectorAll(".outgoingmp-info").forEach((e) => e.remove());
      const prevParent = document.querySelector("[data-outgoing-mp-added]");
      if (prevParent) delete prevParent.dataset.outgoingMpAdded;
      const resourceId = parseResourceId();
      const realmId = getRealmIdFromLink();
      if (!resourceId || realmId === null) {
        mpLog("initButtons \u9000\u51FA: \u65E0resourceId\u6216realmId");
        return;
      }
      mpLog("initButtons resourceId:", resourceId, "realmId:", realmId);
      const priceInput = document.querySelector('input[name="price"]');
      if (!priceInput) {
        mpLog("initButtons \u9000\u51FA: \u65E0priceInput");
        return;
      }
      const parentDiv = priceInput.parentElement;
      if (!parentDiv || parentDiv.dataset.outgoingMpAdded) {
        mpLog("initButtons \u9000\u51FA: \u5DF2\u6CE8\u5165\u6216\u65E0parentDiv");
        return;
      }
      parentDiv.dataset.outgoingMpAdded = "true";
      if (!priceInput.hasAttribute("data-outgoingmp-listener")) {
        priceInput.setAttribute("data-outgoingmp-listener", "true");
        let _refreshTimer;
        priceInput.addEventListener("input", () => {
          if (_skipInputRefresh) return;
          if (!isUseInputEnabled()) return;
          clearTimeout(_refreshTimer);
          _refreshTimer = setTimeout(() => initButtons(), 300);
        });
      }
      const isContract = /\/contract\/?$/.test(location.href);
      mpLog("isContract:", isContract);
      const allBtn = parentDiv.parentElement?.querySelector("button.btn-secondary");
      const btnClass = allBtn ? allBtn.className : "btn btn-secondary";
      const btnRow = document.createElement("div");
      btnRow.className = "outgoingmp-btn-row";
      btnRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:5px;";
      if (isContract) {
        const configBtn = document.createElement("button");
        configBtn.type = "button";
        configBtn.className = btnClass;
        configBtn.textContent = "+";
        configBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          showConfigModal();
        };
        btnRow.appendChild(configBtn);
      }
      const infoSpan = document.createElement("span");
      infoSpan.className = "outgoingmp-info";
      infoSpan.style.cssText = `font-size:11px;color:${DM() ? "#aaa" : "#666"};white-space:nowrap;margin-left:4px;`;
      infoSpan.textContent = "\u231B \u52A0\u8F7D\u4E2D...";
      btnRow.appendChild(infoSpan);
      parentDiv.appendChild(btnRow);
      mpLog("\u6309\u94AE\u884C\u5DF2\u63D2\u5165DOM");
      mpLog("\u5F00\u59CB parseQuality...");
      const quality = await parseQuality();
      _qualityCache[resourceId] = quality;
      mpLog("parseQuality \u5B8C\u6210, quality:", quality);
      mpLog("\u8BFB\u53D6\u7F13\u5B58...");
      const cacheResult = getCachedMarketData(realmId, resourceId);
      const cachedData = cacheResult.data;
      const cacheAge = cacheResult.ts ? Date.now() - cacheResult.ts : Infinity;
      mpLog("\u7F13\u5B58\u7ED3\u679C:", cachedData ? `\u6709\u6570\u636E(${cachedData.length}\u6761) age=${cacheAge}ms` : "\u65E0\u7F13\u5B58");
      const cachedMpInfo = cachedData ? findLowestMP(cachedData, resourceId, quality) : null;
      mpLog("\u7F13\u5B58\u6700\u4F4E\u4EF7:", JSON.stringify(cachedMpInfo));
      if (cachedMpInfo) {
        if (cachedMpInfo.quality !== quality) {
          const exactPrice = findExactQualityPrice(cachedData, quality);
          if (exactPrice !== null) {
            infoSpan.textContent = `Q${quality}\u6709 $${exactPrice}\xB7\u53C2\u8003Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
          } else {
            infoSpan.textContent = `Q${quality}\u65E0\u8D27\xB7\u53C2\u8003Q${cachedMpInfo.quality} $${cachedMpInfo.price}`;
          }
        } else {
          infoSpan.textContent = `Q${cachedMpInfo.quality}\u6700\u4F4E $${cachedMpInfo.price}`;
        }
      } else if (cachedData) {
        let foundHigher = null;
        for (let q = quality + 1; q <= 12; q++) {
          const hi = findLowestMP(cachedData, resourceId, q);
          if (hi) {
            foundHigher = hi;
            break;
          }
        }
        if (foundHigher) {
          infoSpan.textContent = `Q${quality}\u65E0\u8D27\xB7\u53C2\u8003Q${foundHigher.quality} $${foundHigher.price}`;
        } else {
          infoSpan.textContent = quality === 0 ? "\u65E0\u5E02\u573A\u6570\u636E" : `\u65E0\u2265Q${quality}`;
        }
      } else {
        infoSpan.textContent = "\u231B \u8BF7\u6C42\u5E02\u573A\u6570\u636E...";
      }
      const renderButtons = (marketData, mpBasePrice, source) => {
        mpLog("renderButtons \u8C03\u7528, source:", source, "mpBasePrice:", mpBasePrice, "data:", marketData ? `${marketData.length}\u6761` : "null");
        btnRow.querySelectorAll(".outgoingmp-mpbtn").forEach((b) => b.remove());
        const currentVal2 = parseFloat(priceInput.value);
        const useInput2 = isUseInputEnabled() && currentVal2 > 0;
        if (isUseInputEnabled() && !(currentVal2 > 0) && mpBasePrice > 0) {
          infoSpan.textContent = (infoSpan.textContent || "") + "\uFF08\u5DF2\u7528\u5E02\u573A\u4EF7\uFF09";
        }
        const createPresetBtn = (basePrice, presets, labelMap) => {
          if (basePrice <= 0) return;
          presets.slice().reverse().forEach((preset) => {
            const rawTarget = calcTargetPrice(basePrice, preset);
            if (rawTarget === null) return;
            const rounded = Math.round(rawTarget * 1e3) / 1e3;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = btnClass + " outgoingmp-mpbtn";
            btn.textContent = labelMap ? labelMap(preset) : preset;
            btn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              setInputValue(priceInput, rounded);
            };
            btnRow.appendChild(btn);
          });
        };
        if (isContract) {
          if (!useInput2) {
            const presets = loadPresets();
            const mpPresets = presets.filter((p) => !/^vwap/i.test(p.trim()));
            if (mpPresets.length > 0) {
              createPresetBtn(mpBasePrice, mpPresets, null);
            }
          } else {
            const mpPresets = loadPresets().filter((p) => !/^vwap/i.test(p.trim()));
            createPresetBtn(currentVal2, mpPresets, null);
          }
        } else {
          if (mpBasePrice > 0) {
            const step = getSellStep(mpBasePrice);
            const mpRounded = roundToStep(mpBasePrice, false);
            const btnMP = document.createElement("button");
            btnMP.type = "button";
            btnMP.className = btnClass + " outgoingmp-mpbtn";
            btnMP.textContent = `\u5E02\u573A\u4EF7 $${mpRounded}`;
            btnMP.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              setInputValue(priceInput, mpRounded);
            };
            btnRow.appendChild(btnMP);
            const oneDown = roundToStep(mpBasePrice - step, false);
            if (oneDown > 0 && Math.abs(oneDown - mpRounded) > 1e-9) {
              const btn1s = document.createElement("button");
              btn1s.type = "button";
              btn1s.className = btnClass + " outgoingmp-mpbtn";
              btn1s.textContent = `\u538B\u4EF7 $${oneDown}`;
              btn1s.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setInputValue(priceInput, oneDown);
              };
              btnRow.appendChild(btn1s);
            }
          }
        }
      };
      if (cachedMpInfo || cachedData) {
        renderButtons(cachedData, cachedMpInfo ? cachedMpInfo.price : 0, "\u7F13\u5B58");
      }
      const CACHE_MAX_AGE = 6e4;
      if (!cachedData) {
        mpLog("\u65E0\u7F13\u5B58, \u8BF7\u6C42\u7F51\u7EDC...");
        const tStart = Date.now();
        const freshData = await refreshMarketData(realmId, resourceId);
        mpLog("\u7F51\u7EDC\u8BF7\u6C42\u5B8C\u6210, \u8017\u65F6:", Date.now() - tStart, "ms, \u7ED3\u679C:", freshData ? `${freshData.length}\u6761` : "null");
        const freshMpInfo = freshData ? findLowestMP(freshData, resourceId, quality) : null;
        if (freshMpInfo) {
          if (freshMpInfo.quality !== quality) {
            const exactPrice = findExactQualityPrice(freshData, quality);
            if (exactPrice !== null) {
              infoSpan.textContent = `Q${quality}\u6709 $${exactPrice}\xB7\u53C2\u8003Q${freshMpInfo.quality} $${freshMpInfo.price}`;
            } else {
              infoSpan.textContent = `Q${quality}\u65E0\u8D27\xB7\u53C2\u8003Q${freshMpInfo.quality} $${freshMpInfo.price}`;
            }
          } else {
            infoSpan.textContent = `Q${freshMpInfo.quality}\u6700\u4F4E $${freshMpInfo.price}`;
          }
        } else {
          infoSpan.textContent = "\u65E0\u5E02\u573A\u6570\u636E";
        }
        renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, "\u7F51\u7EDC");
      } else {
        mpLog("\u6709\u7F13\u5B58(age=" + cacheAge + "ms)", cacheAge > CACHE_MAX_AGE ? "\u8FC7\u671F,\u540E\u53F0\u5237\u65B0" : "\u6709\u6548,\u4E0D\u5237\u65B0");
        if (cacheAge > CACHE_MAX_AGE) {
          infoSpan.textContent = (infoSpan.textContent || "") + " \u231B\u66F4\u65B0\u4E2D...";
          refreshMarketData(realmId, resourceId).then((freshData) => {
            if (freshData) {
              const freshMpInfo = findLowestMP(freshData, resourceId, quality);
              if (freshMpInfo) {
                if (freshMpInfo.quality !== quality) {
                  const exactPrice = findExactQualityPrice(freshData, quality);
                  if (exactPrice !== null) {
                    infoSpan.textContent = `Q${quality}\u6709 $${exactPrice}\xB7\u53C2\u8003Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                  } else {
                    infoSpan.textContent = `Q${quality}\u65E0\u8D27\xB7\u53C2\u8003Q${freshMpInfo.quality} $${freshMpInfo.price}`;
                  }
                } else {
                  infoSpan.textContent = `Q${freshMpInfo.quality}\u6700\u4F4E $${freshMpInfo.price}`;
                }
              }
              renderButtons(freshData, freshMpInfo ? freshMpInfo.price : 0, "\u540E\u53F0\u5237\u65B0");
            }
          }).catch(() => {
          });
        }
      }
      if (isContract) {
        const presets = loadPresets();
        const hasVWAPPreset = presets.some((p) => /^vwap/i.test(p.trim()));
        if (hasVWAPPreset) {
          mpLog("\u542F\u52A8 VWAP \u83B7\u53D6...");
          getVWAPData(realmId, resourceId, quality).then((vwap) => {
            mpLog("VWAP \u7ED3\u679C:", vwap);
            if (vwap !== null && vwap > 0) {
              infoSpan.textContent = (infoSpan.textContent || "") + ` | VWAP $${vwap.toFixed(2)}`;
              if (presets.length > 0) {
                const seenLabels = /* @__PURE__ */ new Set();
                presets.slice().reverse().forEach((preset) => {
                  const rawTarget = calcTargetPrice(vwap, preset);
                  if (rawTarget === null) return;
                  const label = preset.replace(/^mp/i, "VWAP");
                  if (seenLabels.has(label)) return;
                  seenLabels.add(label);
                  const rounded = Math.round(rawTarget * 1e3) / 1e3;
                  const btn = document.createElement("button");
                  btn.type = "button";
                  btn.className = btnClass;
                  btn.textContent = label;
                  btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInputValue(priceInput, rounded);
                  };
                  btnRow.appendChild(btn);
                });
              }
              mpLog("VWAP \u6309\u94AE\u8FFD\u52A0\u5B8C\u6210");
            }
          }).catch((e) => {
            mpLog("VWAP \u9519\u8BEF:", e);
          });
        } else {
          mpLog("\u9884\u8BBE\u4E2D\u65E0VWAP, \u8DF3\u8FC7");
        }
      }
      mpLog("initButtons \u5B8C\u6210");
    }
    let _profitObserver = null;
    let _profitCalcTimer = null;
    let _inputListenerBound = false;
    let _profitDetailExpanded = false;
    let _lastProfitKey = "";
    function startProfitObserver() {
      if (_profitObserver) _profitObserver.disconnect();
      const schedule = () => {
        clearTimeout(_profitCalcTimer);
        _profitCalcTimer = setTimeout(calcAndDisplayProfit, 200);
      };
      _profitObserver = new MutationObserver((mutations) => {
        const isOwnMutation = mutations.some((m) => {
          let el = m.target;
          while (el) {
            if (el.classList && el.classList.contains("sc-profit-display")) return true;
            el = el.parentElement;
          }
          return false;
        });
        const hasRelevantNode = mutations.some(
          (m) => m.type === "childList" && m.addedNodes.length > 0
        );
        if (!isOwnMutation && hasRelevantNode) schedule();
      });
      _profitObserver.observe(document.body, { childList: true, subtree: true });
      if (!_inputListenerBound) {
        _inputListenerBound = true;
        document.addEventListener("input", (e) => {
          if (e.target.matches('input[name="price"], input[name="amount"], input[name="quantity"]')) {
            schedule();
          }
        });
      }
      setTimeout(calcAndDisplayProfit, 300);
    }
    async function calcAndDisplayProfit() {
      mpLog("calcAndDisplayProfit \u89E6\u53D1");
      const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
      if (!onPage) {
        mpLog("calcAndDisplayProfit: \u4E0D\u5728\u76EE\u6807\u9875\u9762");
        return;
      }
      const isContract = /\/contract\/?$/.test(location.href);
      const priceInput = document.querySelector('input[name="price"]');
      const qtyInput = document.querySelector('input[name="amount"], input[name="quantity"]');
      if (!priceInput || !qtyInput) {
        return;
      }
      const price = parseFloat(priceInput.value) || 0;
      const quantity = parseFloat(qtyInput.value) || 0;
      if (price <= 0 || quantity <= 0) {
        return;
      }
      const profitKey = `${parseResourceId()}_${price}_${quantity}`;
      if (profitKey === _lastProfitKey) {
        mpLog("calcAndDisplayProfit \u8DF3\u8FC7: \u503C\u672A\u53D8");
        return;
      }
      _lastProfitKey = profitKey;
      const resourceId = parseResourceId();
      const quality = await parseQuality();
      if (!resourceId) {
        return;
      }
      const SCD = (() => {
        try {
          return JSON.parse(localStorage.getItem("SimcompaniesConstantsData"));
        } catch (e) {
          return null;
        }
      })();
      if (!SCD) {
        return;
      }
      const resourceInfo = SCD?.constantsResources?.[resourceId];
      const perUnitTransport = resourceInfo?.transportation ?? 0;
      const contractExactTransport = perUnitTransport * quantity * 0.5;
      const contractTransportTotal = Math.ceil(contractExactTransport);
      const sellExactTransport = perUnitTransport * quantity * 1;
      const sellTransportTotal = Math.ceil(sellExactTransport);
      const realmId = getRealmIdFromLink();
      if (realmId === null) {
        return;
      }
      const SRC = (() => {
        try {
          return JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));
        } catch (e) {
          return null;
        }
      })();
      const warehouse = SRC?.warehouseResources;
      if (!warehouse || !Array.isArray(warehouse)) {
        return;
      }
      let productUnitCost = 0;
      const productEntries = warehouse.filter((e) => e.kind === resourceId && e.quality === quality);
      if (productEntries.length > 0) {
        const e = productEntries[0];
        const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
        productUnitCost = e.amount > 0 ? costSum / e.amount : 0;
      }
      let transportUnitCost = 0;
      const transportEntries = warehouse.filter((e) => e.kind === 13);
      if (transportEntries.length > 0) {
        const e = transportEntries[0];
        const costSum = Object.values(e.cost || {}).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
        transportUnitCost = e.amount > 0 ? costSum / e.amount : 0;
      }
      const revenue = price * quantity;
      const productCost = productUnitCost * quantity;
      const contractTransportCost = contractTransportTotal * transportUnitCost;
      const sellTransportCost = sellTransportTotal * transportUnitCost;
      const contractNet = revenue - productCost - contractTransportCost;
      const marketNet = revenue * 0.96 - productCost - sellTransportCost;
      const sellWasteTransport = sellTransportTotal - sellExactTransport;
      const transportWasteNote = sellWasteTransport > 1e-3 && perUnitTransport > 0 ? `\u8FD0\u8F93\u5411\u4E0A\u53D6\u6574\uFF1A\u6D88\u8017 ${sellTransportTotal} \u8FD0\u8F93\u5355\u4F4D\uFF0C\u6D6A\u8D39 ${sellWasteTransport.toFixed(2)} \u5355\u4F4D` : "";
      const grossProfit = revenue - productCost;
      const marketFee = revenue * 0.04;
      const d = DM();
      const profitColor = (v) => v >= 0 ? "#4CAF50" : "#f44336";
      const fmt = (v) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const existingDisplay = document.querySelector(".sc-profit-display");
      if (existingDisplay) {
        _profitDetailExpanded = existingDisplay.getAttribute("data-expanded") === "true";
        const summary = existingDisplay.querySelector("#sc-profit-summary");
        if (summary) {
          if (isContract) {
            summary.innerHTML = `<span>\u5408\u540C\u5229\u6DA6: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
          } else {
            summary.innerHTML = `<span>\u5E02\u573A\u5229\u6DA6: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span><span>\u5408\u540C\u5229\u6DA6: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
          }
        }
        const setVal = (id, text, color) => {
          const el = existingDisplay.querySelector("#" + id);
          if (el) {
            el.textContent = text;
            if (color) el.style.color = color;
          }
        };
        if (isContract) {
          setVal("sc-pd-revenue", fmt(revenue));
          setVal("sc-pd-cost", "-" + fmt(productCost));
          setVal("sc-pd-fee", fmt(0));
          setVal("sc-pd-transport", "-" + fmt(contractTransportCost));
          const pEl = existingDisplay.querySelector("#sc-pd-profit");
          if (pEl) {
            pEl.textContent = fmt(contractNet);
            pEl.style.color = profitColor(contractNet);
          }
        } else {
          setVal("sc-pd-m-revenue", fmt(revenue));
          setVal("sc-pd-c-revenue", fmt(revenue));
          setVal("sc-pd-m-cost", "-" + fmt(productCost));
          setVal("sc-pd-c-cost", "-" + fmt(productCost));
          setVal("sc-pd-m-fee", "-" + fmt(marketFee));
          setVal("sc-pd-c-fee", fmt(0));
          setVal("sc-pd-m-transport", "-" + fmt(sellTransportCost));
          setVal("sc-pd-c-transport", "-" + fmt(contractTransportCost));
          const mpEl = existingDisplay.querySelector("#sc-pd-m-profit");
          if (mpEl) {
            mpEl.textContent = fmt(marketNet);
            mpEl.style.color = profitColor(marketNet);
          }
          const cpEl = existingDisplay.querySelector("#sc-pd-c-profit");
          if (cpEl) {
            cpEl.textContent = fmt(contractNet);
            cpEl.style.color = profitColor(contractNet);
          }
        }
        const wasteEl = existingDisplay.querySelector("#sc-pd-waste");
        if (wasteEl) {
          if (transportWasteNote) {
            wasteEl.textContent = "\u26A0\uFE0F " + transportWasteNote;
            wasteEl.style.display = "";
          } else {
            wasteEl.style.display = "none";
          }
        } else if (transportWasteNote) {
          const w = document.createElement("div");
          w.id = "sc-pd-waste";
          w.style.cssText = "color:#FF9800;margin-top:4px;";
          w.textContent = "\u26A0\uFE0F " + transportWasteNote;
          const detail = existingDisplay.querySelector("#sc-profit-detail");
          if (detail) detail.after(w);
        }
        return;
      }
      const isNarrow = window.innerWidth <= 576;
      const displayDiv = document.createElement("div");
      displayDiv.className = "sc-profit-display";
      displayDiv.style.cssText = `
                margin: ${isNarrow ? "4px 0" : "8px 0"};
                padding: ${isNarrow ? "6px 10px" : "10px 14px"};
                border-radius: 8px;
                background: ${d ? "#1a2e1a" : "#e8f5e9"};
                border: 1px solid ${d ? "#2a5a2a" : "#c8e6c9"};
                line-height: 1.6;
                color: ${d ? "#efefef" : "#333"};
                font-family: sans-serif;
                user-select: none;
            `;
      let html = `<div id="sc-profit-header" style="font-weight:bold;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <span id="sc-profit-arrow">${_profitDetailExpanded ? "\u25BC" : "\u25B6"}</span> \u{1F4CA} \u5229\u6DA6\u660E\u7EC6
            </div>`;
      html += `<div id="sc-profit-summary" style="display:flex;flex-wrap:wrap;gap:${isNarrow ? "4px" : "16px"};margin-top:4px;">`;
      if (isContract) {
        html += `<span>\u5408\u540C\u5229\u6DA6: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
      } else {
        html += `<span>\u5E02\u573A\u5229\u6DA6: <b style="color:${profitColor(marketNet)};">${fmt(marketNet)}</b></span>`;
        html += `<span>\u5408\u540C\u5229\u6DA6: <b style="color:${profitColor(contractNet)};">${fmt(contractNet)}</b></span>`;
      }
      html += `</div>`;
      const thStyle = `padding:2px 6px;text-align:right;font-weight:bold;color:${d ? "#aaa" : "#666"};`;
      const tdStyle = `padding:2px 6px;text-align:right;white-space:nowrap;`;
      const rowStyle = `border-bottom:1px solid ${d ? "#333" : "#e0e0e0"};`;
      const labelTd = (t, bold) => `<td style="${thStyle}text-align:left;${bold ? "font-weight:bold;" : ""}">${t}</td>`;
      html += `<div id="sc-profit-detail" style="display:${_profitDetailExpanded ? "block" : "none"};margin-top:6px;">
                <table style="border-collapse:collapse;width:100%;">`;
      if (isContract) {
        html += `<tr>${labelTd("")}<th style="${thStyle}">\u5408\u540C</th></tr>
                    <tr style="${rowStyle}">${labelTd("\u6536\u5165")}<td id="sc-pd-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u6210\u672C")}<td id="sc-pd-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u624B\u7EED\u8D39")}<td id="sc-pd-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u8FD0\u8F93\u8D39\u7528")}<td id="sc-pd-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd("\u5229\u6DA6", true)}<td id="sc-pd-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
      } else {
        html += `<tr>${labelTd("")}<th style="${thStyle}">\u5E02\u573A</th><th style="${thStyle}">\u5408\u540C</th></tr>
                    <tr style="${rowStyle}">${labelTd("\u6536\u5165")}<td id="sc-pd-m-revenue" style="${tdStyle}">${fmt(revenue)}</td><td id="sc-pd-c-revenue" style="${tdStyle}">${fmt(revenue)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u6210\u672C")}<td id="sc-pd-m-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td><td id="sc-pd-c-cost" style="${tdStyle};color:#f44336;">-${fmt(productCost)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u624B\u7EED\u8D39")}<td id="sc-pd-m-fee" style="${tdStyle};color:#f44336;">-${fmt(marketFee)}</td><td id="sc-pd-c-fee" style="${tdStyle}">${fmt(0)}</td></tr>
                    <tr style="${rowStyle}">${labelTd("\u8FD0\u8F93\u8D39\u7528")}<td id="sc-pd-m-transport" style="${tdStyle};color:#f44336;">-${fmt(sellTransportCost)}</td><td id="sc-pd-c-transport" style="${tdStyle};color:#f44336;">-${fmt(contractTransportCost)}</td></tr>
                    <tr>${labelTd("\u5229\u6DA6", true)}<td id="sc-pd-m-profit" style="${tdStyle};font-weight:bold;color:${profitColor(marketNet)};">${fmt(marketNet)}</td><td id="sc-pd-c-profit" style="${tdStyle};font-weight:bold;color:${profitColor(contractNet)};">${fmt(contractNet)}</td></tr>`;
      }
      html += `</table></div>`;
      if (transportWasteNote) {
        html += `<div id="sc-pd-waste" style="color:#FF9800;margin-top:4px;">\u26A0\uFE0F ${transportWasteNote}</div>`;
      }
      displayDiv.innerHTML = html;
      displayDiv.setAttribute("data-expanded", _profitDetailExpanded ? "true" : "false");
      displayDiv.querySelector("#sc-profit-header").addEventListener("click", () => {
        const detail = displayDiv.querySelector("#sc-profit-detail");
        const arrow = displayDiv.querySelector("#sc-profit-arrow");
        if (detail.style.display === "none") {
          detail.style.display = "block";
          arrow.textContent = "\u25BC";
          _profitDetailExpanded = true;
        } else {
          detail.style.display = "none";
          arrow.textContent = "\u25B6";
          _profitDetailExpanded = false;
        }
        displayDiv.setAttribute("data-expanded", _profitDetailExpanded ? "true" : "false");
      });
      const rowContainer = priceInput.closest(".row");
      if (rowContainer && rowContainer.parentNode) {
        rowContainer.parentNode.insertBefore(displayDiv, rowContainer.nextSibling);
      }
    }
    function init2() {
      mpLog("init \u88AB\u8C03\u7528");
      _qualityCache = {};
      _lastProfitKey = "";
      if (initTimer) {
        clearInterval(initTimer);
        initTimer = null;
      }
      document.querySelectorAll(".outgoingmp-btn-row").forEach((r) => r.remove());
      document.querySelectorAll(".outgoingmp-info").forEach((e) => e.remove());
      document.querySelectorAll(".sc-profit-display").forEach((e) => e.remove());
      const prev = document.querySelector("[data-outgoing-mp-added]");
      if (prev) delete prev.dataset.outgoingMpAdded;
      mpLog("\u542F\u52A8 startProfitObserver");
      startProfitObserver();
      if (document.querySelector('input[name="price"]')) {
        mpLog("priceInput \u5DF2\u5B58\u5728, \u76F4\u63A5\u8C03\u7528 initButtons");
        initButtons();
        return;
      }
      mpLog("priceInput \u672A\u627E\u5230, \u542F\u52A8\u8F6E\u8BE2");
      initTimer = setInterval(() => {
        const onPage = /\/headquarters\/warehouse\/(?:[^\/]+)\/(?:sell|contract)\/?$/.test(location.href);
        if (!onPage) {
          mpLog("\u8F6E\u8BE2: \u79BB\u5F00\u9875\u9762, \u505C\u6B62");
          clearInterval(initTimer);
          initTimer = null;
          return;
        }
        if (document.querySelector('input[name="price"]')) {
          mpLog("\u8F6E\u8BE2: \u53D1\u73B0 priceInput, \u8C03\u7528 initButtons");
          clearInterval(initTimer);
          initTimer = null;
          initButtons();
        }
      }, 500);
    }
    return { init: init2 };
  })();
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.outgoingContractMPHandler = outgoingContractMPHandler2;

  // src/core/state.js
  var state = {
    hasNewVersion: void 0,
    latestVersion: void 0,
    localVersion: typeof GM_info !== "undefined" ? GM_info.script.version : "1.33.5",
    SCXXCS: 0,
    PROFIT_PER_BUILDING_LEVEL: 370,
    RETAIL_ADJUSTMENT: {
      B: 2.28
    }
  };

  // src/features/dataStorage.js
  var Storage = (() => {
    const KEYS = {
      region: (realmId) => `SimcompaniesRetailCalculation_${realmId}`,
      constants: "SimcompaniesConstantsData"
    };
    const formatTime = (isoString) => {
      if (!isoString) return "\u65E0\u6570\u636E";
      const d = new Date(isoString);
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    };
    registerExportInfo({
      name: "\u57FA\u7840\u6570\u636E",
      scope: "global",
      keys: [KEYS.constants]
    });
    registerExportInfo({
      name: "\u9886\u57DF\u6570\u636E",
      scope: "realm",
      keys: (realmId) => [KEYS.region(realmId)]
    });
    return {
      save: (type, data2) => {
        const key = type === "region" ? KEYS.region(data2.realmId) : KEYS.constants;
        try {
          if (type === "region") {
            const existingRaw = localStorage.getItem(key) || "{}";
            const existing = JSON.parse(existingRaw);
            const merged = { ...existing, ...data2 };
            if (existing.academyLevels && !data2.academyLevels) {
              merged.academyLevels = existing.academyLevels;
            }
            localStorage.setItem(key, JSON.stringify(merged));
          } else {
            localStorage.setItem(key, JSON.stringify(data2));
          }
        } catch (e) {
          console.warn("\u26A0\uFE0F Storage.save \u5408\u5E76\u5199\u5165\u5931\u8D25\uFF0C\u56DE\u9000\u4E3A\u76F4\u63A5\u5199\u5165\uFF1A", e);
          localStorage.setItem(key, JSON.stringify(data2));
        }
      },
      getFormattedStatus: (type) => {
        try {
          let data2;
          switch (type) {
            case "r1":
              data2 = localStorage.getItem(KEYS.region(0));
              break;
            case "r2":
              data2 = localStorage.getItem(KEYS.region(1));
              break;
            case "constants":
              data2 = localStorage.getItem(KEYS.constants);
              break;
          }
          const parsedData = data2 ? JSON.parse(data2) : null;
          return {
            text: parsedData ? formatTime(parsedData.timestamp) : "\u65E0\u6570\u636E",
            className: parsedData ? "SimcompaniesRetailCalculation-has-data" : "SimcompaniesRetailCalculation-no-data"
          };
        } catch (error) {
          return {
            text: "\u6570\u636E\u635F\u574F",
            className: "SimcompaniesRetailCalculation-no-data"
          };
        }
      }
    };
  })();

  // src/core/network.js
  var Network2 = /* @__PURE__ */ (() => {
    const makeRequest = async (url, responseType, retryCount) => {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        });
        if (!res.ok) throw new Error(`HTTP\u9519\u8BEF ${res.status}`);
        if (responseType === "json") {
          return await res.json();
        } else {
          return await res.text();
        }
      } catch (err) {
        if (retryCount > 0) {
          console.warn(`\u8BF7\u6C42\u9519\u8BEF\u6216\u89E3\u6790\u5931\u8D25 ${url}, \u91CD\u8BD5\u4E2D... (${retryCount})`);
          return makeRequest(url, responseType, retryCount - 1);
        } else {
          throw new Error(`\u6700\u7EC8\u8BF7\u6C42\u5931\u8D25: ${err}`);
        }
      }
    };
    return {
      // 获取JSON数据
      requestJson: (url, retryCount = 3) => makeRequest(url, "json", retryCount),
      // 获取原始文本
      requestRaw: (url, retryCount = 3) => makeRequest(url, "text", retryCount)
    };
  })();

  // src/features/executiveBoardroom.js
  var executiveCustomButton = /* @__PURE__ */ (function() {
    let boardroomState = {
      "o": null,
      "f": null,
      "m": null,
      "t": null,
      "v": null,
      "x": null,
      "y": null,
      "z": null,
      "1": null,
      "2": null,
      "3": null,
      "4": null,
      "5": null
    };
    let draggedSlotId = null;
    let selectedSlotId = null;
    function mapExecutivesToState(execList) {
      Object.keys(boardroomState).forEach((k) => boardroomState[k] = null);
      let staffIdx = 1;
      execList.forEach((exec) => {
        const pos = exec.currentWorkHistory?.position;
        const posStr = pos ? String(pos) : null;
        const emp = {
          name: exec.name || "\u672A\u547D\u540D",
          skills: {
            coo: exec.skills?.coo || 0,
            cfo: exec.skills?.cfo || 0,
            cmo: exec.skills?.cmo || 0,
            cto: exec.skills?.cto || 0
          }
        };
        if (posStr && boardroomState.hasOwnProperty(posStr)) {
          boardroomState[posStr] = emp;
        } else {
          while (staffIdx <= 5 && boardroomState[String(staffIdx)] !== null) {
            staffIdx++;
          }
          if (staffIdx <= 5) {
            boardroomState[String(staffIdx)] = emp;
            staffIdx++;
          }
        }
      });
    }
    function loadSavedBoardroom() {
      const saved = localStorage.getItem(getScopedKey("SC-Saved-Boardroom"));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed) {
            Object.keys(boardroomState).forEach((k) => {
              if (parsed[k] !== void 0) {
                boardroomState[k] = parsed[k];
              }
            });
          }
        } catch (e) {
          console.error("\u52A0\u8F7D\u81EA\u5B9A\u4E49\u8463\u4E8B\u4F1A\u6570\u636E\u5931\u8D25:", e);
        }
      }
    }
    function calculateResults() {
      const getSkill = (slotId, skillKey) => {
        return boardroomState[slotId] && boardroomState[slotId].skills ? boardroomState[slotId].skills[skillKey] : 0;
      };
      const selectedRadio = document.querySelector('input[name="sc-aca-r"]:checked');
      const academyLevel = selectedRadio ? parseInt(selectedRadio.value) : 15;
      const hasCooApp = academyLevel >= 5;
      const hasCfoApp = academyLevel >= 10;
      const hasCmoApp = academyLevel >= 15;
      const hasCtoApp = academyLevel >= 20;
      const rawCoo = Math.floor(
        getSkill("o", "coo") + (hasCooApp ? getSkill("v", "coo") / 2 : 0) + (getSkill("f", "coo") + getSkill("m", "coo") + getSkill("t", "coo")) / 4
      );
      const rawCfo = Math.floor(
        getSkill("f", "cfo") + (hasCfoApp ? getSkill("x", "cfo") / 2 : 0) + (getSkill("o", "cfo") + getSkill("m", "cfo") + getSkill("t", "cfo")) / 4
      );
      const rawCmo = Math.floor(
        getSkill("m", "cmo") + (hasCmoApp ? getSkill("y", "cmo") / 2 : 0) + (getSkill("o", "cmo") + getSkill("f", "cmo") + getSkill("t", "cmo")) / 4
      );
      const rawCto = Math.floor(
        getSkill("t", "cto") + (hasCtoApp ? getSkill("z", "cto") / 2 : 0) + (getSkill("o", "cto") + getSkill("f", "cto") + getSkill("m", "cto")) / 4
      );
      const applyDecay = (raw) => {
        let val = raw;
        if (val > 80) val = 80 + (val - 80) / 2;
        if (val > 60) val = 60 + (val - 60) / 2;
        return Math.floor(val);
      };
      const effCoo = applyDecay(rawCoo);
      const effCfo = applyDecay(rawCfo);
      const effCmo = applyDecay(rawCmo);
      const effCto = applyDecay(rawCto);
      const rId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
      let SRC = {};
      try {
        SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${rId}`)) || {};
      } catch (e) {
        console.error("\u52A0\u8F7D\u96F6\u552E\u8BA1\u7B97\u7F13\u5B58\u5931\u8D25:", e);
      }
      const baseAdminVal = (SRC.administration || 1) - 1;
      const baseAdminText = (baseAdminVal * 100).toFixed(2) + "%";
      const changeAdminText = effCoo === 0 ? "0.00%" : "-" + (baseAdminVal * effCoo).toFixed(2) + "%";
      const finalAdminText = (baseAdminVal * (1 - effCoo / 100) * 100).toFixed(2) + "%";
      const bankLevel = SRC.bankLevel || 0;
      const baseCfoText = "$3.0M";
      const changeCfoVal = effCfo * 0.5 * (1 + bankLevel / 10);
      const changeCfoText = "+$" + changeCfoVal.toFixed(2) + "M";
      const finalCfoVal = 3 + changeCfoVal;
      const finalCfoText = "$" + finalCfoVal.toFixed(2) + "M";
      const baseSalesVal = (SRC.salesModifier || 0) + (SRC.recreationBonus || 0);
      const baseSalesText = baseSalesVal.toFixed(1) + "%";
      const changeSalesText = "+" + Math.floor(effCmo / 3) + "%";
      const finalSalesText = (baseSalesVal + Math.floor(effCmo / 3)).toFixed(1) + "%";
      const baseRestaurantText = "+" + (baseSalesVal * 0.02).toFixed(2);
      const changeRestaurantText = "+" + (effCmo * 0.01).toFixed(3);
      const finalRestaurantText = "+" + (baseSalesVal * 0.02 + effCmo * 0.01).toFixed(3);
      const basePatentText = "6.25%";
      const changePatentText = "+" + (effCto * 0.0625).toFixed(2) + "%";
      const finalPatentText = (6.25 + effCto * 0.0625).toFixed(2) + "%";
      const baseResearchText = "0.0%";
      const changeResearchText = "+" + (effCto * 2).toFixed(1) + "%";
      const finalResearchText = (effCto * 2).toFixed(1) + "%";
      const details = {
        admin: `
                    <strong>\u7BA1\u7406\u8D39\u7528\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u7BA1\u7406\u8D39\u7528</strong>\uFF1A\u603B\u5EFA\u7B51\u7B49\u7EA7=\u5DE5\u4EBA/100\uFF0C\u7BA1\u7406\u8D39\u7528=(\u603B\u5EFA\u7B51\u7B49\u7EA7-1)/170\u3002<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACOO \u6709\u6548\u70B9\u6570 <code>${effCoo}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCoo}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCoo}\uFF09\u3002<br>
                    3. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A\u6BCF 1 \u70B9\u6709\u6548 COO \u51CF\u5C11\u57FA\u7840\u7BA1\u7406\u8D39\u7528\u7684 1%\u3002<br>
                       <code>${baseAdminText} &times; ${effCoo}% = ${Math.abs(baseAdminVal * effCoo).toFixed(2)}%</code> \u6263\u51CF\u3002<br>
                    4. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>${baseAdminText} - ${Math.abs(baseAdminVal * effCoo).toFixed(2)}% = ${finalAdminText}</code>\u3002
                `,
        cfo: `
                    <strong>\u4F1A\u8BA1\u8D39\u7528\u8D77\u59CB\u70B9\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u9650\u989D</strong>\uFF1A\u56FA\u5B9A\u503C <code>$3.0M</code>\uFF08\u6240\u6709\u516C\u53F8\u521D\u59CB\u514D\u7A0E\u4E0A\u9650\u5747\u4E3A $3,000,000\uFF09\u3002<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACFO \u6709\u6548\u70B9\u6570 <code>${effCfo}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCfo}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCfo}\uFF09\u3002<br>
                    3. <strong>\u94F6\u884C\u52A0\u6210</strong>\uFF1A\u5F53\u524D\u94F6\u884C\u7B49\u7EA7\u4E3A <code>${bankLevel}</code>\uFF0C\u63D0\u4F9B\u989D\u5916 <code>${(bankLevel * 10).toFixed(0)}%</code> \u7684 CFO \u6548\u679C\u589E\u5E45\u3002<br>
                    4. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A<code>$3.0M + CFO \u6709\u6548\u70B9\u6570 &times; $0.5M &times; (1 + \u94F6\u884C\u7B49\u7EA7 / 10)</code>\u3002<br>
                       <code>$3.0M + ${effCfo} &times; $0.5M &times; (1 + ${bankLevel} / 10) = ${finalCfoText}</code>\u3002<br>
                    5. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>${finalCfoText}</code>\u3002
                `,
        salesSpeed: `
                    <strong>\u9500\u552E\u901F\u5EA6\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u9500\u552E\u901F\u5EA6</strong>\uFF1A\u7B49\u7EA7\u52A0\u6210\u4E0E\u4F11\u95F2\u52A0\u6210\u4E4B\u548C <code>${baseSalesText}</code>\u3002<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACMO \u6709\u6548\u70B9\u6570 <code>${effCmo}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCmo}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCmo}\uFF09\u3002<br>
                    3. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A\u6BCF 3 \u70B9\u6709\u6548 CMO \u589E\u52A0 1% \u9500\u552E\u901F\u5EA6\u3002<br>
                       <code>Math.floor(${effCmo} / 3) = +${Math.floor(effCmo / 3)}%</code> \u901F\u5EA6\u63D0\u5347\u3002<br>
                    4. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>${baseSalesText} + ${Math.floor(effCmo / 3)}% = ${finalSalesText}</code>\u3002
                `,
        restaurant: `
                    <strong>\u9910\u9986\u8BC4\u7EA7\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u8BC4\u7EA7</strong>\uFF1A\u57FA\u7840\u9500\u552E\u901F\u5EA6 * 0.02<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACMO \u6709\u6548\u70B9\u6570 <code>${effCmo}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCmo}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCmo}\uFF09\u3002<br>
                    3. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A\u6BCF 1 \u70B9\u6709\u6548 CMO \u589E\u52A0 0.01 \u9910\u9986\u8BC4\u7EA7\u3002<br>
                       <code>${effCmo} &times; 0.01 = +${(effCmo * 0.01).toFixed(2)}</code> \u8BC4\u7EA7\u63D0\u5347\u3002<br>
                    4. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>${baseRestaurantText} + ${(effCmo * 0.01).toFixed(2)} = ${finalRestaurantText}</code>\u3002
                `,
        patent: `
                    <strong>\u4E13\u5229\u8F6C\u5316\u6982\u7387\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u6982\u7387</strong>\uFF1A\u6E38\u620F\u56FA\u5B9A\u57FA\u7840\u8F6C\u5316\u7387 <code>6.25%</code>\u3002<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACTO \u6709\u6548\u70B9\u6570 <code>${effCto}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCto}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCto}\uFF09\u3002<br>
                    3. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A\u6BCF 1 \u70B9\u6709\u6548 CTO \u589E\u52A0 1% \u7684\u57FA\u7840\u4E13\u5229\u8F6C\u5316\u6982\u7387\uFF08\u5373 6.25% \u7684 1% = 0.0625%\uFF09\u3002<br>
                       <code>${effCto} &times; 0.0625% = +${(effCto * 0.0625).toFixed(2)}%</code> \u6982\u7387\u63D0\u5347\u3002<br>
                    4. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>6.25% + ${(effCto * 0.0625).toFixed(2)}% = ${finalPatentText}</code>\u3002
                `,
        research: `
                    <strong>\u7814\u7A76\u751F\u4EA7\u901F\u5EA6\u63D0\u5347\u8BA1\u7B97\u8BE6\u60C5\uFF1A</strong><br>
                    1. <strong>\u57FA\u7840\u901F\u5EA6</strong>\uFF1A\u56FA\u5B9A\u57FA\u7840\u503C <code>0.0%</code>\u3002<br>
                    2. <strong>\u9AD8\u7BA1\u52A0\u6210</strong>\uFF1ACTO \u6709\u6548\u70B9\u6570 <code>${effCto}</code>\uFF08\u539F\u59CB\u6C47\u603B\u70B9\u6570 ${rawCto}\uFF0C\u8870\u51CF\u6298\u7B97\u540E\u4E3A ${effCto}\uFF09\u3002<br>
                    3. <strong>\u8BA1\u7B97\u516C\u5F0F</strong>\uFF1A\u6BCF 1 \u70B9\u6709\u6548 CTO \u589E\u52A0 2% \u7684\u7814\u7A76\u7C7B\u751F\u4EA7\u901F\u5EA6\u3002<br>
                       <code>${effCto} &times; 2% = +${(effCto * 2).toFixed(1)}%</code> \u901F\u5EA6\u63D0\u5347\u3002<br>
                    4. <strong>\u6700\u7EC8\u7ED3\u679C</strong>\uFF1A<code>${finalResearchText}</code>\u3002
                `
      };
      window.scCalcDetails = details;
      const tableContainer = document.getElementById("sc-calc-table-container");
      if (tableContainer) {
        tableContainer.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; color: var(--sc-fg); margin-bottom: 15px;">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--sc-border); color: var(--sc-fg3); font-size: 11px;">
                                <th align="left" style="padding: 6px 2px;">\u9879\u76EE</th>
                                <th align="right" style="padding: 6px 2px;">\u57FA\u7840</th>
                                <th align="right" style="padding: 6px 2px;">\u9AD8\u7BA1\u52A0\u6210</th>
                                <th align="right" style="padding: 6px 2px;">\u6700\u7EC8</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="sc-calc-row" data-type="admin" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u7BA1\u7406\u8D39\u7528</td>
                                <td align="right" style="padding: 6px 2px;">${baseAdminText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-dangerFg);">${changeAdminText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalAdminText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="cfo" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u4F1A\u8BA1\u8D39\u7528\u8D77\u59CB\u4E8E</td>
                                <td align="right" style="padding: 6px 2px;">${baseCfoText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeCfoText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalCfoText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="salesSpeed" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u9500\u552E\u901F\u5EA6</td>
                                <td align="right" style="padding: 6px 2px;">${baseSalesText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeSalesText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalSalesText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="restaurant" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u9910\u9986\u8BC4\u7EA7</td>
                                <td align="right" style="padding: 6px 2px;">${baseRestaurantText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeRestaurantText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalRestaurantText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="patent" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u4E13\u5229\u8F6C\u5316\u6982\u7387</td>
                                <td align="right" style="padding: 6px 2px;">${basePatentText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changePatentText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalPatentText}</td>
                            </tr>
                            <tr class="sc-calc-row" data-type="research" style="cursor: pointer; border-bottom: 1px solid var(--sc-border2);">
                                <td style="padding: 6px 2px; font-weight: bold;">\u7814\u7A76\u7C7B\u751F\u4EA7\u63D0\u5347</td>
                                <td align="right" style="padding: 6px 2px;">${baseResearchText}</td>
                                <td align="right" style="padding: 6px 2px; color: var(--sc-successFg);">${changeResearchText}</td>
                                <td align="right" style="padding: 6px 2px; font-weight: bold; color: var(--sc-successFg);">${finalResearchText}</td>
                            </tr>
                        </tbody>
                    </table>
                `;
        const rows = tableContainer.querySelectorAll(".sc-calc-row");
        const detailBox = document.getElementById("sc-detail-box");
        const isDark = DM();
        rows.forEach((row) => {
          const type = row.dataset.type;
          const updateDetail = () => {
            if (window.scCalcDetails && window.scCalcDetails[type]) {
              detailBox.innerHTML = window.scCalcDetails[type];
              rows.forEach((r) => r.style.background = "transparent");
              row.style.background = isDark ? "rgba(33, 150, 243, 0.15)" : "rgba(33, 150, 243, 0.1)";
            }
          };
          row.onmouseenter = updateDetail;
          row.onclick = updateDetail;
        });
      }
      return { adminBonus: effCoo, saleBonus: Math.floor(effCmo / 3) };
    }
    function renderBoardroom() {
      const leftContainer = document.getElementById("sc-slots-container");
      if (!leftContainer) return;
      leftContainer.innerHTML = "";
      const slotGroups = [
        {
          title: "\u9AD8\u7BA1",
          slots: [
            { id: "o", label: "COO" },
            { id: "f", label: "CFO" },
            { id: "m", label: "CMO" },
            { id: "t", label: "CTO" }
          ]
        },
        {
          title: "\u5B66\u5F92",
          slots: [
            { id: "v", label: "COO \u5B66\u5F92" },
            { id: "x", label: "CFO \u5B66\u5F92" },
            { id: "y", label: "CMO \u5B66\u5F92" },
            { id: "z", label: "CTO \u5B66\u5F92" }
          ]
        },
        {
          title: "\u804C\u5458",
          slots: [
            { id: "1", label: "\u804C\u5458 1" },
            { id: "2", label: "\u804C\u5458 2" },
            { id: "3", label: "\u804C\u5458 3" },
            { id: "4", label: "\u804C\u5458 4" },
            { id: "5", label: "\u804C\u5458 5" }
          ]
        }
      ];
      slotGroups.forEach((group) => {
        const groupEl = document.createElement("div");
        groupEl.className = "sc-slots-group";
        const titleEl = document.createElement("div");
        titleEl.className = "sc-slots-title";
        titleEl.textContent = group.title;
        groupEl.appendChild(titleEl);
        const gridEl = document.createElement("div");
        gridEl.className = "sc-slots-grid";
        group.slots.forEach((slot) => {
          const slotEl = document.createElement("div");
          slotEl.dataset.slotId = slot.id;
          slotEl.ondragover = (e) => {
            e.preventDefault();
          };
          slotEl.ondragenter = (e) => {
            e.preventDefault();
            slotEl.classList.add("dragover");
          };
          slotEl.ondragleave = () => {
            slotEl.classList.remove("dragover");
          };
          slotEl.ondrop = (e) => {
            e.preventDefault();
            slotEl.classList.remove("dragover");
            const targetSlotId = slot.id;
            if (draggedSlotId && draggedSlotId !== targetSlotId) {
              const temp = boardroomState[draggedSlotId];
              boardroomState[draggedSlotId] = boardroomState[targetSlotId];
              boardroomState[targetSlotId] = temp;
              renderBoardroom();
              calculateResults();
            }
          };
          slotEl.onclick = (e) => {
            if (selectedSlotId !== null && !boardroomState[slot.id]) {
              e.stopPropagation();
              const temp = boardroomState[selectedSlotId];
              boardroomState[selectedSlotId] = boardroomState[slot.id];
              boardroomState[slot.id] = temp;
              selectedSlotId = null;
              renderBoardroom();
              calculateResults();
            }
          };
          const emp = boardroomState[slot.id];
          if (emp) {
            const cardEl = document.createElement("div");
            cardEl.className = "sc-exec-card";
            if (selectedSlotId === slot.id) {
              cardEl.classList.add("selected");
            }
            cardEl.setAttribute("draggable", "true");
            cardEl.ondragstart = () => {
              draggedSlotId = slot.id;
              cardEl.classList.add("dragged");
            };
            cardEl.ondragend = () => {
              draggedSlotId = null;
              cardEl.classList.remove("dragged");
            };
            cardEl.onclick = (e) => {
              if (e.target.tagName === "INPUT") return;
              e.stopPropagation();
              if (selectedSlotId === null) {
                selectedSlotId = slot.id;
                cardEl.classList.add("selected");
              } else if (selectedSlotId === slot.id) {
                selectedSlotId = null;
                cardEl.classList.remove("selected");
              } else {
                const temp = boardroomState[selectedSlotId];
                boardroomState[selectedSlotId] = boardroomState[slot.id];
                boardroomState[slot.id] = temp;
                selectedSlotId = null;
                renderBoardroom();
                calculateResults();
              }
            };
            const roleEl = document.createElement("div");
            roleEl.style.cssText = `font-size: 9px; color: var(--sc-fg3); text-align: center; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;`;
            roleEl.textContent = `${slot.label}`;
            cardEl.appendChild(roleEl);
            const nameEl = document.createElement("div");
            nameEl.className = "sc-card-name";
            nameEl.textContent = emp.name;
            cardEl.appendChild(nameEl);
            const skillsGrid = document.createElement("div");
            skillsGrid.className = "sc-card-skills";
            const skillNames = [
              { key: "coo", label: "COO", color: "#2196F3" },
              { key: "cfo", label: "CFO", color: "#ff9800" },
              { key: "cmo", label: "CMO", color: "#e91e63" },
              { key: "cto", label: "CTO", color: "#9c27b0" }
            ];
            skillNames.forEach((sk) => {
              const row = document.createElement("div");
              row.className = "sc-card-skill-row";
              const label = document.createElement("span");
              label.className = "sc-card-skill-label";
              label.style.color = sk.color;
              label.textContent = sk.label;
              const input = document.createElement("input");
              input.type = "number";
              input.className = "sc-card-skill-input";
              input.min = "0";
              input.step = "1";
              input.value = emp.skills[sk.key];
              input.onfocus = () => cardEl.setAttribute("draggable", "false");
              input.onblur = () => cardEl.setAttribute("draggable", "true");
              input.onchange = () => {
                let val = parseInt(input.value) || 0;
                if (val < 0) val = 0;
                input.value = val;
                emp.skills[sk.key] = val;
                calculateResults();
              };
              row.appendChild(label);
              row.appendChild(input);
              skillsGrid.appendChild(row);
            });
            cardEl.appendChild(skillsGrid);
            slotEl.appendChild(cardEl);
          } else {
            const emptyEl = document.createElement("div");
            emptyEl.className = "sc-exec-card-empty";
            emptyEl.textContent = `\u7A7A ${slot.label} \u5E2D`;
            slotEl.appendChild(emptyEl);
          }
          gridEl.appendChild(slotEl);
        });
        groupEl.appendChild(gridEl);
        leftContainer.appendChild(groupEl);
      });
    }
    function injectStyles() {
      if (document.getElementById("sc-boardroom-styles")) return;
      const style = document.createElement("style");
      style.id = "sc-boardroom-styles";
      style.textContent = `
                .sc-boardroom-layout {
                    display: flex;
                    flex-direction: row;
                    width: 100%;
                    height: 100%;
                }
                .sc-boardroom-left {
                    flex: 7;
                    display: flex;
                    flex-direction: column;
                    padding: 20px;
                    overflow-y: auto;
                    border-right: 1px solid var(--sc-border);
                }
                .sc-boardroom-right {
                    flex: 3;
                    padding: 20px;
                    background: var(--sc-panel-right-bg);
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                }
                @media (max-width: 768px) {
                    .sc-boardroom-layout {
                        flex-direction: column;
                        overflow-y: auto;
                    }
                    .sc-boardroom-left {
                        flex: none;
                        border-right: none;
                        border-bottom: 1px solid var(--sc-border);
                    }
                    .sc-boardroom-right {
                        flex: none;
                    }
                }

                /* Card grid layouts */
                .sc-slots-group {
                    margin-bottom: 20px;
                }
                .sc-slots-title {
                    font-size: 14px;
                    font-weight: bold;
                    color: var(--sc-fg2);
                    margin-bottom: 10px;
                    border-left: 3px solid #2196F3;
                    padding-left: 8px;
                }
                .sc-slots-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 12px;
                }

                /* Card Styles */
                .sc-exec-card {
                    background: var(--sc-card-bg);
                    border: 1px solid var(--sc-border);
                    border-radius: 8px;
                    padding: 10px;
                    cursor: move;
                    user-select: none;
                    position: relative;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .sc-exec-card:hover {
                    box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                }
                .sc-exec-card.dragged {
                    opacity: 0.4;
                }
                .sc-exec-card-empty {
                    border: 2px dashed var(--sc-card-empty-border);
                    background: var(--sc-card-empty-bg);
                    border-radius: 8px;
                    height: 110px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--sc-fg3);
                    font-size: 12px;
                    text-align: center;
                    padding: 10px;
                    box-sizing: border-box;
                }
                .sc-exec-card-empty.dragover {
                    border-color: #2196F3;
                    background: rgba(33, 150, 243, 0.1);
                    color: #2196F3;
                }

                /* Card input styling */
                .sc-card-name {
                    font-weight: bold;
                    font-size: 13px;
                    margin-bottom: 8px;
                    text-align: center;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--sc-fg);
                }
                .sc-card-skills {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }
                .sc-card-skill-row {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    font-size: 11px;
                }
                .sc-card-skill-label {
                    font-weight: bold;
                    width: 25px;
                    font-size: 11px;
                }
                .sc-card-skill-input {
                    width: 100%;
                    padding: 2px 4px;
                    border: 1px solid var(--sc-border);
                    border-radius: 3px;
                    background: var(--sc-input-bg);
                    color: var(--sc-input-fg);
                    font-size: 11px;
                    box-sizing: border-box;
                    text-align: center;
                }
                .sc-card-skill-input::-webkit-outer-spin-button,
                .sc-card-skill-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .sc-card-skill-input {
                    -moz-appearance: textfield;
                }

                .sc-exec-card.selected {
                    border-color: #2196F3;
                    box-shadow: 0 0 10px rgba(33, 150, 243, 0.5);
                    background: var(--sc-card-bg-selected);
                }

                @media (max-width: 576px) {
                    .sc-boardroom-left {
                        padding: 10px;
                    }
                    .sc-slots-group {
                        margin-bottom: 12px;
                    }
                    .sc-slots-title {
                        font-size: 12px;
                        margin-bottom: 6px;
                    }
                    .sc-slots-grid {
                        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
                        gap: 8px;
                    }
                    .sc-exec-card {
                        padding: 8px;
                    }
                    .sc-exec-card-empty {
                        height: 96px;
                        font-size: 11px;
                        padding: 6px;
                    }
                    .sc-card-name {
                        font-size: 12px;
                        margin-bottom: 4px;
                    }
                    .sc-card-skills {
                        gap: 4px;
                    }
                    .sc-card-skill-label {
                        width: 20px;
                        font-size: 10px;
                    }
                    .sc-card-skill-input {
                        padding: 1px 2px;
                        font-size: 10px;
                    }
                }
            `;
      document.head.appendChild(style);
    }
    function show() {
      if (document.getElementById("sc-calc-modal")) return;
      injectStyles();
      loadSavedBoardroom();
      const modal = document.createElement("div");
      modal.id = "sc-calc-modal";
      modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.5); z-index: 21000;
                display: flex; justify-content: center; align-items: center;
            `;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
                background: var(--sc-bg); border: 1px solid var(--sc-border);
                border-radius: 12px; z-index: 21001; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                width: min(1000px, 95vw); height: min(800px, 90vh);
                color: var(--sc-fg); font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
            `;
      wrapper.innerHTML = `
                <div id="sc-calc-header" style="padding: 10px 20px; background: #2196F3; color: white; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; font-size: 14px;">
                    <span>\u81EA\u5B9A\u4E49\u9AD8\u7BA1\u6570\u636E</span>
                    <span id="sc-calc-close-x" style="cursor: pointer; padding: 0 5px; font-weight: normal; font-size: 20px;">&times;</span>
                </div>

                <div class="sc-boardroom-layout">
                    <!-- Left slots panel -->
                    <div class="sc-boardroom-left">
                        <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                            <button id="sc-boardroom-save-btn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">\u4FDD\u5B58</button>
                            <button id="sc-boardroom-fetch-btn" style="padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px;">\u83B7\u53D6\u5F53\u524D\u6700\u65B0\u9AD8\u7BA1\u6570\u636E</button>
                        </div>
                        <div style="font-size: 11px; color: var(--sc-fg3); margin-bottom: 15px;">* \u62D6\u62FD\u9AD8\u7BA1\u5361\u7247\uFF0C\u6216\u70B9\u51FB\u4E24\u4E2A\u9AD8\u7BA1\u5361\u7247\u8FDB\u884C\u5207\u6362\u3002</div>
                        <div id="sc-slots-container"></div>
                    </div>

                    <!-- Right result panel -->
                    <div id="sc-right-panel-container" class="sc-boardroom-right"></div>
                </div>
            `;
      modal.appendChild(wrapper);
      document.body.appendChild(modal);
      const updateThemeVars = () => {
        const isDark = DM();
        modal.style.setProperty("--sc-bg", theme.bg);
        modal.style.setProperty("--sc-fg", theme.fg);
        modal.style.setProperty("--sc-fg2", theme.fg2);
        modal.style.setProperty("--sc-fg3", theme.fg3);
        modal.style.setProperty("--sc-border", theme.border);
        modal.style.setProperty("--sc-border2", theme.border2);
        modal.style.setProperty("--sc-card-bg", isDark ? "#2c2c2c" : "#ffffff");
        modal.style.setProperty("--sc-card-empty-border", isDark ? "#444" : "#ccc");
        modal.style.setProperty("--sc-card-empty-bg", isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)");
        modal.style.setProperty("--sc-input-bg", theme.inputBg);
        modal.style.setProperty("--sc-input-fg", theme.inputFg);
        modal.style.setProperty("--sc-panel-right-bg", isDark ? "#151515" : "#f5f5f5");
        modal.style.setProperty("--sc-aca-bg", isDark ? "#2c2c2c" : "#f0f7ff");
        modal.style.setProperty("--sc-detail-bg", isDark ? "#222" : "#fff");
        modal.style.setProperty("--sc-card-bg-selected", isDark ? "#1a2a3a" : "#e3f2fd");
        modal.style.setProperty("--sc-dangerFg", theme.dangerFg);
        modal.style.setProperty("--sc-successFg", theme.successFg);
      };
      updateThemeVars();
      const observer = new MutationObserver(() => {
        updateThemeVars();
        calculateResults();
        renderBoardroom();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
      const closeX = document.getElementById("sc-calc-close-x");
      closeX.onclick = () => {
        observer.disconnect();
        modal.remove();
      };
      const btnSave = document.getElementById("sc-boardroom-save-btn");
      const btnFetch = document.getElementById("sc-boardroom-fetch-btn");
      btnSave.onclick = (e) => {
        e.preventDefault();
        const res = calculateResults();
        const rId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
        localStorage.setItem(`R${rId}-SC-Saved-Bonuses`, JSON.stringify({
          adminBonus: res.adminBonus,
          saleBonus: res.saleBonus,
          timestamp: Date.now(),
          source: "manual"
        }));
        localStorage.setItem(`R${rId}-SC-Saved-Boardroom`, JSON.stringify(boardroomState));
        showToast("\u6570\u636E\u4FDD\u5B58\u6210\u529F", "success");
      };
      btnFetch.onclick = async (e) => {
        e.preventDefault();
        const originalText = btnFetch.textContent;
        try {
          btnFetch.textContent = "\u83B7\u53D6\u4E2D...";
          btnFetch.disabled = true;
          const response = await Network2.requestJson("https://www.simcompanies.com/api/v3/companies/me/executives/");
          const data2 = response.executives;
          if (data2 && data2.length > 0) {
            mapExecutivesToState(data2);
            renderBoardroom();
            calculateResults();
            showToast("\u5DF2\u6210\u529F\u540C\u6B65\u5F53\u524D\u6700\u65B0\u9AD8\u7BA1\u6570\u636E", "success");
          } else {
            showToast("\u672A\u83B7\u53D6\u5230\u9AD8\u7BA1\u6570\u636E", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", "error");
        } finally {
          btnFetch.textContent = originalText;
          btnFetch.disabled = false;
        }
      };
      const rightContainer = document.getElementById("sc-right-panel-container");
      rightContainer.innerHTML = `
                <div style="font-size: 15px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid var(--sc-border); padding-bottom: 10px; color: var(--sc-fg);">
                    \u9AD8\u7BA1\u52A0\u6210\u6A21\u62DF\u8BA1\u7B97
                </div>

                <div style="margin-bottom: 15px; font-size: 13px; background: var(--sc-aca-bg); padding: 10px; border-radius: 8px; border: 1px solid var(--sc-border);">
                    <strong style="display: block; margin-bottom: 6px; color: var(--sc-fg); font-size: 12px;">\u5B66\u9662\u603B\u7B49\u7EA7:</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--sc-fg); font-size: 12px;">
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="0" style="vertical-align:middle;"> 0-4</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="5" style="vertical-align:middle;"> 5-9</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="10" style="vertical-align:middle;"> 10-14</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="15" checked style="vertical-align:middle;"> 15-19</label>
                        <label style="cursor:pointer;"><input type="radio" name="sc-aca-r" value="20" style="vertical-align:middle;"> 20+</label>
                    </div>
                </div>

                <!-- Calculation Table -->
                <div id="sc-calc-table-container"></div>

                <!-- Calculation Details Box -->
                <div id="sc-detail-box" style="padding: 10px; border: 1px solid var(--sc-border); border-radius: 8px; background: var(--sc-detail-bg); font-size: 11px; line-height: 1.5; color: var(--sc-fg3); min-height: 120px; box-sizing: border-box;">
                    \u{1F4A1} \u63D0\u793A\uFF1A\u70B9\u51FB\u6216\u60AC\u6D6E\u5728\u4E0A\u65B9\u4EFB\u610F\u884C\uFF0C\u53EF\u5728\u6B64\u5904\u67E5\u770B\u8BE6\u7EC6\u8BA1\u7B97\u516C\u5F0F\u3002
                </div>
            `;
      rightContainer.querySelectorAll('input[name="sc-aca-r"]').forEach((radio) => {
        radio.onchange = () => calculateResults();
      });
      renderBoardroom();
      calculateResults();
    }
    return { show };
  })();
  var ExecutiveCustomButtonModule = (function() {
    function injectCustomButton() {
      const container = document.querySelector(".css-1wne25x");
      if (!container) return;
      const targetHeader = container.querySelector("h3");
      if (!targetHeader || targetHeader.querySelector("#sc-custom-exec-btn")) return;
      const baseStyle = `
                margin-left: 10px; padding: 4px 10px; color: white; border: none;
                border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
                vertical-align: middle; transition: all 0.2s;
            `;
      const btnCustom = document.createElement("button");
      btnCustom.id = "sc-custom-exec-btn";
      btnCustom.textContent = "\u81EA\u5B9A\u4E49\u9AD8\u7BA1\u6570\u636E";
      btnCustom.style.cssText = baseStyle + "background-color: #673ab7;";
      btnCustom.onclick = (e) => {
        e.preventDefault();
        executiveCustomButton.show();
      };
      targetHeader.appendChild(btnCustom);
    }
    const observer = new MutationObserver(() => injectCustomButton());
    function init2() {
      if (typeof window.isPageModuleEnabled === "function" && !window.isPageModuleEnabled("executiveSave")) return;
      observer.observe(document.body, { childList: true, subtree: true });
      injectCustomButton();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init2);
    } else {
      init2();
    }
    return { forceInject: injectCustomButton };
  })();
  registerExportInfo({
    name: "\u81EA\u5B9A\u4E49\u9AD8\u7BA1\u6570\u636E",
    scope: "realm",
    keys: (realmId) => realmId === null ? ["SC-Saved-Boardroom", "SC-Saved-Bonuses"] : [`R${realmId}-SC-Saved-Boardroom`, `R${realmId}-SC-Saved-Bonuses`]
  });

  // src/features/resourceMarketHandler.js
  registerExportInfo({
    name: "\u4EA4\u6613\u6240\u8BA1\u7B97\u53C2\u6570",
    scope: "global",
    keys: ["sc_building_level", "sc_building_hours"]
  });
  var { SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = state;
  var MESSAGE_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 512 512" style="display:block;width:14px;height:14px;" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="envelope" class="css-0" role="img" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"></path></svg>`;
  var ResourceMarketHandler2 = (function() {
    let currentResourceId = null;
    let currentRealmId = null;
    let rowIdCounter = 0;
    const pendingRows = /* @__PURE__ */ new Map();
    let summaryDisplay = null;
    let calcTimer = null;
    let _autoSelectTimer = null;
    let _pendingAutoSelect = null;
    let _pendingAutoSelectPollTimer = null;
    let _globalObserver = null;
    let _tableObserver = null;
    let _messageIconObserver = null;
    let _quantityCheckInterval = null;
    let _formClickHandler = null;
    let _initDone = false;
    const workerCode = `
        self.onmessage = function(e) {
        const { orders, shared, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!orders || !orders.length) { self.postMessage([]); return; }

        const lwe = SCD.retailInfo;
        const zn = SCD.data;

        const Ul = (overhead, skillCOO) => {
            const r = overhead || 1;
            return r - (r - 1) * skillCOO / 100;
        };
        const wv = (e, t, r) => {
            return r === null ? lwe[e][t] : lwe[e][t].quality[r];
        };
        const Upt = (e, t, r, n) => t + (e + n) / r;
        const Hpt = (e, t, r, n, a) => {
            const o = (n + e) / ((t - a) * (t - a));
            return e - (r - t) * (r - t) * o;
        };
        const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
        const Bpt = (e, t, r, n, a, o) => {
            const g = RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = Math.max(0.9, s / 2 + 0.5),
                  c = r / 12;
            const d = PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0) * SCXXCS;
            const h = t.modeledUnitsSoldAnHour * l;
            const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
            const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
            return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
        };
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / size;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        // \u9884\u8BA1\u7B97\u5171\u4EAB\u503C\uFF08\u4E3B\u7EBF\u7A0B\u5DF2\u7B97\u597D\u4F20\u5165\uFF09
        const acceleration = SRC.acceleration;
        const economyState = shared.economyState;
        const v = shared.v;
        const b = shared.b;
        const wages = shared.wages;
        const buildingKind = shared.buildingKind;
        const weather = shared.weather;
        const size = 1;

        const results = [];

        for (const order of orders) {
            const { rowId, price, quantity, quality, resourceId } = order;

            // \u6839\u636E MP-?% \u8C03\u6574\u8FDB\u8D27\u6210\u672C\u4EF7
            let costPrice = price;
            if (shared.mpPercent != null && shared.mpPercent !== 0 && isFinite(shared.mpPercent)) {
                if (shared.mpPercent >= 0) {
                    costPrice = price * (1 - shared.mpPercent / 100);
                } else {
                    costPrice = price + shared.mpPercent;
                }
            }

            // \u9971\u548C\u5EA6\uFF1A\u8D44\u6E90150\uFF08\u6811\uFF09\u6309\u54C1\u8D28\u533A\u5206\uFF0C\u5176\u4F59\u7EDF\u4E00
            let saturation;
            if (parseInt(resourceId) === 150 && quality !== undefined) {
                saturation = shared.saturationByQuality ? shared.saturationByQuality[quality] : shared.saturation;
            } else {
                saturation = shared.saturation;
            }

            const forceQuality = (parseInt(resourceId) === 150) ? quality : undefined;

            let currentPrice = price,
                maxProfit = -Infinity,
                selltime;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, forceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    forceQuality === void 0 ? quality : 0,
                    saturation,
                    acceleration,
                    size,
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                const secondsToFinish = w;
                const profit = (!secondsToFinish || secondsToFinish <= 0)
                    ? NaN
                    : (revenue - costPrice * quantity - wagesTotal) / secondsToFinish;

                if (!secondsToFinish || secondsToFinish <= 0) break;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    selltime = secondsToFinish;
                }
                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({ rowId, maxProfit, selltime });
        }

        self.postMessage(results);
        };
        `;
    const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
    const allProfitSpans = /* @__PURE__ */ new Set();
    let isShowingProfit = true;
    function cleanupInputListeners() {
      if (_quantityCheckInterval) {
        clearInterval(_quantityCheckInterval);
        _quantityCheckInterval = null;
      }
      const oldInput = document.querySelector('input[name="quantity"]');
      if (oldInput) {
        oldInput.removeAttribute("data-calc-listener");
      }
    }
    function attachInputListener() {
      const input = document.querySelector('input[name="quantity"]');
      if (input && !input.hasAttribute("data-calc-listener")) {
        input.setAttribute("data-calc-listener", "true");
        input.addEventListener("input", () => {
          requestAnimationFrame(updateGlobalSimulation);
        });
        let lastValue = input.value;
        _quantityCheckInterval = setInterval(() => {
          if (input.value !== lastValue) {
            lastValue = input.value;
            updateGlobalSimulation();
          }
        }, 500);
        const parentForm = input.closest("form");
        if (parentForm) {
          if (_formClickHandler) {
            parentForm.removeEventListener("click", _formClickHandler);
          }
          _formClickHandler = (e) => {
            if (e.target.tagName === "BUTTON") {
              setTimeout(updateGlobalSimulation, 50);
            }
          };
          parentForm.addEventListener("click", _formClickHandler);
        }
      }
    }
    function formatDuration(totalHours) {
      if (!totalHours || totalHours <= 0) return "0m";
      const h = Math.floor(totalHours);
      const m = Math.round((totalHours - h) * 60);
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    }
    function debouncedUpdate() {
      if (calcTimer) cancelAnimationFrame(calcTimer);
      calcTimer = requestAnimationFrame(() => {
        updateGlobalSimulation();
      });
    }
    function autoSelectBestRow(bestRow) {
      const labelData = extractNumbersFromAriaLabel(bestRow.getAttribute("aria-label"));
      if (!labelData) return;
      const targetQuality = labelData.quality;
      const qBtn = document.getElementById("quality-selection");
      if (!qBtn) return;
      const currentSpan = qBtn.querySelector("span");
      const currentQuality = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
      if (isNaN(currentQuality)) return;
      if (currentQuality !== targetQuality) {
        qBtn.click();
        setTimeout(() => {
          const dropdownMenu = qBtn.parentElement?.querySelector(".dropdown-menu");
          if (!dropdownMenu) return;
          const items = dropdownMenu.querySelectorAll("li a");
          for (const item of items) {
            const txt = item.textContent?.trim();
            if (txt === "\u5168\u90E8") continue;
            const q = parseInt(txt);
            if (q === targetQuality) {
              item.click();
              const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
              let prevTs = 0;
              for (const k of keys) {
                try {
                  const raw = localStorage.getItem(k);
                  if (raw) {
                    const p = JSON.parse(raw);
                    if ((p.timestamp || 0) > prevTs) prevTs = p.timestamp || 0;
                  }
                } catch (e) {
                }
              }
              _pendingAutoSelect = { targetQuality, startTime: Date.now(), prevTs };
              _startPendingAutoSelectPoll();
              return;
            }
          }
        }, 100);
        return;
      }
      bestRow.focus();
      bestRow.click();
    }
    function _startPendingAutoSelectPoll() {
      if (_pendingAutoSelectPollTimer) clearTimeout(_pendingAutoSelectPollTimer);
      if (!_pendingAutoSelect) return;
      const MAX_WAIT = 2e4;
      if (Date.now() - _pendingAutoSelect.startTime > MAX_WAIT) {
        _pendingAutoSelect = null;
        return;
      }
      const qBtn = document.getElementById("quality-selection");
      const currentSpan = qBtn?.querySelector("span");
      const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
      if (curQ !== _pendingAutoSelect.targetQuality) {
        _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 300);
        return;
      }
      const keys = [`market_all_${currentRealmId}_${currentResourceId}`, `market_${currentRealmId}_${currentResourceId}`];
      let newTs = 0;
      for (const k of keys) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const p = JSON.parse(raw);
            if ((p.timestamp || 0) > newTs) newTs = p.timestamp || 0;
          }
        } catch (e) {
        }
      }
      if (newTs > _pendingAutoSelect.prevTs) {
        _pendingAutoSelectPollTimer = setTimeout(() => {
          _pendingAutoSelectPollTimer = null;
          _tryClickBestRow();
        }, 800);
        return;
      }
      _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
    }
    function _tryClickBestRow() {
      if (!_pendingAutoSelect) return;
      const tbody = findValidTbody();
      if (!tbody) return;
      let bestRow = null, bestProfit = -Infinity;
      tbody.querySelectorAll("tr[data-profit-calculated]").forEach((row) => {
        if (row.offsetParent !== null && row.__profitData && row.__profitData.profit > bestProfit) {
          bestProfit = row.__profitData.profit;
          bestRow = row;
        }
      });
      if (bestRow) {
        const qBtn = document.getElementById("quality-selection");
        const curSpan = qBtn?.querySelector("span");
        const curQ = curSpan ? parseInt(curSpan.textContent?.trim()) : NaN;
        if (curQ === _pendingAutoSelect.targetQuality) {
          _pendingAutoSelect = null;
          bestRow.focus();
          bestRow.click();
          return;
        }
      }
      if (_pendingAutoSelect && Date.now() - _pendingAutoSelect.startTime < 2e4) {
        _pendingAutoSelectPollTimer = setTimeout(_startPendingAutoSelectPoll, 500);
      }
    }
    function updateGlobalSimulation() {
      const tbody = findValidTbody();
      if (!tbody || !summaryDisplay) return;
      const inputElement = document.querySelector('input[name="quantity"]');
      const userWantedQty = inputElement ? parseFloat(inputElement.value) || 0 : 0;
      const isSimulationMode = userWantedQty > 0;
      let rawRows = [];
      tbody.querySelectorAll("tr[data-profit-calculated]").forEach((row) => {
        if (row.offsetParent !== null && row.__profitData) {
          rawRows.push({
            row,
            profit: row.__profitData.profit,
            // 单位: $/s (可能是负数)
            time: row.__profitData.time
            // 单位: s
          });
        }
      });
      if (rawRows.length === 0) {
        const simContent = document.getElementById("sc-sim-content");
        if (simContent) simContent.innerHTML = `<div style="color:${DM() ? "#888" : "#777"};font-size:12px;text-align:center;padding:8px;">\u6682\u65E0\u8BA2\u5355\u6570\u636E</div>`;
        return;
      }
      let avgProfitPerHour = 0;
      let totalProfitVal = 0;
      let totalTimeSeconds = 0;
      let isFull = false;
      let displayTitle = "";
      let borderColor = "";
      let coveredCount = 0;
      let statusText = "";
      let bldLevel = 1;
      if (isSimulationMode) {
        const storedLevel = localStorage.getItem("sc_building_level");
        bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;
        const processedRows = rawRows.map((item) => {
          const data2 = extractNumbersFromAriaLabel(item.row.getAttribute("aria-label"));
          return {
            row: item.row,
            profit: item.profit,
            // $/s
            time: item.time,
            // s
            price: data2?.price || 0,
            quantity: data2?.quantity || 0,
            quality: data2?.quality || 0
          };
        });
        processedRows.sort((a, b) => {
          if (a.price !== b.price) return a.price - b.price;
          return b.quality - a.quality;
        });
        let remainingQty = userWantedQty;
        totalProfitVal = 0;
        totalTimeSeconds = 0;
        coveredCount = 0;
        for (const item of processedRows) {
          if (remainingQty <= 0) break;
          if (item.quantity <= 0) continue;
          const takeQty = Math.min(remainingQty, item.quantity);
          const ratio = takeQty / item.quantity;
          totalProfitVal += item.profit * item.time * ratio;
          totalTimeSeconds += item.time * ratio;
          remainingQty -= takeQty;
          coveredCount++;
        }
        const totalHours = totalTimeSeconds / 3600;
        avgProfitPerHour = totalHours > 0 ? totalProfitVal / totalHours : 0;
        isFull = remainingQty <= 0.01;
        displayTitle = `\u8D2D\u4E70${userWantedQty.toLocaleString()}\u4E2A - \u626B\u8D27\u6A21\u62DF`;
        borderColor = DM() ? "#FFC107" : "#B8860B";
        if (isFull) {
        } else {
          const bought = userWantedQty - remainingQty;
          statusText = `\u26A0\uFE0F\u7F3A\u8D27(\u4EC5\u4E70\u5230${Math.floor(bought).toLocaleString()})`;
        }
        rawRows.forEach((item) => {
          item.row.style.outline = "none";
          item.row.style.boxShadow = "none";
          item.row.style.backgroundColor = "";
        });
      } else {
        const profitableRows = rawRows.filter((r) => r.profit > 0);
        if (profitableRows.length === 0) {
          const simContent = document.getElementById("sc-sim-content");
          if (simContent) simContent.innerHTML = '<div style="color: #ff9800; font-size: 13px; text-align: center;">\u26A0\uFE0F \u65E0\u6B63\u5229\u6DA6\u8BA2\u5355</div>';
          return;
        }
        profitableRows.sort((a, b) => b.profit - a.profit);
        rawRows.forEach((item) => {
          item.row.style.outline = "none";
          item.row.style.boxShadow = "none";
          item.row.style.backgroundColor = "";
        });
        const best = profitableRows[0];
        if (best) {
          const dG = DM();
          best.row.style.outline = `2px dashed ${dG ? "#FFC107" : "#B8860B"}`;
          best.row.style.outlineOffset = "-2px";
          best.row.style.boxShadow = `inset 0 0 8px ${dG ? "rgba(255, 193, 7, 0.35)" : "rgba(184, 134, 11, 0.25)"}`;
          best.row.style.backgroundColor = dG ? "rgba(255, 193, 7, 0.07)" : "rgba(184, 134, 11, 0.05)";
          const autoSelectEnabled = (() => {
            try {
              const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
              return cfg["autoSelectBestMarketRow"] === true;
            } catch (e) {
              return false;
            }
          })();
          if (autoSelectEnabled) {
            if (_pendingAutoSelect) {
            } else {
              clearTimeout(_autoSelectTimer);
              _autoSelectTimer = setTimeout(() => autoSelectBestRow(best.row), 600);
            }
          }
        }
        const storedLevel = localStorage.getItem("sc_building_level");
        bldLevel = storedLevel !== null ? Math.max(1, parseInt(storedLevel) || 1) : 100;
        const storedHours = localStorage.getItem("sc_building_hours");
        const bldHours = storedHours !== null ? Math.max(0, parseFloat(storedHours) || 0) : 24;
        const targetSeconds = bldLevel * bldHours * 3600;
        let remainingTime = targetSeconds;
        let usedTime = 0;
        for (const order of profitableRows) {
          if (remainingTime <= 0) break;
          const takeTime = Math.min(order.time, remainingTime);
          totalProfitVal += order.profit * takeTime;
          usedTime += takeTime;
          remainingTime -= takeTime;
        }
        totalTimeSeconds = usedTime;
        const totalHours = totalTimeSeconds / 3600;
        avgProfitPerHour = totalHours > 0 ? totalProfitVal / totalHours : 0;
        isFull = totalHours >= bldLevel * bldHours - 0.1;
        displayTitle = `${bldLevel}\u7EA7\u5EFA\u7B51\u8FD0\u884C${bldHours}H\u6B63\u65F6\u5229`;
        borderColor = isFull ? "#4CAF50" : "#ff9800";
      }
      const avgStr = avgProfitPerHour.toFixed(2);
      const totalProfitK = (totalProfitVal / 1e3).toFixed(1);
      const durationStr = formatDuration(totalTimeSeconds / 3600);
      const bldRunHours = totalTimeSeconds / 3600 / bldLevel;
      const bldRunStr = formatDuration(bldRunHours);
      const mpInputEl = document.getElementById("sc-mp-input");
      const curMp = mpInputEl ? parseFloat(mpInputEl.value) || 0 : 0;
      const renderUI = () => {
        const simContent = document.getElementById("sc-sim-content");
        if (!simContent) return;
        const d7r = DM();
        const isNarrowR = window.innerWidth <= 576;
        let mpBadgeHtml = "";
        if (curMp !== 0) {
          const mpLabel = curMp > 0 ? `MP-${curMp}%` : `MP-${Math.abs(curMp)}`;
          mpBadgeHtml = `<div style="background: ${d7r ? "#3a2a5e" : "#ede7f6"}; color: ${d7r ? "#b39ddb" : "#5e35b1"}; padding: ${isNarrowR ? "1px 4px" : "2px 6px"}; border-radius: 4px;">${mpLabel} </div>`;
        }
        let periodBadgeHtml = "";
        const economySelectEl2 = document.getElementById("sc-economy-select");
        const economyVal = economySelectEl2 ? economySelectEl2.value : "";
        if (economyVal !== "") {
          const periodNames = { "0": "\u8427\u6761", "1": "\u5E73\u7F13", "2": "\u666F\u6C14" };
          const periodName = periodNames[economyVal] || economyVal;
          periodBadgeHtml = `<div style="background: ${d7r ? "#3a2a1e" : "#fff3cd"}; color: ${d7r ? "#f0c040" : "#856404"}; padding: ${isNarrowR ? "1px 4px" : "2px 6px"}; border-radius: 4px;">\u5468\u671F:${periodName}</div>`;
        }
        simContent.innerHTML = `
                    <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: ${isNarrowR ? "2px" : "8px"}; font-size: ${isNarrowR ? "11px" : ""};">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${d7r ? "#444" : "#ddd"}; padding-bottom: ${isNarrowR ? "0px" : "6px"}; font-size: 14px;">
                            <span style="color: ${d7r ? "#aaa" : "#777"};">${displayTitle}<span id="sc-info-tip" title="\u81EA\u52A8\u66F4\u65B0\u6570\u636E\u6709\u5EF6\u8FDF\uFF0C\u5DE6\u4E0B\u53EF\u624B\u52A8\u66F4\u65B0&#10;\u663E\u793A\u5747\u4E3A1\u7EA7\u5EFA\u7B51" onclick="event.stopPropagation();var ex=document.getElementById('sc-info-popup');if(ex){ex.remove();return;}var t=this;var isD=window.getComputedStyle(document.body).backgroundColor.match(/d+/g);isD=isD&&isD.map(Number).reduce(function(a,b){return a+b},0)<380;var d=document.createElement('div');d.id='sc-info-popup';d.textContent='\u81EA\u52A8\u66F4\u65B0\u6570\u636E\u6709\u5EF6\u8FDF\uFF0C\u5DE6\u4E0B\u53EF\u624B\u52A8\u66F4\u65B0 | \u663E\u793A\u5747\u4E3A1\u7EA7\u5EFA\u7B51';d.style.cssText='position:absolute;top:100%;left:0;margin-top:4px;padding:5px 10px;background:'+(isD?'#333':'#fff')+';color:'+(isD?'#eee':'#333')+';border:1px solid '+(isD?'#555':'#bbb')+';border-radius:4px;font-size:11px;font-weight:normal;white-space:nowrap;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.35);';t.parentElement.style.position='relative';t.parentElement.appendChild(d);" style="display:inline-flex;align-items:center;justify-content:center;cursor:pointer;margin-left:5px;width:16px;height:16px;min-width:16px;font-size:10px;font-weight:bold;line-height:1;color:${d7r ? "#bbb" : "#555"};background:${d7r ? "#444" : "#e8e8e8"};border:1px solid ${d7r ? "#555" : "#bbb"};border-radius:50%;vertical-align:middle;user-select:none;flex-shrink:0;">?</span></span>
                            <span style="font-weight: bold; color: ${borderColor};">$${avgStr}<span style="font-weight:normal;">/h</span></span>
                        </div>

                        <div style="display: flex; flex-wrap: wrap; gap: ${isNarrowR ? "2px" : "6px"};">
                            ${statusText ? `<div style="background: ${d7r ? "#333" : "#e8e8e8"}; color: ${d7r ? "#ccc" : "#555"}; padding: ${isNarrowR ? "1px 4px" : "2px 6px"}; border-radius: 4px;">${statusText}</div>` : ""}

                            <div style="background: ${d7r ? "#333" : "#e8e8e8"}; color: ${d7r ? "#ccc" : "#555"}; padding: ${isNarrowR ? "1px 4px" : "2px 6px"}; border-radius: 4px;">
                                \u603B\u5229: $${totalProfitK}k
                            </div>

                            <div style="background: ${d7r ? "#333" : "#e8e8e8"}; color: ${d7r ? "#ccc" : "#555"}; padding: ${isNarrowR ? "1px 4px" : "2px 6px"}; border-radius: 4px;">
                                ${bldLevel}\u7EA7\u5EFA\u7B51\u53EF\u8FD0\u884C: ${bldRunStr}
                            </div>
                            ${mpBadgeHtml}${periodBadgeHtml}
                        </div>
                    </div>`;
      };
      renderUI();
    }
    let _simDebounceTimer = null;
    const scheduleSimUpdate = () => {
      if (_simDebounceTimer) clearTimeout(_simDebounceTimer);
      _simDebounceTimer = setTimeout(() => {
        _simDebounceTimer = null;
        updateGlobalSimulation();
      }, 80);
    };
    profitWorker.onmessage = function(e) {
      const results = e.data;
      if (!Array.isArray(results)) return;
      for (const item of results) {
        const { rowId, maxProfit, selltime } = item;
        const row = pendingRows.get(rowId);
        if (!row) continue;
        pendingRows.delete(rowId);
        row.__profitData = { profit: maxProfit, time: selltime };
        const hours = Math.floor(selltime / 3600);
        const minutes = Math.ceil(selltime % 3600 / 60);
        const timeStr = `${hours > 0 ? `${hours}h ` : ""}${minutes}m`;
        const profitStr = (maxProfit * 3600).toFixed(2);
        if (!row.querySelector("td.auto-profit-info")) {
          const td = document.createElement("td");
          td.classList.add("auto-profit-info");
          const span = document.createElement("span");
          const d7s = DM();
          span.style.cssText = `display: inline-block; min-width: 30px; color: ${d7s ? "white" : "#333"}; background: ${d7s ? "#555" : "#e0e0e0"}; border-radius: 2px; white-space: nowrap;`;
          const isNarrow = window.innerWidth <= 576;
          const isInfinity = !isFinite(maxProfit * 3600);
          const profitLabel = isInfinity ? "\u5356\u4E0D\u4E86" : isNarrow ? maxProfit >= 0 ? `\u{1F4B0}${profitStr}` : `\u26A0\uFE0F${profitStr}` : maxProfit >= 0 ? `\u65F6\u5229\u6DA6:${profitStr}` : `\u26A0\uFE0F\u65F6\u5229\u6DA6:${profitStr}`;
          span.dataset.p = profitLabel;
          span.dataset.t = `\u7528\u65F6:${timeStr}`;
          span.textContent = isShowingProfit ? span.dataset.p : span.dataset.t;
          td.appendChild(span);
          row.appendChild(td);
          if (window.innerWidth <= 576) {
            const priceTd = td.previousElementSibling;
            if (priceTd) {
              const priceDiv = priceTd.querySelector("div");
              if (priceDiv) priceDiv.style.minWidth = "10px";
            }
          }
          allProfitSpans.add(span);
          if (allProfitSpans.size > 200) {
            for (const s of allProfitSpans) {
              if (!s.isConnected) allProfitSpans.delete(s);
            }
          }
        }
      }
      attachInputListener();
      scheduleSimUpdate();
    };
    function findValidTbody() {
      return [...document.querySelectorAll("tbody")].find((tbody) => {
        const firstRow = tbody.querySelector("tr");
        return firstRow && firstRow.children.length >= 4 && firstRow.querySelector('td > div > div > a[href*="/company/"]');
      });
    }
    function extractNumbersFromAriaLabel(label) {
      if (!label || typeof label !== "string") return null;
      let match2;
      const regexEN = /^market order, price \$?([\d,.]+), quantity ([\d,.]+), quality (\d+), offered by company/i;
      const regexSC = /^由.*公司提供的市场订单：价格\$?([\d,.]+)，数量([\d,.]+)，质量(\d+)/;
      const regexTC = /^由.*公司提供的市場訂單：價格\$?([\d,.]+)，數量([\d,.]+)，品質(\d+)/;
      if (match2 = label.match(regexEN)) {
        return { price: parseFloat(match2[1].replace(/,/g, "")), quantity: parseFloat(match2[2].replace(/,/g, "")), quality: parseInt(match2[3]) };
      } else if (match2 = label.match(regexSC)) {
        return { price: parseFloat(match2[1].replace(/,/g, "")), quantity: parseFloat(match2[2].replace(/,/g, "")), quality: parseInt(match2[3]) };
      } else if (match2 = label.match(regexTC)) {
        return { price: parseFloat(match2[1].replace(/,/g, "")), quantity: parseFloat(match2[2].replace(/,/g, "")), quality: parseInt(match2[3]) };
      }
      return null;
    }
    function extractRealmIdOnce(tbody) {
      if (currentRealmId) return;
      const row = tbody.querySelector("tr");
      const link = row?.querySelector('a[href*="/company/"]');
      const match2 = link?.getAttribute("href")?.match(/\/company\/(\d+)\//);
      if (match2) {
        currentRealmId = match2[1];
      }
    }
    function injectMessageIcon(row) {
      if (row.hasAttribute("data-sc-message-added")) return;
      const link = row.querySelector('td > div > div > a[href*="/company/"]');
      if (!link || !link.parentElement) return;
      const nameEl = link.nextElementSibling?.querySelector("span") || link.parentElement.querySelector("div span, span");
      const companyName = nameEl?.textContent?.trim();
      if (!companyName) return;
      const messageLink = document.createElement("a");
      messageLink.href = `https://www.simcompanies.com/zh-cn/messages/${encodeURIComponent(companyName)}`;
      messageLink.target = "_blank";
      messageLink.rel = "noopener";
      messageLink.title = "\u7ED9\u516C\u53F8\u53D1\u79C1\u4FE1";
      messageLink.style.cssText = `display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; margin-right:3px; color:inherit; vertical-align:middle; flex-shrink:0; line-height:1; text-decoration:none;`;
      messageLink.innerHTML = MESSAGE_ICON_SVG;
      messageLink.setAttribute("data-sc-market-message-icon", "true");
      messageLink.addEventListener("click", (e) => e.stopPropagation());
      link.parentElement.insertBefore(messageLink, link);
      row.setAttribute("data-sc-message-added", "true");
    }
    const isMarketMessageIconEnabled = () => {
      try {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["marketMessageIcon"] === true;
      } catch (e) {
        return false;
      }
    };
    const stopMessageIconWatch = () => {
      if (_messageIconObserver) {
        _messageIconObserver.disconnect();
        _messageIconObserver = null;
      }
      document.querySelectorAll("tr[data-sc-message-added]").forEach((row) => {
        row.querySelectorAll("a[data-sc-market-message-icon]").forEach((a) => a.remove());
        row.removeAttribute("data-sc-message-added");
      });
    };
    const startMessageIconWatch = () => {
      stopMessageIconWatch();
      if (!isMarketMessageIconEnabled()) return;
      const injectMessageIconStyles = () => {
        if (document.getElementById("sc-market-message-icon-style")) return;
        const style = document.createElement("style");
        style.id = "sc-market-message-icon-style";
        style.textContent = `
                    a[data-sc-market-message-icon] {
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        width: 18px !important;
                        height: 18px !important;
                        margin: 0 3px 0 0 !important;
                        color: inherit !important;
                        vertical-align: middle !important;
                        line-height: 1 !important;
                        text-decoration: none !important;
                        align-self: center !important;
                        flex: 0 0 auto !important;
                    }
                    a[data-sc-market-message-icon] svg {
                        display: block !important;
                        width: 14px !important;
                        height: 14px !important;
                        margin: 0 !important;
                    }
                `;
        document.head.appendChild(style);
      };
      injectMessageIconStyles();
      const injectRows = () => {
        if (!/\/market\/resource\/\d+/.test(location.pathname) || !isMarketMessageIconEnabled()) {
          stopMessageIconWatch();
          return;
        }
        const tbody = findValidTbody();
        if (tbody) tbody.querySelectorAll("tr").forEach(injectMessageIcon);
      };
      injectRows();
      _messageIconObserver = new MutationObserver(() => {
        requestAnimationFrame(injectRows);
      });
      _messageIconObserver.observe(document.body, { childList: true, subtree: true });
    };
    function buildSharedContext(SCD, SRC, currentResourceId2) {
      const resource = parseInt(currentResourceId2);
      const zn = SCD.data;
      const pageActionsConfig = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
      const isCustomEnabled = pageActionsConfig["executiveCustomToggle"] === true;
      const economySelectEl = document.getElementById("sc-economy-select");
      const economyState = economySelectEl && economySelectEl.value !== "" ? parseInt(economySelectEl.value) : SRC.economyState;
      let skillCMO, skillCOO;
      if (isCustomEnabled) {
        const bonusKey = `R${currentRealmId}-SC-Saved-Bonuses`;
        try {
          const SSB = JSON.parse(localStorage.getItem(bonusKey));
          if (SSB) {
            skillCMO = SSB.saleBonus;
            skillCOO = SSB.adminBonus;
          } else {
            skillCMO = SRC.saleBonus;
            skillCOO = SRC.adminBonus;
          }
        } catch {
          skillCMO = SRC.saleBonus;
          skillCOO = SRC.adminBonus;
        }
      } else {
        skillCMO = SRC.saleBonus;
        skillCOO = SRC.adminBonus;
      }
      const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
      const buildingKind = Object.entries(zn.SALES).find(
        ([, ids]) => ids.includes(resource)
      )?.[0];
      const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
      const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
      const list = SRC.ResourcesRetailInfo || [];
      let saturation, saturationByQuality;
      if (resource === 150) {
        saturationByQuality = {};
        for (const item of list) {
          if (item.dbLetter === 150 && item.quality != null) {
            saturationByQuality[item.quality] = item.saturation;
          }
        }
        saturation = saturationByQuality[0];
      } else {
        const m = list.find((item) => item.dbLetter === resource);
        saturation = m?.saturation;
      }
      const resourceDetail = SCD.constantsResources?.[resource];
      const weather = resourceDetail && resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0;
      const v = salesModifierWithRecreationBonus + skillCMO;
      const b = (() => {
        const r = SRC.administration || 1;
        return r - (r - 1) * skillCOO / 100;
      })();
      const mpInputEl = document.getElementById("sc-mp-input");
      const mpPercent = mpInputEl ? parseFloat(mpInputEl.value) || 0 : 0;
      return {
        economyState,
        buildingKind,
        wages,
        saturation,
        saturationByQuality,
        weather,
        v,
        b,
        mpPercent
      };
    }
    async function processNewRows(tbody, forceReset = false) {
      if (forceReset) {
        tbody.querySelectorAll("tr[data-profit-calculated]").forEach((row) => {
          row.removeAttribute("data-profit-calculated");
          row.__profitData = null;
          const oldTd = row.querySelector("td.auto-profit-info");
          if (oldTd) oldTd.remove();
        });
        allProfitSpans.clear();
        pendingRows.clear();
      }
      const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
      if (!SCD_raw) return;
      const SCD = JSON.parse(SCD_raw);
      const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${currentRealmId}`));
      if (!SRC) return;
      const rows = Array.from(tbody.querySelectorAll("tr")).filter((r) => !r.hasAttribute("data-profit-calculated"));
      const orders = [];
      for (const row of rows) {
        const data2 = extractNumbersFromAriaLabel(row.getAttribute("aria-label"));
        if (!data2) continue;
        const rowId = rowIdCounter++;
        pendingRows.set(rowId, row);
        row.setAttribute("data-profit-calculated", "1");
        orders.push({ rowId, price: data2.price, quantity: data2.quantity, quality: data2.quality, resourceId: currentResourceId });
      }
      if (orders.length > 0) {
        const shared = buildSharedContext(SCD, SRC, currentResourceId);
        profitWorker.postMessage({
          orders,
          shared,
          SCD,
          SRC,
          SCXXCS,
          PROFIT_PER_BUILDING_LEVEL,
          RETAIL_ADJUSTMENT
        });
      } else if (pendingRows.size > 0) {
        for (const [rid, row] of pendingRows) {
          if (!row.isConnected) pendingRows.delete(rid);
        }
      }
      updateGlobalSimulation();
    }
    (function() {
      const TAKE_URL = "/api/v2/market-order/take/";
      function onTakeSuccess() {
        if (!currentResourceId || !currentRealmId) return;
        const autoSelectEnabled = (() => {
          try {
            const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
            return cfg["autoSelectBestMarketRow"] === true;
          } catch (e) {
            return false;
          }
        })();
        if (!autoSelectEnabled) return;
        if (_pendingAutoSelectPollTimer) {
          clearTimeout(_pendingAutoSelectPollTimer);
          _pendingAutoSelectPollTimer = null;
        }
        _pendingAutoSelect = null;
        const qBtn = document.getElementById("quality-selection");
        if (!qBtn) return;
        const currentSpan = qBtn.querySelector("span");
        const curQ = currentSpan ? parseInt(currentSpan.textContent?.trim()) : NaN;
        if (isNaN(curQ)) return;
        if (curQ === "\u5168\u90E8" || isNaN(curQ)) return;
        qBtn.click();
        setTimeout(() => {
          const dropdownMenu = qBtn.parentElement?.querySelector(".dropdown-menu");
          if (!dropdownMenu) return;
          const items = dropdownMenu.querySelectorAll("li a");
          for (const item of items) {
            if (item.textContent?.trim() === "\u5168\u90E8" || item.textContent?.trim() === "All") {
              item.click();
              return;
            }
          }
        }, 100);
      }
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        const isTake = url.includes(TAKE_URL);
        const response = await origFetch.apply(this, args);
        if (isTake && response.ok) {
          try {
            const cloned = response.clone();
            cloned.json().then(() => onTakeSuccess()).catch(() => {
            });
          } catch (e) {
          }
        }
        return response;
      };
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === "string" && url.includes(TAKE_URL) && method.toUpperCase() === "POST") {
          this.addEventListener("load", function() {
            if (this.status >= 200 && this.status < 300) {
              onTakeSuccess();
            }
          });
        }
        return origOpen.apply(this, arguments);
      };
    })();
    return {
      init(resourceId) {
        clearTimeout(_autoSelectTimer);
        _autoSelectTimer = null;
        if (_pendingAutoSelectPollTimer) {
          clearTimeout(_pendingAutoSelectPollTimer);
          _pendingAutoSelectPollTimer = null;
        }
        _pendingAutoSelect = null;
        cleanupInputListeners();
        if (_globalObserver) {
          _globalObserver.disconnect();
          _globalObserver = null;
        }
        if (_tableObserver) {
          _tableObserver.disconnect();
          _tableObserver = null;
        }
        stopMessageIconWatch();
        _initDone = false;
        pendingRows.clear();
        allProfitSpans.clear();
        document.querySelectorAll("form[data-market-calc-initialized]").forEach((f) => {
          f.removeAttribute("data-market-calc-initialized");
        });
        if (summaryDisplay && summaryDisplay.parentNode) {
          summaryDisplay.remove();
        }
        summaryDisplay = null;
        currentResourceId = resourceId;
        currentRealmId = null;
        const marketProfitEnabled = typeof window.isPageModuleEnabled === "function" ? window.isPageModuleEnabled("marketProfit") : true;
        if (!marketProfitEnabled && !isMarketMessageIconEnabled()) return;
        startMessageIconWatch();
        if (!marketProfitEnabled) return;
        let currentIsRetail = false;
        const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
        if (SCD_raw) {
          const SCD = JSON.parse(SCD_raw);
          currentIsRetail = Object.values(SCD.data.SALES).some((l) => l.includes(parseInt(currentResourceId)));
        }
        if (!currentIsRetail) {
          return;
        }
        const tryInit = () => {
          if (_initDone) return;
          const tbody = findValidTbody();
          const form = document.querySelector("form");
          if (!tbody || !form) return;
          if (form.hasAttribute("data-market-calc-initialized")) {
            return;
          }
          extractRealmIdOnce(tbody);
          const formParent = form.parentElement;
          const container = formParent?.parentElement?.parentElement;
          if (container && !container.querySelector("[data-custom-notice]")) {
            const d7 = DM();
            const isNarrow7 = window.innerWidth <= 576;
            summaryDisplay = document.createElement("div");
            summaryDisplay.style.cssText = `background: ${d7 ? "#222" : "#f9f9f9"}; padding: 0 0 0 ${isNarrow7 ? "6px" : "12px"}; border-radius: 4px; margin-bottom: ${isNarrow7 ? "0px" : "10px"}; border-left: ${isNarrow7 ? "3px" : "4px"} solid #4CAF50; min-height: ${isNarrow7 ? "0" : "40px"}; color: ${d7 ? "#efefef" : "#333"};`;
            summaryDisplay.dataset.customNotice = "true";
            const infoHeader = document.createElement("div");
            infoHeader.style.cssText = `display: flex; flex-wrap: wrap; align-items: center; gap: ${isNarrow7 ? "2px" : "8px"}; margin-bottom: ${isNarrow7 ? "0px" : "8px"}; border-bottom: 1px solid ${d7 ? "#444" : "#ddd"};`;
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.id = "sc-custom-toggle-wrapper";
            const btnBorderColor = d7 ? "#555" : "#bbb";
            const btnFgColor = d7 ? "#aaa" : "#666";
            toggleBtn.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid ${btnBorderColor}; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
            const refreshToggleUI = () => {
              const config = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
              const isEnabled = config["executiveCustomToggle"] !== void 0 ? config["executiveCustomToggle"] : false;
              toggleBtn.textContent = `\u81EA\u5B9A\u4E49\uFF1A${isEnabled ? "\u5F00" : "\u5173"}`;
              toggleBtn.style.color = isEnabled ? "#4CAF50" : btnFgColor;
              toggleBtn.style.borderColor = isEnabled ? "#4CAF50" : btnBorderColor;
            };
            refreshToggleUI();
            toggleBtn.onclick = (e) => {
              e.preventDefault();
              const config = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
              config["executiveCustomToggle"] = !(config["executiveCustomToggle"] === true);
              localStorage.setItem("SC_PageActions_Settings", JSON.stringify(config));
              refreshToggleUI();
              const tbody2 = findValidTbody();
              if (tbody2) requestAnimationFrame(() => processNewRows(tbody2, true));
            };
            const btnSettings = document.createElement("button");
            btnSettings.type = "button";
            btnSettings.textContent = "\u81EA\u5B9A\u4E49\u6570\u636E";
            btnSettings.style.cssText = `font-size: 11px; color: ${btnFgColor}; background: none; border: 1px solid #673ab7; border-radius: 3px; padding: 1px 6px; cursor: pointer; white-space: nowrap;`;
            btnSettings.onclick = (e) => {
              e.preventDefault();
              if (typeof executiveCustomButton !== "undefined") executiveCustomButton.show();
            };
            const oldMpInput = document.getElementById("sc-mp-input");
            if (oldMpInput) oldMpInput.value = "0";
            const mpGroup = document.createElement("span");
            mpGroup.style.cssText = `display: inline-flex; align-items: center; gap: 1px; white-space: nowrap;`;
            const mpLabel = document.createElement("span");
            mpLabel.textContent = "MP-";
            mpLabel.style.cssText = `font-size: 12px; font-weight: bold; color: ${d7 ? "#ffb74d" : "#e65100"};`;
            const mpInput = document.createElement("input");
            mpInput.id = "sc-mp-input";
            mpInput.type = "number";
            mpInput.step = "0.01";
            mpInput.value = "0";
            mpInput.placeholder = "?";
            mpInput.title = "\u6A21\u62DF\u626B\u8D27\u6210\u672C\uFF1A\u22650\u4E3AMP-?%\uFF0C\u8D1F\u6570=\u76F4\u63A5\u51CF\u4EF7\u3002\u6539\u540E\u5B9E\u65F6\u91CD\u7B97\u3002";
            mpInput.style.cssText = `font-size: 11px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#333" : "#fff"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
            mpInput.addEventListener("input", () => {
              const currentTbody = findValidTbody();
              if (currentTbody) {
                clearTimeout(window._scMpInputTimer);
                window._scMpInputTimer = setTimeout(() => {
                  requestAnimationFrame(() => processNewRows(currentTbody, true));
                }, 250);
              }
            });
            const mpPct = document.createElement("span");
            mpPct.textContent = "%";
            mpPct.style.cssText = `font-size: 11px; color: ${d7 ? "#aaa" : "#666"};`;
            const mpQuickBtn = document.createElement("button");
            mpQuickBtn.type = "button";
            mpQuickBtn.textContent = "4%";
            mpQuickBtn.title = "\u5FEB\u6377\u586B\u5165 MP-4%";
            mpQuickBtn.style.cssText = `font-size: 12px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#444" : "#e0e0e0"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
            mpQuickBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              mpInput.value = "4";
              mpInput.dispatchEvent(new Event("input", { bubbles: true }));
            });
            const mpClearBtn = document.createElement("button");
            mpClearBtn.type = "button";
            mpClearBtn.textContent = "\u6E05\u7A7A";
            mpClearBtn.title = "\u6E05\u7A7A MP \u503C";
            mpClearBtn.style.cssText = `font-size: 12px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#444" : "#e0e0e0"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 5px; cursor: pointer;`;
            mpClearBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              mpInput.value = "0";
              mpInput.dispatchEvent(new Event("input", { bubbles: true }));
            });
            mpGroup.appendChild(mpLabel);
            mpGroup.appendChild(mpInput);
            mpGroup.appendChild(mpPct);
            mpGroup.appendChild(mpQuickBtn);
            mpGroup.appendChild(mpClearBtn);
            const extraControls = document.createElement("span");
            extraControls.id = "sc-extra-controls";
            extraControls.style.cssText = `display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;`;
            const economyLabel = document.createElement("span");
            economyLabel.textContent = "\u5468\u671F:";
            economyLabel.style.cssText = `font-size: 11px; color: ${d7 ? "#aaa" : "#666"};`;
            extraControls.appendChild(economyLabel);
            const economySelect = document.createElement("select");
            economySelect.id = "sc-economy-select";
            economySelect.style.cssText = `font-size: 11px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#333" : "#fff"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 2px;`;
            economySelect.innerHTML = `
                            <option value="">\u5F53\u524D</option>
                            <option value="0">\u8427\u6761</option>
                            <option value="1">\u5E73\u7F13</option>
                            <option value="2">\u666F\u6C14</option>
                        `;
            economySelect.addEventListener("change", () => {
              const currentTbody2 = findValidTbody();
              if (currentTbody2) {
                requestAnimationFrame(() => processNewRows(currentTbody2, true));
              }
            });
            extraControls.appendChild(economySelect);
            const buildingLevelInput = document.createElement("input");
            buildingLevelInput.id = "sc-building-level";
            buildingLevelInput.type = "number";
            buildingLevelInput.min = "1";
            buildingLevelInput.step = "1";
            buildingLevelInput.value = localStorage.getItem("sc_building_level") || "100";
            buildingLevelInput.title = "\u5EFA\u7B51\u7B49\u7EA7";
            buildingLevelInput.style.cssText = `font-size: 11px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#333" : "#fff"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
            buildingLevelInput.addEventListener("input", () => {
              const raw = parseInt(buildingLevelInput.value);
              const v = raw >= 1 && Number.isFinite(raw) ? raw : 1;
              localStorage.setItem("sc_building_level", v);
              updateGlobalSimulation();
            });
            buildingLevelInput.addEventListener("change", () => {
              const raw = parseInt(buildingLevelInput.value);
              const v = raw >= 1 && Number.isFinite(raw) ? raw : 1;
              localStorage.setItem("sc_building_level", v);
              updateGlobalSimulation();
            });
            extraControls.appendChild(buildingLevelInput);
            const bldLabel1 = document.createElement("span");
            bldLabel1.textContent = "\u7EA7\u5EFA\u7B51\u8FD0\u884C";
            bldLabel1.style.cssText = `font-size: 11px; color: ${d7 ? "#aaa" : "#666"}; white-space: nowrap;`;
            extraControls.appendChild(bldLabel1);
            const buildingHoursInput = document.createElement("input");
            buildingHoursInput.id = "sc-building-hours";
            buildingHoursInput.type = "number";
            buildingHoursInput.min = "0";
            buildingHoursInput.step = "0.01";
            buildingHoursInput.value = localStorage.getItem("sc_building_hours") || "24";
            buildingHoursInput.title = "\u8FD0\u884C\u65F6\u957F\uFF08\u5C0F\u65F6\uFF09";
            buildingHoursInput.style.cssText = `font-size: 11px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#333" : "#fff"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 2px; width: 36px; text-align: center;`;
            buildingHoursInput.addEventListener("input", () => {
              const raw = parseFloat(buildingHoursInput.value);
              const v = raw > 0 && Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
              localStorage.setItem("sc_building_hours", v);
              updateGlobalSimulation();
            });
            buildingHoursInput.addEventListener("change", () => {
              const raw = parseFloat(buildingHoursInput.value);
              const v = raw > 0 && Number.isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
              localStorage.setItem("sc_building_hours", v);
              updateGlobalSimulation();
            });
            extraControls.appendChild(buildingHoursInput);
            const bldLabel2 = document.createElement("span");
            bldLabel2.textContent = "H";
            bldLabel2.style.cssText = `font-size: 11px; color: ${d7 ? "#aaa" : "#666"};`;
            extraControls.appendChild(bldLabel2);
            const basicGroup = document.createElement("span");
            basicGroup.id = "sc-basic-group";
            basicGroup.style.cssText = `display: inline-flex; align-items: center; gap: ${isNarrow7 ? "2px" : "8px"}; flex-wrap: wrap;`;
            basicGroup.appendChild(toggleBtn);
            basicGroup.appendChild(btnSettings);
            basicGroup.appendChild(mpGroup);
            const toggleExtraBtn = document.createElement("button");
            toggleExtraBtn.type = "button";
            toggleExtraBtn.textContent = "\u21C6";
            toggleExtraBtn.title = "\u5207\u6362\u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u7ECF\u6D4E\u5468\u671F/\u5EFA\u7B51\u7B49\u7EA7\uFF09";
            toggleExtraBtn.style.cssText = `font-size: 12px; color: ${d7 ? "#efefef" : "#333"}; background: ${d7 ? "#444" : "#e0e0e0"}; border: 1px solid ${d7 ? "#555" : "#bbb"}; border-radius: 3px; padding: 1px 5px; cursor: pointer; display: ${isNarrow7 ? "inline-block" : "none"}; flex-shrink: 0;`;
            if (isNarrow7) {
              extraControls.style.display = "none";
            }
            toggleExtraBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const bg = document.getElementById("sc-basic-group");
              const ec = document.getElementById("sc-extra-controls");
              if (!bg || !ec) return;
              const showingBasic = bg.style.display !== "none";
              if (showingBasic) {
                bg.style.display = "none";
                ec.style.display = "inline-flex";
                toggleExtraBtn.textContent = "\u21A9";
                toggleExtraBtn.title = "\u8FD4\u56DE\u57FA\u672C\u8BBE\u7F6E";
              } else {
                bg.style.display = "inline-flex";
                ec.style.display = "none";
                toggleExtraBtn.textContent = "\u21C6";
                toggleExtraBtn.title = "\u5207\u6362\u9AD8\u7EA7\u8BBE\u7F6E\uFF08\u7ECF\u6D4E\u5468\u671F/\u5EFA\u7B51\u7B49\u7EA7\uFF09";
              }
            });
            infoHeader.appendChild(basicGroup);
            infoHeader.appendChild(extraControls);
            infoHeader.appendChild(toggleExtraBtn);
            summaryDisplay.appendChild(infoHeader);
            const simContent = document.createElement("div");
            simContent.id = "sc-sim-content";
            simContent.innerHTML = `<div style="color:${d7 ? "#888" : "#777"};font-size:12px;text-align:center;padding:8px;">\u7B49\u5F85\u6570\u636E\u52A0\u8F7D\u2026</div>`;
            summaryDisplay.appendChild(simContent);
            container.appendChild(summaryDisplay);
            if (window.innerWidth <= 991) {
              setTimeout(() => {
                const rows = tbody.querySelectorAll("tr");
                const lastRow = rows[rows.length - 1];
                if (lastRow) lastRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }, 200);
            }
            form.setAttribute("data-market-calc-initialized", "true");
          }
          _initDone = true;
          processNewRows(tbody);
          if (_tableObserver) _tableObserver.disconnect();
          _tableObserver = new MutationObserver(() => {
            requestAnimationFrame(() => processNewRows(tbody));
          });
          _tableObserver.observe(tbody, { childList: true });
          if (_globalObserver) {
            _globalObserver.disconnect();
            _globalObserver = null;
          }
        };
        tryInit();
        if (!_initDone) {
          _globalObserver = new MutationObserver((mutations) => {
            if (_initDone) return;
            for (const mutation of mutations) {
              if (mutation.addedNodes.length) {
                tryInit();
                break;
              }
            }
          });
          _globalObserver.observe(document.body, { childList: true, subtree: true });
        }
      }
    };
  })();
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.ResourceMarketHandler = ResourceMarketHandler2;

  // src/utils/uiComponents.js
  var createGlobalCustomToggle = (key, label, nativeStyles = {}, onToggleCallback) => {
    const CONFIG_KEY = "SC_PageActions_Settings";
    const DEFAULT_VALUE = key === "executiveCustomToggle" || key === "marketMaxProfitToggle" ? false : true;
    const wrapper = document.createElement("div");
    if (nativeStyles.wrapperClass) {
      wrapper.className = nativeStyles.wrapperClass;
    }
    wrapper.style.marginLeft = "10px";
    wrapper.style.display = "inline-block";
    const btn = document.createElement("button");
    btn.type = "button";
    if (nativeStyles.buttonClass) {
      btn.className = nativeStyles.buttonClass;
    }
    btn.style.cssText = `
            color: white; border: none; padding: 4px 12px; border-radius: 4px;
            cursor: pointer; font-size: 12px; font-weight: bold; outline: none;
            transition: all 0.2s;
        `;
    const refreshUI = () => {
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      const isEnabled = config[key] !== void 0 ? config[key] : DEFAULT_VALUE;
      btn.textContent = `${label}\uFF1A${isEnabled ? "\u5F00" : "\u5173"}`;
      btn.style.backgroundColor = isEnabled ? "#4CAF50" : "#607D8B";
    };
    btn.onclick = (e) => {
      e.preventDefault();
      const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
      const currentValue = config[key] !== void 0 ? config[key] : DEFAULT_VALUE;
      config[key] = !currentValue;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      refreshUI();
      if (onToggleCallback) onToggleCallback(config[key] !== false);
    };
    refreshUI();
    wrapper.appendChild(btn);
    return { wrapper, btn };
  };

  // src/features/constantsData.js
  var constantsData = /* @__PURE__ */ (() => {
    let _processedData = null;
    const init = async () => {
      const Network = window.__SC_Network;
      try {
        function extractSalaryModifiers(str2) {
          const result = {};
          const varAssignRegex = /(\w+)\s*=\s*{/g;
          let match2;
          while ((match2 = varAssignRegex.exec(str2)) !== null) {
            const startIndex2 = varAssignRegex.lastIndex - 1;
            let braceCount2 = 1;
            let currentIndex = startIndex2 + 1;
            while (braceCount2 > 0 && currentIndex < str2.length) {
              if (str2[currentIndex] === "{") braceCount2++;
              else if (str2[currentIndex] === "}") braceCount2--;
              currentIndex++;
            }
            if (braceCount2 === 0) {
              const objText = str2.slice(startIndex2, currentIndex);
              const dbLetterMatch2 = objText.match(/dbLetter\s*:\s*"(\w+)"/);
              const salaryMatch = objText.match(/salaryModifier\s*:\s*([.\d]+)/);
              if (dbLetterMatch2 && salaryMatch) {
                const dbLetter = dbLetterMatch2[1];
                const salary = parseFloat(salaryMatch[1]);
                result[dbLetter] = salary;
              }
            }
          }
          const objectEntryRegex = /\d+\s*:\s*{[\s\S]*?}/g;
          const entries = str2.match(objectEntryRegex) || [];
          for (const entry of entries) {
            const dbLetterMatch2 = entry.match(/dbLetter\s*:\s*"(\w+)"/);
            const salaryMatch = entry.match(/salaryModifier\s*:\s*([.\d]+)/);
            if (dbLetterMatch2 && salaryMatch) {
              const dbLetter = dbLetterMatch2[1];
              const salary = parseFloat(salaryMatch[1]);
              result[dbLetter] = salary;
            }
          }
          const dbLetterRegex = /dbLetter\s*:\s*"(\w+)"/g;
          let dbLetterMatch;
          while ((dbLetterMatch = dbLetterRegex.exec(str2)) !== null) {
            const openBrace = str2.lastIndexOf("{", dbLetterMatch.index);
            if (openBrace === -1) continue;
            let depth = 0;
            for (let i = openBrace; i < str2.length; i++) {
              const ch = str2[i];
              if (ch === "{") depth++;
              else if (ch === "}") depth--;
              if (depth === 0) {
                const objText = str2.slice(openBrace, i + 1);
                const salaryMatch = objText.match(/salaryModifier\s*:\s*([.\d]+)/);
                if (salaryMatch) result[dbLetterMatch[1]] = parseFloat(salaryMatch[1]);
                break;
              }
            }
          }
          return result;
        }
        const scriptTag = document.querySelector(
          'script[type="module"][crossorigin][src^="https://www.simcompanies.com/static/bundle/assets/index-"][src$=".js"]'
        );
        if (!scriptTag) throw new Error("\u672A\u627E\u5230\u57FA\u672C\u6570\u636E\u6587\u4EF6");
        const rawContent = await Network.requestRaw(scriptTag.src);
        const data = {};
        const targetKeys = [
          "AVERAGE_SALARY",
          "SALES",
          "RETAIL_MODELING_QUALITY_WEIGHT"
        ];
        const extractValue = (variableName) => {
          const escapedVar = variableName.replace("$", "\\$");
          const varRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*([^,;\\n\\r]+)`);
          const match2 = rawContent.match(varRegex);
          if (!match2) {
            console.warn(`\u53D8\u91CF\u672A\u627E\u5230: ${variableName}`);
            return null;
          }
          try {
            const value = match2[1].trim();
            if (value.startsWith("{")) {
              const objectRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*(\\{[^}]*\\})`);
              const matchAgain = rawContent.match(objectRegex);
              if (matchAgain) {
                return JSON.parse(
                  matchAgain[1].replace(/([{,]\s*|\{\s*)([^\s":,{}]+)(?=\s*:)/g, '$1"$2"').replace(/:(\s*)\.(\d+)/g, ":$10.$2")
                );
              }
            }
            return JSON.parse(value.replace(/^\.(\d+)/, "0.$1"));
          } catch {
            return match2[1].trim();
          }
        };
        targetKeys.forEach((key) => {
          const keyMatch = rawContent.match(
            new RegExp(`\\b${key}\\s*:\\s*([\\w$]+)`, "m")
          );
          if (keyMatch) {
            const varName = keyMatch[1];
            data[key] = extractValue(varName);
            if (key === "SALES" && data[key]) {
              delete data[key]["B"];
              delete data[key]["r"];
            }
          } else {
            console.warn(`${key} \u672A\u627E\u5230`);
          }
        });
        const buildingsSalaryModifier = extractSalaryModifiers(rawContent);
        const extractJSONData = (str2) => {
          const regex = /(\d+):\s*JSON\.parse\((['"])(.*?)\2\)/g;
          const retailInfo2 = {};
          for (const match2 of str2.matchAll(regex)) {
            const index = match2[1];
            const jsonData = match2[3];
            try {
              const parsedData = JSON.parse(jsonData);
              retailInfo2[index] = parsedData;
            } catch (error) {
              console.error("JSON \u89E3\u6790\u9519\u8BEF\uFF1A", error, "\u6570\u636E\uFF1A", jsonData);
            }
          }
          return retailInfo2;
        };
        const retailInfo = extractJSONData(rawContent);
        const extractMntFromRaw = (str) => {
          const assignPattern = /(\w+)\s*=\s*{/g;
          let match;
          while ((match = assignPattern.exec(rawContent)) !== null) {
            const startIndex = match.index + match[0].indexOf("{");
            let braceCount = 1;
            let endIndex = startIndex + 1;
            while (braceCount > 0 && endIndex < rawContent.length) {
              const char = rawContent[endIndex];
              if (char === "{") braceCount++;
              else if (char === "}") braceCount--;
              endIndex++;
            }
            if (braceCount === 0) {
              const objectString = rawContent.slice(startIndex, endIndex);
              try {
                const obj = eval("(" + objectString + ")");
                if (obj[1] && obj[1].dbLetter !== void 0 && obj[150] && obj[150].producedFrom && obj[150].image?.includes("tree.png")) {
                  return obj;
                }
              } catch (e) {
              }
            }
          }
          return null;
        };
        const constantsResources = JSON.parse(JSON.stringify(extractMntFromRaw(rawContent)));
        return {
          data,
          buildingsSalaryModifier,
          retailInfo,
          constantsResources,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
      } catch (error) {
        console.error("\u521D\u59CB\u5316\u5931\u8D25:", error);
        throw error;
      }
    };
    return {
      initialize: init,
      getData: () => _processedData
    };
  })();

  // src/features/incomingContractsHandler.js
  registerExportInfo({
    name: "\u5408\u540C\u9AD8\u4EF7\u63D0\u9192\u8BBE\u7F6E",
    scope: "global",
    keys: ["SC_Contract_HighPrice_Settings"]
  });
  var { SCXXCS: SCXXCS2, PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL2, RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT2 } = state;
  var incomingContractsHandler2 = (function() {
    let cardIdCounter = 0;
    const pendingCards = /* @__PURE__ */ new Map();
    const ACCEPT_CONTRACT_SELECTOR = [
      'a[aria-label="\u63A5\u53D7\u5408\u540C"]',
      'a[aria-label="Sign contract"]',
      'a[aria-label="\u63A5\u53D7\u5408\u7D04"]',
      "a.css-14hcbmv"
    ].join(", ");
    let processDebounceTimer = null;
    let activeObserver = null;
    let checkPageTimer = null;
    const workerCode = `
        self.onmessage = function(e) {
            const { orders, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

            const Ul = (overhead, skillCOO) => {
                const r = overhead || 1;
                return r - (r - 1) * skillCOO / 100;
            };
            const wv = (e, t, r) => {
                return r === null ? lwe[e][t] : lwe[e][t].quality[r];
            };
            const Upt = (e, t, r, n) => t + (e + n) / r;
            const Hpt = (e, t, r, n, a) => {
                const o = (n + e) / ((t - a) * (t - a));
                return e - (r - t) * (r - t) * o;
            };
            const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
            const Bpt = (e, t, r, n, a, o) => {
                const g = RETAIL_ADJUSTMENT[e] ?? 1;
                const s = Math.min(Math.max(2 - n, 0), 2),
                      l = Math.max(0.9, s / 2 + 0.5),
                      c = r / 12;
                const d = PROFIT_PER_BUILDING_LEVEL *
                    (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                    g *
                    (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                    (t.modeledStoreWages ?? 0) * SCXXCS;
                const h = t.modeledUnitsSoldAnHour * l;
                const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
                const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
                return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
            };
            const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                if (u <= 0) return NaN;
                const d = u / acc / size;
                let p = d - d * salesModifier / 100;
                return weather && (p /= weather.sellingSpeedMultiplier), p
            };

            const results = [];
            const size = 1;

            for (const order of orders) {
                const { cardId, price, quantity, quality, resourceId, ctx } = order;

                let currentPrice = price,
                    maxProfit = -Infinity;

                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, ctx.forceQuality ?? null);
                    const w = zL(
                        ctx.buildingKind,
                        modeledData,
                        quantity,
                        ctx.v,
                        currentPrice,
                        ctx.forceQuality === void 0 ? quality : 0,
                        ctx.saturation,
                        SRC.acceleration,
                        size,
                        ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;

                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }

                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }

                results.push({ cardId, maxProfit });
            }

            self.postMessage(results);
        };
        `;
    const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
    profitWorker.onmessage = function(e) {
      const results = e.data;
      if (!Array.isArray(results)) return;
      for (const item of results) {
        const { cardId, maxProfit } = item;
        const card = pendingCards.get(cardId);
        if (!card) continue;
        pendingCards.delete(cardId);
        injectOrUpdateProfit(card, maxProfit * 3600);
      }
    };
    const marketWorkerCode = `
        self.onmessage = function(e) {
            const { orders, shared, customBonuses, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
            if (!orders || !orders.length) { self.postMessage([]); return; }

            const lwe = shared.SCD.retailInfo;
            const zn = shared.SCD.data;
            const SRC = shared.SRC;

            const Ul = (overhead, skillCOO) => {
                const r = overhead || 1;
                return r - (r - 1) * skillCOO / 100;
            };
            const wv = (e, t, r) => {
                return r === null ? lwe[e][t] : lwe[e][t].quality[r];
            };
            const Upt = (e, t, r, n) => t + (e + n) / r;
            const Hpt = (e, t, r, n, a) => {
                const o = (n + e) / ((t - a) * (t - a));
                return e - (r - t) * (r - t) * o;
            };
            const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
            const Bpt = (e, t, r, n, a, o) => {
                const g = RETAIL_ADJUSTMENT[e] ?? 1;
                const s = Math.min(Math.max(2 - n, 0), 2),
                      l = Math.max(0.9, s / 2 + 0.5),
                      c = r / 12;
                const d = PROFIT_PER_BUILDING_LEVEL *
                    (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                    g *
                    (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                    (t.modeledStoreWages ?? 0) * SCXXCS;
                const h = t.modeledUnitsSoldAnHour * l;
                const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
                const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
                return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
            };
            const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                if (u <= 0) return NaN;
                const d = u / acc / size;
                let p = d - d * salesModifier / 100;
                return weather && (p /= weather.sellingSpeedMultiplier), p
            };

            function buildCtx(resourceId, quality, isCustomEnabled, adminBonus, saleBonus) {
                const resource = parseInt(resourceId);
                let skillCMO, skillCOO;
                if (isCustomEnabled && adminBonus != null && saleBonus != null) {
                    skillCMO = saleBonus;
                    skillCOO = adminBonus;
                } else {
                    skillCMO = SRC.saleBonus;
                    skillCOO = SRC.adminBonus;
                }
                const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
                const buildingKind = Object.entries(zn.SALES).find(([, ids]) =>
                    ids.includes(resource)
                )?.[0];
                const salaryModifier = shared.SCD.buildingsSalaryModifier?.[buildingKind];
                const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
                let saturation;
                if (resource === 150) {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m150 = list.find(item => item.dbLetter === 150 && item.quality === quality);
                    saturation = m150?.saturation;
                } else {
                    const list = SRC.ResourcesRetailInfo || [];
                    const m = list.find(item => item.dbLetter === resource);
                    saturation = m?.saturation;
                }
                const resourceDetail = shared.SCD.constantsResources?.[resource];
                const weather = (resourceDetail && resourceDetail.retailSeason === 'Summer')
                    ? SRC.sellingSpeedMultiplier : undefined;
                const forceQuality = (resource === 150) ? quality : undefined;
                const v = salesModifierWithRecreationBonus + skillCMO;
                const b = Ul(SRC.administration, skillCOO);
                return {
                    economyState: SRC.economyState, buildingKind, wages,
                    saturation, weather, forceQuality, v, b
                };
            }

            // \u5BF9\u5355\u4E2A\u4EF7\u683C\u8DD1\u5B8C\u6574\u552E\u4EF7\u5BFB\u4F18\uFF0C\u8FD4\u56DE\u6BCF\u5C0F\u65F6\u5229\u6DA6\uFF08null \u8868\u793A\u65E0\u6CD5\u8BA1\u7B97\uFF09
            function calcSingle(price, quantity, quality, resourceId, ctx) {
                const resource = parseInt(resourceId);
                const forceQ = (resource === 150) ? quality : undefined;
                const size = 1;
                let currentPrice = price;
                let maxProfit = -Infinity;
                while (currentPrice > 0) {
                    const modeledData = wv(ctx.economyState, resourceId, forceQ ?? null);
                    const w = zL(
                        ctx.buildingKind, modeledData, quantity, ctx.v,
                        currentPrice,
                        forceQ === void 0 ? quality : 0,
                        ctx.saturation, SRC.acceleration, size, ctx.weather
                    );
                    const revenue = currentPrice * quantity;
                    const wagesTotal = Math.ceil(w * ctx.wages * SRC.acceleration * ctx.b / 3600);
                    const secondsToFinish = w;
                    const profit = (!secondsToFinish || secondsToFinish <= 0)
                        ? NaN
                        : (revenue - price * quantity - wagesTotal) / secondsToFinish;
                    if (!secondsToFinish || secondsToFinish <= 0) break;
                    if (profit > maxProfit) {
                        maxProfit = profit;
                    }
                    if (currentPrice < 8) {
                        currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                    } else if (currentPrice < 2001) {
                        currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                    } else {
                        currentPrice = Math.round(currentPrice + 1);
                    }
                }
                return maxProfit > -Infinity ? maxProfit * 3600 : null;
            }

            const results = [];
            for (const order of orders) {
                const { cardId, marketData, targetQuality, quantity, resourceId } = order;
                if (!marketData || !marketData.length) {
                    results.push({ cardId, maxProfit: null, bestPrice: null, bestQuality: null });
                    continue;
                }

                const cb = customBonuses || {};
                const ctx = buildCtx(resourceId, targetQuality,
                    cb.isCustomEnabled === true, cb.adminBonus, cb.saleBonus);

                const resource = parseInt(resourceId);
                const exactOnly = (resource === 150);

                // \u6309\u54C1\u8D28\u5206\u7EC4\uFF0C\u6BCF\u7EC4 {price, qty} \u5347\u5E8F\uFF08\u7528\u5E02\u573A\u6302\u5355\u81EA\u8EAB\u6570\u91CF\u8BA1\u7B97\uFF09
                const qualityGroups = new Map();
                for (const entry of marketData) {
                    const p = parseFloat(entry.price);
                    const q = entry.quality;
                    const qty = parseFloat(entry.quantity) || 1;
                    if (p <= 0) continue;
                    if (exactOnly && q !== targetQuality) continue;
                    if (!qualityGroups.has(q)) qualityGroups.set(q, []);
                    qualityGroups.get(q).push({ price: p, qty });
                }
                for (const entries of qualityGroups.values()) {
                    entries.sort((a, b) => a.price - b.price);
                }

                let bestProfit = -Infinity;
                let bestPrice = null;
                let bestQuality = null;

                for (const [quality, entries] of qualityGroups) {
                    // \u6700\u4F4E\u4EF7\u5148\u7B97 \u2014 \u8D1F\u5229\u6DA6\u5219\u8DF3\u8FC7\u6574\u4E2A\u54C1\u8D28
                    const cheapestProfit = calcSingle(entries[0].price, entries[0].qty, quality, resourceId, ctx);
                    if (cheapestProfit === null || cheapestProfit < 0) continue;
                    if (cheapestProfit > bestProfit) {
                        bestProfit = cheapestProfit;
                        bestPrice = entries[0].price;
                        bestQuality = quality;
                    }
                    // \u5176\u4F59\u4EF7\u683C\u9010\u4E2A\u4E25\u683C\u8BA1\u7B97
                    for (let i = 1; i < entries.length; i++) {
                        const { price: p, qty } = entries[i];
                        const entryProfit = calcSingle(p, qty, quality, resourceId, ctx);
                        if (entryProfit === null || entryProfit < 0) break;
                        if (entryProfit > bestProfit) {
                            bestProfit = entryProfit;
                            bestPrice = p;
                            bestQuality = quality;
                        }
                    }
                }

                results.push({
                    cardId,
                    maxProfit: bestProfit > -Infinity ? bestProfit : null,
                    bestPrice: bestPrice,
                    bestQuality: bestQuality
                });
            }

            self.postMessage(results);
        };
        `;
    const marketProfitWorker = new Worker(URL.createObjectURL(new Blob([marketWorkerCode], { type: "application/javascript" })));
    let marketCardIdCounter = 1e6;
    const pendingMarketCards = /* @__PURE__ */ new Map();
    marketProfitWorker.onmessage = function(e) {
      const results = e.data;
      if (!Array.isArray(results)) return;
      for (const item of results) {
        const { cardId, maxProfit, bestPrice, bestQuality } = item;
        const entry = pendingMarketCards.get(cardId);
        if (!entry) continue;
        pendingMarketCards.delete(cardId);
        const { card, mpPercent, mpValue, mpNotes } = entry;
        card.__marketMaxProfit = maxProfit;
        card.__marketMaxPrice = bestPrice;
        card.__marketMaxQuality = bestQuality;
        updateCardMpDisplay(card, mpPercent, mpValue, mpNotes);
      }
    };
    function buildOrderContext(resourceId, quality, SCD, SRC, isCustomEnabled, SSB) {
      const resource = parseInt(resourceId);
      const zn = SCD.data;
      const economyState = SRC.economyState;
      let skillCMO, skillCOO;
      if (isCustomEnabled && SSB) {
        skillCMO = SSB.saleBonus;
        skillCOO = SSB.adminBonus;
      } else {
        skillCMO = SRC.saleBonus;
        skillCOO = SRC.adminBonus;
      }
      const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
      const buildingKind = Object.entries(zn.SALES).find(
        ([, ids]) => ids.includes(resource)
      )?.[0];
      const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
      const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
      const list = SRC.ResourcesRetailInfo || [];
      let saturation;
      if (resource === 150) {
        const m150 = list.find((item) => item.dbLetter === 150 && item.quality === quality);
        saturation = m150?.saturation;
      } else {
        const m = list.find((item) => item.dbLetter === resource);
        saturation = m?.saturation;
      }
      const resourceDetail = SCD.constantsResources?.[resource];
      const weather = resourceDetail && resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0;
      const forceQuality = resource === 150 ? quality : void 0;
      const v = salesModifierWithRecreationBonus + skillCMO;
      const b = (() => {
        const r = SRC.administration || 1;
        return r - (r - 1) * skillCOO / 100;
      })();
      return {
        economyState,
        buildingKind,
        wages,
        saturation,
        weather,
        forceQuality,
        v,
        b
      };
    }
    function calcMpInfo(cardData, marketData, status) {
      const resourceId = parseInt(cardData.dbLetter);
      const targetQuality = cardData.quality !== null && cardData.quality !== void 0 ? cardData.quality : 0;
      if (status === "error") {
        return { mpPercent: null, mpValue: null, mpNotes: "MP\u8BF7\u6C42\u5931\u8D25", mpBestQuality: null };
      }
      const expiredNote = status === "fallback_expired" ? " (\u7F13\u5B58\u5DF2\u8FC7\u671F)" : "";
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
        return { mpPercent: null, mpValue: null, mpNotes: "\u5E02\u573A\u65E0\u5BF9\u5E94\u54C1\u8D28" + expiredNote, mpBestQuality: null };
      }
      const exactOnly = resourceId === 150;
      let bestPrice = Infinity;
      let bestQuality = null;
      if (exactOnly) {
        const sameQ = marketData.filter((o) => o.quality === targetQuality && o.price > 0);
        if (sameQ.length > 0) {
          bestPrice = Math.min(...sameQ.map((o) => parseFloat(o.price)));
          bestQuality = targetQuality;
        }
      } else {
        for (const order of marketData) {
          const p = parseFloat(order.price);
          if (p > 0 && order.quality >= targetQuality && p < bestPrice) {
            bestPrice = p;
            bestQuality = order.quality;
          }
        }
      }
      if (bestPrice !== Infinity && bestPrice > 0 && cardData.unitPrice > 0) {
        const mpPercent = (bestPrice - cardData.unitPrice) / bestPrice * 100;
        let mpNotes = bestQuality !== targetQuality ? `\u53C2\u8003Q${bestQuality}\u4EF7` : null;
        if (expiredNote) {
          mpNotes = mpNotes ? `${mpNotes}${expiredNote}` : "\u7F13\u5B58\u6570\u636E";
        }
        return { mpPercent, mpValue: bestPrice, mpNotes, mpBestQuality: bestQuality };
      }
      return { mpPercent: null, mpValue: null, mpNotes: "\u5E02\u573A\u65E0\u5BF9\u5E94\u54C1\u8D28" + expiredNote, mpBestQuality: null };
    }
    async function processAllCards(cards, forceReset = false) {
      if (!cards || cards.length === 0) return;
      const realmId = getRealmIdFromLink2();
      const constantsKey = "SimcompaniesConstantsData";
      const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
      if (!localStorage.getItem(constantsKey) || !localStorage.getItem(regionKey)) {
        try {
          const constData = await constantsData.initialize();
          Storage.save("constants", constData);
          const regionData = await RegionData.fetchFullRegionData();
          Storage.save("region", regionData);
        } catch (err) {
          console.error("[\u5408\u540C\u6279\u91CF] \u6570\u636E\u521D\u59CB\u5316\u5931\u8D25:", err);
          return;
        }
      }
      const SCD = JSON.parse(localStorage.getItem(constantsKey));
      const SRC = JSON.parse(localStorage.getItem(regionKey));
      if (!SCD || !SRC) return;
      const pageActionsConfig = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
      const isCustomEnabled = pageActionsConfig["executiveCustomToggle"] === true;
      let SSB = null;
      if (isCustomEnabled) {
        const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
        try {
          SSB = JSON.parse(localStorage.getItem(bonusKey));
        } catch (e) {
          SSB = null;
        }
      }
      const EXCLUDED_IDS2 = [91, 94, 95, 96, 97, 99];
      const cardInfos = [];
      const uniqueResourceIds = /* @__PURE__ */ new Set();
      for (const card of cards) {
        const data2 = parseContractCard(card);
        if (!data2 || !data2.dbLetter) continue;
        const currentSignature = `${data2.dbLetter}_${data2.quantity}_${data2.quality}_${data2.unitPrice}`;
        if (!forceReset && card.hasAttribute("data-found") && !card.hasAttribute("data-retry")) {
          if (card.__contractSignature === currentSignature) {
            const hasProfitUI = card.__profitDisplayEl && document.body.contains(card.__profitDisplayEl);
            const acceptBtn = card.querySelector(ACCEPT_CONTRACT_SELECTOR);
            const lostInterceptor = card.__wasHighPrice && acceptBtn && !acceptBtn.__hasHighPriceInterceptor;
            if (hasProfitUI && !lostInterceptor) {
              continue;
            }
          } else {
            const oldEl = card.__profitDisplayEl;
            if (oldEl && oldEl.parentNode) oldEl.remove();
            card.style.border = "";
            card.style.borderRadius = "";
            const acceptBtn = card.querySelector(ACCEPT_CONTRACT_SELECTOR);
            if (acceptBtn) delete acceptBtn.__hasHighPriceInterceptor;
          }
          card.removeAttribute("data-found");
          delete card.__profitDisplayEl;
          delete card.__wasHighPrice;
          delete card.__mpValue;
        }
        card.__contractSignature = currentSignature;
        const resourceId = parseInt(data2.dbLetter);
        card.setAttribute("data-found", "true");
        card.removeAttribute("data-retry");
        if (EXCLUDED_IDS2.includes(resourceId)) {
          checkAndApplyDoubleConfirm(card);
          continue;
        }
        const isRetail = Object.values(SCD.data.SALES).some((arr) => arr.includes(resourceId));
        if (isRetail) card.__mpPending = true;
        cardInfos.push({ card, data: data2, isRetail });
        uniqueResourceIds.add(data2.dbLetter);
      }
      if (cardInfos.length === 0) return;
      const retailOrders = [];
      for (const { card, data: data2, isRetail } of cardInfos) {
        if (isRetail) {
          const ctx = buildOrderContext(data2.dbLetter, data2.quality, SCD, SRC, isCustomEnabled, SSB);
          const cardId = cardIdCounter++;
          pendingCards.set(cardId, card);
          retailOrders.push({
            cardId,
            price: data2.unitPrice,
            quantity: data2.quantity,
            quality: data2.quality,
            resourceId: data2.dbLetter,
            ctx
          });
        }
      }
      if (retailOrders.length > 0) {
        profitWorker.postMessage({
          orders: retailOrders,
          shared: { SCD, SRC },
          SCXXCS: SCXXCS2,
          PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL2,
          RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT2
        });
      }
      for (const { card, isRetail } of cardInfos) {
        if (!isRetail) {
          card.__mpPending = true;
          injectMpPlaceholder(card);
        }
      }
      fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC);
    }
    async function fetchMpDataAndUpdate(cardInfos, realmId, SCD, SRC) {
      const uniqueIds = /* @__PURE__ */ new Set();
      for (const { data: data2 } of cardInfos) {
        if (data2.dbLetter) uniqueIds.add(data2.dbLetter);
      }
      if (uniqueIds.size === 0) return;
      const marketDataMap = {};
      const marketPromises = [...uniqueIds].map(async (rid) => {
        marketDataMap[rid] = await getMarketDataForResource(realmId, rid);
      });
      await Promise.all(marketPromises);
      const marketMaxProfitEnabled = (() => {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["marketMaxProfitToggle"] === true;
      })();
      pendingMarketCards.clear();
      const marketOrders = [];
      let customBonuses = null;
      if (marketMaxProfitEnabled) {
        const pageActionsConfig = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        const isCustomEnabled = pageActionsConfig["executiveCustomToggle"] === true;
        if (isCustomEnabled) {
          const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
          try {
            const SSB = JSON.parse(localStorage.getItem(bonusKey));
            if (SSB) {
              customBonuses = { isCustomEnabled: true, adminBonus: SSB.adminBonus, saleBonus: SSB.saleBonus };
            }
          } catch (e) {
          }
        }
        if (!customBonuses) {
          customBonuses = { isCustomEnabled: false, adminBonus: null, saleBonus: null };
        }
      }
      for (const { card, data: data2, isRetail } of cardInfos) {
        const marketResult = marketDataMap[data2.dbLetter] || { data: null, status: "error" };
        const mpInfo = calcMpInfo(data2, marketResult.data, marketResult.status);
        card.__resourceId = data2.dbLetter;
        card.__mpPercent = mpInfo.mpPercent;
        card.__mpValue = mpInfo.mpValue;
        card.__mpBestQuality = mpInfo.mpBestQuality;
        if (mpInfo.mpNotes) card.__mpNotes = mpInfo.mpNotes;
        card.__mpPending = false;
        if (marketMaxProfitEnabled && isRetail && marketResult.data && marketResult.data.length > 0) {
          const cid = marketCardIdCounter++;
          pendingMarketCards.set(cid, {
            card,
            mpPercent: mpInfo.mpPercent,
            mpValue: mpInfo.mpValue,
            mpNotes: mpInfo.mpNotes
          });
          marketOrders.push({
            cardId: cid,
            marketData: marketResult.data,
            targetQuality: data2.quality !== null && data2.quality !== void 0 ? data2.quality : 0,
            quantity: data2.quantity,
            resourceId: data2.dbLetter
          });
          card.__marketMaxProfit = null;
        } else {
          card.__marketMaxProfit = null;
        }
        updateCardMpDisplay(card, mpInfo.mpPercent, mpInfo.mpValue, mpInfo.mpNotes);
      }
      if (marketOrders.length > 0) {
        marketProfitWorker.postMessage({
          orders: marketOrders,
          shared: { SCD, SRC },
          customBonuses,
          SCXXCS: SCXXCS2,
          PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL2,
          RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT2
        });
      }
    }
    function init2() {
      cleanupAll();
      const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);
      checkPageTimer = setInterval(() => {
        if (!isOnIncomingPage()) {
          clearInterval(checkPageTimer);
          checkPageTimer = null;
          removeWarningNotice();
          cleanupAll();
          return;
        }
        const contractCards = document.querySelectorAll('div[tabindex="0"]');
        if (contractCards.length > 0) {
          clearInterval(checkPageTimer);
          checkPageTimer = null;
          insertWarningNotice();
          processAllCards([...contractCards]);
          startMutationObserver();
        } else {
          insertWarningNotice();
        }
      }, 500);
    }
    function cleanupAll() {
      if (activeObserver) {
        activeObserver.disconnect();
        activeObserver = null;
      }
      if (checkPageTimer) {
        clearInterval(checkPageTimer);
        checkPageTimer = null;
      }
      if (processDebounceTimer) {
        clearTimeout(processDebounceTimer);
        processDebounceTimer = null;
      }
      pendingCards.clear();
      removeWarningNotice();
    }
    function startMutationObserver() {
      const targetNode = document.body;
      if (!targetNode) return;
      const isOnIncomingPage = () => /^https:\/\/www\.simcompanies\.com(\/[a-z-]+)?\/headquarters\/warehouse\/incoming-contracts\/?$/.test(location.href);
      activeObserver = new MutationObserver((mutationsList) => {
        if (!isOnIncomingPage()) {
          cleanupAll();
          return;
        }
        const hasRelevantChanges = mutationsList.some((mutation) => {
          return mutation.type === "childList" && // 添加了新节点，且包含合同卡片
          (mutation.addedNodes.length > 0 && Array.from(mutation.addedNodes).some((node) => node.nodeType === 1 && (node.matches('div[tabindex="0"]') || node.querySelector('div[tabindex="0"]'))) || // 或者是已有卡片内部发生了变化（React 抹除 UI 时通常触发其内部节点的 childList 变化）
          mutation.target && mutation.target.nodeType === 1 && mutation.target.closest('div[tabindex="0"]'));
        });
        if (hasRelevantChanges) {
          clearTimeout(processDebounceTimer);
          processDebounceTimer = setTimeout(() => {
            if (!isOnIncomingPage()) {
              cleanupAll();
              return;
            }
            const contractCards = document.querySelectorAll('div[tabindex="0"]');
            processAllCards([...contractCards]);
          }, 150);
        }
      });
      activeObserver.observe(targetNode, { childList: true, subtree: true });
    }
    function getRealmIdFromLink2() {
      const link = document.querySelector('a[href*="/company/"]');
      if (link) {
        const match2 = link.href.match(/\/company\/(\d+)\//);
        return match2 ? parseInt(match2[1], 10) : null;
      }
      return null;
    }
    async function getMarketDataForResource(realmId, resourceId) {
      const key = `market_all_${realmId}_${resourceId}`;
      const raw = localStorage.getItem(key);
      let cachedData = null;
      let cachedValid = false;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const dataArray = Array.isArray(parsed) ? parsed : parsed.data;
          cachedData = dataArray;
          if (parsed.timestamp && Date.now() - parsed.timestamp < 6e4) {
            cachedValid = true;
          }
        } catch (e) {
        }
      }
      if (cachedValid && cachedData) {
        return { data: cachedData, status: "ok" };
      }
      try {
        const url = `https://www.simcompanies.com/api/v3/market/all/${realmId}/${resourceId}/`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        const json = await response.json();
        if (Array.isArray(json)) {
          localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data: json }));
          return { data: json, status: "ok" };
        }
      } catch (e) {
        if (cachedData) {
          return { data: cachedData, status: "fallback_expired" };
        }
      }
      return { data: null, status: "error" };
    }
    function refreshAllContractProfits() {
      const contractCards = document.querySelectorAll('div[tabindex="0"]');
      contractCards.forEach((card) => {
        const oldEl = card.__profitDisplayEl;
        if (oldEl && oldEl.parentNode) oldEl.remove();
        card.querySelectorAll("b").forEach((b) => {
          if (b.dataset?.scContract === "true" || b.textContent.includes("\u65F6\u5229\u6DA6") || b.textContent.includes("MP-") || b.textContent.includes("MP+") || b.textContent.includes("\u5E02\u573A\u6700\u5927\u65F6\u5229")) b.remove();
        });
        card.removeAttribute("data-found");
        delete card.__mpNotes;
        delete card.__mpValue;
        delete card.__mpBestQuality;
        delete card.__mpPending;
        delete card.__marketMaxProfit;
        delete card.__marketMaxPrice;
        delete card.__marketMaxQuality;
        delete card.__profitDisplayEl;
      });
      processAllCards([...contractCards], true);
    }
    function parseContractCard(card) {
      const result = {
        quantity: null,
        quality: null,
        unitPrice: null,
        totalPrice: null,
        imageSrc: null,
        resourcePath: null,
        dbLetter: null
      };
      const label = card.getAttribute("aria-label") || "";
      const regexEN = /^incoming contract,\s*([\d,]+).*?quality\s+(\d+),\s*at\s*\$([\d,.]+)\s+per unit,\s*total price\s*\$([\d,.]+)/i;
      const regexSC = /^来自.*?的入库合同，([\d,]+)单位的Q(\d+).*?，价格为\$([\d,.]+)每单位，总价\$([\d,.]+)/;
      const regexTC = /^來自.*?的入庫合同，([\d,]+)單位的Q(\d+).*?，價格為\$([\d,.]+)每單位，總價\$([\d,.]+)/;
      let match2;
      if (match2 = label.match(regexEN)) {
        result.quantity = parseInt(match2[1].replace(/,/g, ""));
        result.quality = parseInt(match2[2]);
        result.unitPrice = parseFloat(match2[3].replace(/,/g, ""));
        result.totalPrice = parseFloat(match2[4].replace(/,/g, ""));
      } else if (match2 = label.match(regexSC)) {
        result.quantity = parseInt(match2[1].replace(/,/g, ""));
        result.quality = parseInt(match2[2]);
        result.unitPrice = parseFloat(match2[3].replace(/,/g, ""));
        result.totalPrice = parseFloat(match2[4].replace(/,/g, ""));
      } else if (match2 = label.match(regexTC)) {
        result.quantity = parseInt(match2[1].replace(/,/g, ""));
        result.quality = parseInt(match2[2]);
        result.unitPrice = parseFloat(match2[3].replace(/,/g, ""));
        result.totalPrice = parseFloat(match2[4].replace(/,/g, ""));
      } else {
        console.warn("[\u5408\u540C\u5361\u7247] aria-label \u683C\u5F0F\u4E0D\u5339\u914D:", label);
      }
      const img = card.querySelector('img[src^="/static/images/resources/"]');
      if (img) {
        result.imageSrc = img.getAttribute("src");
        result.resourcePath = result.imageSrc.replace(/^\/static\//, "").replace(/\.[0-9a-f]{6,}\.(png|jpg|jpeg|gif|svg)$/, ".$1");
        const constants = JSON.parse(localStorage.getItem("SimcompaniesConstantsData") || "{}");
        const resources = Object.values(constants?.constantsResources || {});
        const matched = resources.find((r) => r.image === result.resourcePath);
        if (matched) result.dbLetter = matched.dbLetter;
      }
      return result;
    }
    function injectMpPlaceholder(card) {
      const infoDiv = Array.from(card.querySelectorAll("div")).find((div) => div.textContent?.includes("@") && div.querySelector("b"));
      const priceBox = infoDiv?.querySelector("b");
      if (!priceBox) return;
      if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE && priceBox.nextSibling.dataset?.scContract === "true") return;
      const dPh = DM();
      const el = document.createElement("b");
      el.dataset.scContract = "true";
      el.style.marginLeft = "8px";
      el.innerHTML = `<span class="sc-mp-part" style="color:${dPh ? "#aaa" : "#888"};white-space:nowrap;">MP\u8BA1\u7B97\u4E2D...</span>`;
      priceBox.parentNode.insertBefore(el, priceBox.nextSibling);
      card.__profitDisplayEl = el;
    }
    function ensureHighPriceWarning(card, displayEl) {
      if (card.__wasHighPrice === true && displayEl && !displayEl.querySelector(".sc-high-price-warning")) {
        const warningSpan = document.createElement("span");
        warningSpan.className = "sc-high-price-warning";
        warningSpan.style.cssText = "color:#ff4444; font-weight:bold; margin-left:8px; animation: sc-highprice-blink 1s infinite alternate;";
        warningSpan.textContent = "[\u26A0\uFE0F\u9AD8\u4EF7\u5408\u540C]";
        displayEl.appendChild(warningSpan);
        if (!document.getElementById("sc-highprice-blink-style")) {
          const style = document.createElement("style");
          style.id = "sc-highprice-blink-style";
          style.textContent = `
                        @keyframes sc-highprice-blink {
                            0% { opacity: 0.3; }
                            100% { opacity: 1; }
                        }
                    `;
          document.head.appendChild(style);
        }
      }
    }
    function injectOrUpdateProfit(card, profitValue) {
      card.__contractProfit = profitValue;
      const infoDiv = Array.from(card.querySelectorAll("div")).find((div) => div.textContent?.includes("@") && div.querySelector("b"));
      const priceBox = infoDiv?.querySelector("b");
      if (!priceBox) return;
      const existingEl = card.__profitDisplayEl || (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE && priceBox.nextSibling.dataset?.scContract === "true" ? priceBox.nextSibling : null);
      if (existingEl) {
        const profitSpan = existingEl.querySelector(".sc-profit-part");
        if (profitSpan && profitValue !== null && profitValue !== void 0 && isFinite(profitValue)) {
          if (profitValue < 0) {
            profitSpan.innerHTML = `<span style="color:#ff1744;font-weight:bold;">\u26A0\uFE0F\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}</span>`;
          } else {
            profitSpan.innerHTML = `\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}`;
          }
          return;
        }
        existingEl.remove();
        if (card.__profitDisplayEl === existingEl) card.__profitDisplayEl = null;
      }
      const profitDisplay = document.createElement("b");
      profitDisplay.dataset.scContract = "true";
      profitDisplay.style.marginLeft = "8px";
      let profitHtml = "";
      if (profitValue !== null && profitValue !== void 0 && isFinite(profitValue)) {
        if (profitValue < 0) {
          profitHtml = `<span class="sc-profit-part" style="color:#ff1744;font-weight:bold;">\u26A0\uFE0F\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}</span>`;
        } else {
          profitHtml = `<span class="sc-profit-part">\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}</span>`;
        }
      }
      const dPh = DM();
      let mpHtml = "";
      const mmpEnabled = (() => {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["marketMaxProfitToggle"] === true;
      })();
      if (card.__mpPending) {
        mpHtml = `<span class="sc-mp-part" style="color:${dPh ? "#aaa" : "#888"};white-space:nowrap;"> | MP\u8BA1\u7B97\u4E2D...</span>`;
      } else {
        let mpPartHtml = "";
        if (card.__mpPercent !== void 0 && card.__mpPercent !== null && isFinite(card.__mpPercent)) {
          const prefix = card.__mpPercent < 0 ? "MP+" : "MP-";
          const mpColor = card.__mpPercent < 0 ? "color:#ef5350;" : "";
          mpPartHtml = ` | <span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(card.__mpPercent).toFixed(2)}%`;
          if (mmpEnabled && card.__mpValue != null && isFinite(card.__mpValue)) {
            mpPartHtml += ` ($${card.__mpValue.toFixed(2)})`;
          }
          if (card.__mpNotes) {
            mpPartHtml += `<span style="color:${dPh ? "#aaa" : "#777"};font-size:0.85em;"> ${card.__mpNotes}</span>`;
          }
          mpPartHtml += `</span>`;
        }
        let mmpPartHtml = "";
        if (mmpEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
          const mmp = card.__marketMaxProfit;
          const mmpColor = mmp < 0 ? "color:#ff1744;" : "color:#4caf50;";
          let mmpNote = "";
          if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
            mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
          }
          mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">\u5E02\u573A\u6700\u5927\u65F6\u5229:${mmp.toFixed(2)}`;
          if (mmpNote) {
            mmpPartHtml += `<span style="color:${dPh ? "#aaa" : "#777"};font-size:0.85em;">${mmpNote}</span>`;
          }
          mmpPartHtml += `</span>`;
          if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
            const lnkColor = "#ff9800";
            mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:${lnkColor};text-decoration:none;">\u{1F4C8}\u4EA4\u6613\u6240</a>`;
          }
        }
        mpHtml = `<span class="sc-mp-part">${mpPartHtml}${mmpPartHtml}</span>`;
      }
      profitDisplay.innerHTML = profitHtml + mpHtml;
      priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
      card.__profitDisplayEl = profitDisplay;
      ensureHighPriceWarning(card, profitDisplay);
    }
    function updateCardMpDisplay(card, mpPercent, mpValue, mpNotes) {
      const displayEl = card.__profitDisplayEl;
      if (!displayEl) {
        injectHourlyProfitLegacy(card, null, mpPercent, mpValue, mpNotes);
        checkAndApplyDoubleConfirm(card);
        return;
      }
      const marketMaxProfitEnabled = (() => {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["marketMaxProfitToggle"] === true;
      })();
      const mpSpan = displayEl.querySelector(".sc-mp-part");
      const hasProfit = !!displayEl.querySelector(".sc-profit-part");
      const sep = hasProfit ? " | " : "";
      const dMp = DM();
      let mpPartHtml = "";
      if (mpPercent !== null && mpPercent !== void 0 && isFinite(mpPercent)) {
        const prefix = mpPercent < 0 ? "MP+" : "MP-";
        const mpColor = mpPercent < 0 ? "color:#ef5350;" : "";
        mpPartHtml = `${sep}<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
        if (marketMaxProfitEnabled && mpValue != null && isFinite(mpValue)) {
          mpPartHtml += ` ($${mpValue.toFixed(2)})`;
        }
        if (mpNotes) {
          mpPartHtml += `<span style="color:${dMp ? "#aaa" : "#777"};font-size:0.85em;"> ${mpNotes}</span>`;
        }
        mpPartHtml += `</span>`;
      } else {
        if (mpNotes) {
          mpPartHtml = `${sep}<span style="color:${dMp ? "#aaa" : "#777"};">${mpNotes}</span>`;
        }
      }
      let mmpPartHtml = "";
      if (marketMaxProfitEnabled && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
        const mmp = card.__marketMaxProfit;
        const mmpColor = mmp < 0 ? "color:#ff1744;" : "color:#4caf50;";
        let mmpNote = "";
        if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
          mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
        }
        mmpPartHtml = ` | <span style="${mmpColor}white-space:nowrap;">\u5E02\u573A\u6700\u5927\u65F6\u5229:${mmp.toFixed(2)}`;
        if (mmpNote) {
          mmpPartHtml += `<span style="color:${dMp ? "#aaa" : "#777"};font-size:0.85em;">${mmpNote}</span>`;
        }
        mmpPartHtml += `</span>`;
        if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
          mmpPartHtml += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">\u{1F4C8}\u4EA4\u6613\u6240</a>`;
        }
      }
      const mpHtml = mpPartHtml + mmpPartHtml;
      if (mpSpan) {
        mpSpan.innerHTML = mpHtml;
        mpSpan.style.color = "";
      } else {
        const currentHtml = displayEl.innerHTML;
        displayEl.innerHTML = currentHtml + mpHtml;
      }
      checkAndApplyDoubleConfirm(card);
    }
    function injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes) {
      const infoDiv = Array.from(card.querySelectorAll("div")).find((div) => div.textContent?.includes("@") && div.querySelector("b"));
      const priceBox = infoDiv?.querySelector("b");
      if (!priceBox) return;
      if (priceBox.nextSibling?.nodeType === Node.ELEMENT_NODE && priceBox.nextSibling.dataset?.scContract === "true") {
        return;
      }
      const profitDisplay = document.createElement("b");
      profitDisplay.dataset.scContract = "true";
      profitDisplay.style.marginLeft = "8px";
      let displayText = "";
      if (profitValue !== null && profitValue !== void 0 && isFinite(profitValue)) {
        if (profitValue < 0) {
          displayText = `<span style="color:#ff1744;font-weight:bold;">\u26A0\uFE0F\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}</span>`;
        } else {
          displayText = `\u65F6\u5229\u6DA6:${profitValue.toFixed(2)}`;
        }
      }
      const dMpNote = DM();
      const mmpEnabledLegacy = (() => {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["marketMaxProfitToggle"] === true;
      })();
      if (mpPercent !== null && mpPercent !== void 0 && isFinite(mpPercent)) {
        if (displayText) displayText += " |";
        const prefix = mpPercent < 0 ? "MP+" : "MP-";
        const mpColor = mpPercent < 0 ? "color:#ef5350;" : "";
        let mpBaseText = `<span style="${mpColor}white-space:nowrap;">${prefix}${Math.abs(mpPercent).toFixed(2)}%`;
        if (mmpEnabledLegacy && mpValue != null && isFinite(mpValue)) {
          mpBaseText += ` ($${mpValue.toFixed(2)})`;
        }
        if (mpNotes) {
          mpBaseText += `<span style="color:${dMpNote ? "#aaa" : "#777"};font-size:0.85em;"> ${mpNotes}</span>`;
        }
        mpBaseText += `</span>`;
        displayText += mpBaseText;
      } else if (mpNotes) {
        if (displayText) displayText += " |";
        displayText += `<span style="color:${dMpNote ? "#aaa" : "#777"};">${mpNotes}</span>`;
      }
      if (mmpEnabledLegacy && card.__marketMaxProfit != null && isFinite(card.__marketMaxProfit)) {
        if (displayText) displayText += " |";
        const mmp = card.__marketMaxProfit;
        const mmpColor = mmp < 0 ? "color:#ff1744;" : "color:#4caf50;";
        let mmpNote = "";
        if (card.__marketMaxQuality != null && card.__marketMaxPrice != null) {
          mmpNote = ` (Q${card.__marketMaxQuality} $${card.__marketMaxPrice.toFixed(2)})`;
        }
        let mmpText = `<span style="${mmpColor}white-space:nowrap;">\u5E02\u573A\u6700\u5927\u65F6\u5229:${mmp.toFixed(2)}`;
        if (mmpNote) {
          mmpText += `<span style="color:${dMpNote ? "#aaa" : "#777"};font-size:0.85em;">${mmpNote}</span>`;
        }
        mmpText += `</span>`;
        if (card.__contractProfit != null && mmp > card.__contractProfit && card.__resourceId != null) {
          mmpText += ` <a href="https://www.simcompanies.com/zh-cn/market/resource/${card.__resourceId}/" target="_blank" style="font-size:0.85em;color:#ff9800;text-decoration:none;">\u{1F4C8}\u4EA4\u6613\u6240</a>`;
        }
        displayText += mmpText;
      }
      if (!displayText) return;
      profitDisplay.innerHTML = displayText;
      priceBox.parentNode.insertBefore(profitDisplay, priceBox.nextSibling);
      card.__profitDisplayEl = profitDisplay;
      ensureHighPriceWarning(card, profitDisplay);
    }
    function injectHourlyProfit(card, profitValue, mpPercent) {
      const mpValue = card.__mpValue || null;
      const mpNotes = card.__mpNotes || null;
      injectHourlyProfitLegacy(card, profitValue, mpPercent, mpValue, mpNotes);
    }
    function getReactFiberFromElement(el) {
      const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
      return key ? el[key] : null;
    }
    function getHostNodeFromFiber(fiber) {
      const queue = [fiber];
      while (queue.length) {
        const node = queue.pop();
        if (!node) continue;
        if (node.stateNode instanceof Element) return node.stateNode;
        if (node.sibling) queue.push(node.sibling);
        if (node.child) queue.push(node.child);
      }
      return null;
    }
    function getIncomingContractsRoot() {
      const page = document.getElementById("page");
      if (!page) return null;
      for (const el of page.querySelectorAll("div")) {
        const fiber = getReactFiberFromElement(el);
        if (!fiber) continue;
        let node = fiber;
        while (node) {
          const props = node.memoizedProps;
          if (props && props.incoming === true && Object.prototype.hasOwnProperty.call(props, "currentContracts")) {
            return getHostNodeFromFiber(node);
          }
          node = node.return;
        }
      }
      return null;
    }
    function createWarningNotice() {
      const isNarrow8 = window.innerWidth <= 576;
      const d8 = DM();
      const tip = document.createElement("div");
      tip.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: ${isNarrow8 ? "6px 8px" : "8px"};
                color: ${d8 ? "#aaa" : "#777"};
                font-size: ${isNarrow8 ? "11px" : "13px"};
                width: 100%;
            `;
      tip.dataset.warningText = "true";
      const textSpan = document.createElement("span");
      textSpan.textContent = "\u81EA\u52A8\u66F4\u65B0\u6570\u636E\u6709\u5EF6\u8FDF\uFF0C\u5DE6\u4E0B\u53EF\u624B\u52A8\u66F4\u65B0";
      textSpan.style.cssText = `
                white-space: ${isNarrow8 ? "normal" : "nowrap"};
                flex: ${isNarrow8 ? "1 1 100%" : "0 0 auto"};
            `;
      tip.appendChild(textSpan);
      const btnGroup = document.createElement("div");
      btnGroup.style.cssText = `
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: ${isNarrow8 ? "4px 6px" : "6px"};
                flex: 1 1 auto;
            `;
      const toggle = createGlobalCustomToggle(
        "executiveCustomToggle",
        "\u81EA\u5B9A\u4E49",
        { buttonClass: "btn btn-primary" },
        (isEnabled) => {
          refreshAllContractProfits();
        }
      );
      toggle.wrapper.style.marginLeft = "0";
      btnGroup.appendChild(toggle.wrapper);
      const customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.textContent = "\u81EA\u5B9A\u4E49\u9AD8\u7BA1\u6570\u636E";
      customBtn.style.cssText = `
                padding: 4px 10px; background: #2196f3;
                color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                font-weight: bold; white-space: nowrap; flex-shrink: 0;
            `;
      customBtn.onclick = () => executiveCustomButton.show();
      btnGroup.appendChild(customBtn);
      const marketToggle = createGlobalCustomToggle(
        "marketMaxProfitToggle",
        "\u663E\u793A\u66F4\u591A",
        {},
        () => {
          refreshAllContractProfits();
        }
      );
      marketToggle.wrapper.style.marginLeft = "0";
      btnGroup.appendChild(marketToggle.wrapper);
      const priceSetBtn = document.createElement("button");
      priceSetBtn.type = "button";
      priceSetBtn.textContent = "\u4E8C\u6B21\u786E\u8BA4\u8BBE\u7F6E";
      priceSetBtn.style.cssText = `
                padding: 4px 10px; background: #9c27b0;
                color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                font-weight: bold; white-space: nowrap; flex-shrink: 0;
            `;
      priceSetBtn.onclick = () => showContractPriceModal();
      btnGroup.appendChild(priceSetBtn);
      tip.appendChild(btnGroup);
      return tip;
    }
    function insertWarningNotice() {
      if (document.querySelector("[data-warning-text]")) return;
      const cards = document.querySelectorAll('div[tabindex="0"]');
      if (cards.length === 0) {
        const root = getIncomingContractsRoot();
        if (root) root.insertBefore(createWarningNotice(), root.firstChild);
        return;
      }
      cards.forEach((card) => {
        let parent = card.parentElement;
        if (!parent) return;
        let grandParent = parent.parentElement;
        if (!grandParent || grandParent.querySelector("[data-warning-text]")) return;
        const insertTarget = grandParent.firstElementChild;
        if (!insertTarget || insertTarget === parent) return;
        const tip = createWarningNotice();
        insertTarget.appendChild(tip);
      });
    }
    function removeWarningNotice() {
      const oldNotice = document.querySelector("[data-warning-text]");
      if (oldNotice) oldNotice.remove();
    }
    const EXCLUDED_IDS = [91, 94, 95, 96, 97, 99];
    function getParsedRules() {
      const settings = JSON.parse(localStorage.getItem("SC_Contract_HighPrice_Settings") || '{"global":"-0","individual":""}');
      const parsed = {
        global: null,
        individual: /* @__PURE__ */ new Map()
      };
      if (settings.global) {
        const gVal = settings.global.trim();
        if (gVal) {
          if (gVal.endsWith("%")) {
            parsed.global = { type: "percent", value: parseFloat(gVal.slice(0, -1)) };
          } else {
            parsed.global = { type: "delta", value: parseFloat(gVal) };
          }
        }
      }
      if (settings.individual) {
        const lines = settings.individual.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(/[，,]/);
          if (parts.length !== 3) continue;
          let itemId = null;
          const itemKey = parts[0].trim();
          if (/^\d+$/.test(itemKey)) {
            itemId = parseInt(itemKey);
          } else {
            for (const [id, name] of Object.entries(resourceIdNameMap)) {
              if (name === itemKey) {
                itemId = parseInt(id);
                break;
              }
            }
          }
          if (itemId === null) continue;
          const quality = parseInt(parts[1].trim());
          if (isNaN(quality)) continue;
          const ruleVal = parts[2].trim();
          let type = "absolute";
          let val = parseFloat(ruleVal);
          if (ruleVal.endsWith("%")) {
            type = "percent";
            val = parseFloat(ruleVal.slice(0, -1));
          } else if (ruleVal.startsWith("-")) {
            type = "delta";
            val = parseFloat(ruleVal);
          }
          parsed.individual.set(`${itemId}_${quality}`, { type, value: val });
        }
      }
      return parsed;
    }
    function isContractHighPrice(card) {
      const data2 = parseContractCard(card);
      if (!data2 || !data2.dbLetter) return false;
      const itemId = parseInt(data2.dbLetter);
      const quality = data2.quality !== null ? data2.quality : 0;
      const price = data2.unitPrice;
      const mpValue = card.__mpValue;
      const rules = getParsedRules();
      const indivKey = `${itemId}_${quality}`;
      if (rules.individual.has(indivKey)) {
        const rule = rules.individual.get(indivKey);
        if (rule.type === "absolute") {
          return price > rule.value;
        } else if (rule.type === "percent") {
          if (mpValue !== void 0 && mpValue !== null && isFinite(mpValue)) {
            const threshold = mpValue * (1 + rule.value / 100);
            return price > threshold;
          }
          return false;
        } else if (rule.type === "delta") {
          if (mpValue !== void 0 && mpValue !== null && isFinite(mpValue)) {
            const threshold = mpValue + rule.value;
            return price > threshold;
          }
          return false;
        }
      }
      if (EXCLUDED_IDS.includes(itemId)) return false;
      if (rules.global) {
        const rule = rules.global;
        if (rule.type === "percent") {
          if (mpValue !== void 0 && mpValue !== null && isFinite(mpValue)) {
            const threshold = mpValue * (1 + rule.value / 100);
            return price > threshold;
          }
        } else if (rule.type === "delta") {
          if (mpValue !== void 0 && mpValue !== null && isFinite(mpValue)) {
            const threshold = mpValue + rule.value;
            return price > threshold;
          }
        }
      }
      return false;
    }
    function resetAcceptBtn(btn) {
      btn.dataset.confirmed = "false";
      const span = btn.querySelector("span");
      if (span && btn.__originalText) {
        span.textContent = btn.__originalText;
      }
      if (btn.__originalBg !== void 0) {
        btn.style.backgroundColor = btn.__originalBg;
      } else {
        btn.style.backgroundColor = "";
      }
      btn.style.borderColor = "";
      clearTimeout(btn.__resetTimer);
    }
    function checkAndApplyDoubleConfirm(card) {
      const isHigh = isContractHighPrice(card);
      card.__wasHighPrice = isHigh;
      const acceptBtn = card.querySelector(ACCEPT_CONTRACT_SELECTOR);
      if (isHigh) {
        card.style.border = "2px dashed #ff4444";
        card.style.borderRadius = "8px";
        ensureHighPriceWarning(card, card.__profitDisplayEl);
        if (!acceptBtn) return;
        if (!acceptBtn.__hasHighPriceInterceptor) {
          acceptBtn.__hasHighPriceInterceptor = true;
          acceptBtn.dataset.confirmed = "false";
          acceptBtn.addEventListener("click", function(e) {
            if (!isContractHighPrice(card)) {
              return;
            }
            if (acceptBtn.dataset.confirmed !== "true") {
              e.stopPropagation();
              e.preventDefault();
              acceptBtn.dataset.confirmed = "true";
              const span = acceptBtn.querySelector("span");
              acceptBtn.__originalText = span ? span.textContent : acceptBtn.textContent || "\u63A5\u53D7";
              if (span) span.textContent = acceptBtn.__originalText + "?";
              acceptBtn.__originalBg = acceptBtn.style.backgroundColor;
              acceptBtn.style.backgroundColor = "#ff4444";
              acceptBtn.style.borderColor = "#ff4444";
              clearTimeout(acceptBtn.__resetTimer);
              acceptBtn.__resetTimer = setTimeout(() => {
                resetAcceptBtn(acceptBtn);
              }, 5e3);
            } else {
              setTimeout(() => {
                resetAcceptBtn(acceptBtn);
              }, 500);
            }
          }, true);
        }
      } else {
        card.style.border = "";
        card.style.borderRadius = "";
        const displayEl = card.__profitDisplayEl;
        if (displayEl) {
          const warningSpan = displayEl.querySelector(".sc-high-price-warning");
          if (warningSpan) warningSpan.remove();
        }
        if (acceptBtn && acceptBtn.__hasHighPriceInterceptor) {
          resetAcceptBtn(acceptBtn);
        }
      }
    }
    function showContractPriceModal() {
      if (document.getElementById("sc-contract-price-modal")) return;
      const modal = document.createElement("div");
      modal.id = "sc-contract-price-modal";
      modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.6); z-index: 22000;
                display: flex; justify-content: center; align-items: center;
            `;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
                background: var(--sc-bg); border: 1px solid var(--sc-border);
                border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                width: min(550px, 95vw); max-height: min(650px, 90vh);
                color: var(--sc-fg); font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;
            `;
      wrapper.innerHTML = `
                <div style="padding: 12px 20px; background: #9c27b0; color: white; display: flex; justify-content: space-between; align-items: center; user-select: none; font-weight: bold; font-size: 15px;">
                    <span>\u5408\u540C\u4E8C\u6B21\u786E\u8BA4\u8BBE\u7F6E</span>
                    <span id="sc-contract-price-close" style="cursor: pointer; font-size: 20px; font-weight: normal; line-height: 1;">&times;</span>
                </div>
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">\u5168\u5C40\u9AD8\u4EF7\u5224\u5B9A\u89C4\u5219</label>
                        <input id="sc-contract-global-val" type="text" placeholder="\u4F8B\u5982\uFF1A-1.8% \u6216 -0.5 (\u4E0D\u586B\u5219\u7981\u7528\u5168\u5C40)" style="width: 100%; padding: 8px 12px; border: 1px solid var(--sc-border); border-radius: 6px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; transition: border-color 0.2s;" />
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 4px; line-height: 1.4;">
                            * <b>-?%</b>\uFF1A\u5408\u540C\u4EF7\u683C\u9AD8\u4E8E <b>MP * (1 - ?%)</b> \u65F6\u9700\u8981\u4E8C\u7EA7\u786E\u8BA4\u3002<br>
                            * <b>-?</b>\uFF1A\u5408\u540C\u4EF7\u683C\u9AD8\u4E8E <b>MP - ?</b> \u65F6\u9700\u8981\u4E8C\u7EA7\u786E\u8BA4\u3002
                        </span>
                    </div>
                    <hr style="border: 0; border-top: 1px solid var(--sc-border2); margin: 5px 0;">
                    <div style="display: flex; flex-direction: column; flex-grow: 1;">
                        <label style="display: block; font-weight: bold; font-size: 13px; margin-bottom: 6px; color: var(--sc-fg2);">\u5355\u72EC\u7269\u54C1\u5224\u5B9A\u89C4\u5219</label>
                        <div style="display: flex; gap: 8px; font-size: 11px; font-weight: bold; color: var(--sc-fg3); margin-bottom: 5px; padding-right: 32px; box-sizing: border-box;">
                            <span style="flex: 2; padding-left: 2px;">\u7269\u54C1\u540D\u79F0\u6216ID</span>
                            <span style="flex: 1; text-align: center;">\u54C1\u8D28</span>
                            <span style="flex: 2; padding-left: 2px;">\u4EF7\u683C\u89C4\u5219 (-1.5% / -0.5 / 1.7)</span>
                        </div>
                        <div id="sc-contract-rules-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 5px; margin-bottom: 10px;">
                            <!-- \u52A8\u6001\u89C4\u5219\u884C -->
                        </div>
                        <button id="sc-contract-add-rule-row" type="button" style="align-self: flex-start; padding: 5px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background-color 0.2s;">+ \u6DFB\u52A0\u7269\u54C1\u89C4\u5219</button>
                        <span style="font-size: 11px; color: var(--sc-fg3); display: block; margin-top: 8px; line-height: 1.4;">
                            * \u652F\u6301\u76F4\u63A5\u5199\u7EDD\u5BF9\u4EF7\u683C\uFF08\u5982 1.7\uFF09\uFF0C\u6216\u504F\u79BB\u503C\uFF08-1.5% / -0.5\uFF09\u3002<br>
                            * \u822A\u7A7A\u822A\u5929\u7EC8\u7AEF\u4EA7\u54C1\u65E0MP\uFF0C\u4EC5\u80FD\u4F7F\u7528\u7EDD\u5BF9\u4EF7\u683C
                        </span>
                        <details id="sc-contract-ref-details" style="margin-top: 8px; border: 1px solid var(--sc-border2); border-radius: 6px; padding: 6px 10px; background: var(--sc-bg2); cursor: pointer; user-select: none;">
                            <summary style="font-size: 11px; font-weight: bold; color: var(--sc-fg2); outline: none;">\u67E5\u770B\u7269\u54C1\u540D\u79F0/ID\u5BF9\u7167\u53C2\u8003\u8868 (\u70B9\u51FB\u7269\u54C1\u53EF\u76F4\u63A5\u586B\u5165\u7A7A\u884C)</summary>
                            <div id="sc-contract-ref-tags" style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; max-height: 100px; overflow-y: auto; cursor: default;">
                                <!-- \u6807\u7B7E\u7531 JS \u52A8\u6001\u751F\u6210 -->
                            </div>
                        </details>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; border-top: 1px solid var(--sc-border2); padding-top: 15px;">
                        <button id="sc-contract-price-cancel" style="padding: 8px 16px; background: #607D8B; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">\u53D6\u6D88</button>
                        <button id="sc-contract-price-save" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: background-color 0.2s;">\u4FDD\u5B58</button>
                    </div>
                </div>
            `;
      modal.appendChild(wrapper);
      let datalist = document.getElementById("sc-contract-resource-options");
      if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "sc-contract-resource-options";
        datalist.innerHTML = Object.values(resourceIdNameMap).filter((name) => name && name !== "undefined").map((name) => `<option value="${name}"></option>`).join("");
        modal.appendChild(datalist);
      }
      document.body.appendChild(modal);
      const updateThemeVars = () => {
        const isDark = DM();
        modal.style.setProperty("--sc-bg", theme.bg);
        modal.style.setProperty("--sc-bg2", theme.bg2);
        modal.style.setProperty("--sc-fg", theme.fg);
        modal.style.setProperty("--sc-fg2", theme.fg2);
        modal.style.setProperty("--sc-fg3", theme.fg3);
        modal.style.setProperty("--sc-border", theme.border);
        modal.style.setProperty("--sc-border2", theme.border2);
        modal.style.setProperty("--sc-input-bg", theme.inputBg);
        modal.style.setProperty("--sc-input-fg", theme.inputFg);
      };
      updateThemeVars();
      const themeObserver = new MutationObserver(() => {
        updateThemeVars();
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
      const rulesListContainer = document.getElementById("sc-contract-rules-list");
      function addRuleRow(itemVal = "", qualVal = "", ruleVal = "") {
        const row = document.createElement("div");
        row.className = "sc-contract-rule-row";
        row.style.cssText = "display: flex; align-items: center; gap: 8px; width: 100%;";
        row.innerHTML = `
                    <input type="text" class="sc-rule-item" list="sc-contract-resource-options" value="${itemVal}" placeholder="\u5982\uFF1A\u82F9\u679C \u6216 3" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <input type="number" class="sc-rule-quality" value="${qualVal}" min="0" max="12" placeholder="0" style="flex: 1; min-width: 0; padding: 6px 5px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none; text-align: center;" />
                    <input type="text" class="sc-rule-value" value="${ruleVal}" placeholder="\u5982\uFF1A-1.5% \u6216 1.7" style="flex: 2; min-width: 0; padding: 6px 10px; border: 1px solid var(--sc-border); border-radius: 4px; background: var(--sc-input-bg); color: var(--sc-input-fg); font-size: 13px; box-sizing: border-box; outline: none;" />
                    <button type="button" class="sc-rule-delete" style="flex: 0 0 24px; height: 24px; padding: 0; background: #e53935; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
                `;
        row.querySelector(".sc-rule-delete").onclick = () => {
          row.remove();
        };
        rulesListContainer.appendChild(row);
      }
      const settings = JSON.parse(localStorage.getItem("SC_Contract_HighPrice_Settings") || '{"global":"-0","individual":""}');
      document.getElementById("sc-contract-global-val").value = settings.global || "";
      const lines = (settings.individual || "").split("\n");
      let hasRows = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/[，,]/);
        if (parts.length === 3) {
          addRuleRow(parts[0].trim(), parts[1].trim(), parts[2].trim());
          hasRows = true;
        }
      }
      if (!hasRows) {
        addRuleRow("", "", "");
      }
      document.getElementById("sc-contract-add-rule-row").onclick = (e) => {
        e.preventDefault();
        addRuleRow("", "", "");
      };
      const tagsContainer = document.getElementById("sc-contract-ref-tags");
      if (tagsContainer) {
        tagsContainer.innerHTML = "";
        const sortedItems = Object.entries(resourceIdNameMap).filter(([id, name]) => name && name !== "undefined").sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        for (const [id, name] of sortedItems) {
          const tag = document.createElement("span");
          tag.textContent = `${name}(${id})`;
          tag.title = `\u70B9\u51FB\u53EF\u76F4\u63A5\u586B\u5165\u8BE5\u7269\u54C1`;
          tag.style.cssText = `
                        display: inline-block; padding: 2px 6px; background: var(--sc-border2);
                        color: var(--sc-fg); font-size: 11px; border-radius: 4px; cursor: pointer;
                        transition: all 0.2s; border: 1px solid var(--sc-border);
                    `;
          tag.onmouseenter = () => {
            tag.style.background = "#9c27b0";
            tag.style.color = "#fff";
            tag.style.borderColor = "#9c27b0";
          };
          tag.onmouseleave = () => {
            tag.style.background = "var(--sc-border2)";
            tag.style.color = "var(--sc-fg)";
            tag.style.borderColor = "var(--sc-border)";
          };
          tag.onclick = (event) => {
            event.preventDefault();
            const rows = rulesListContainer.querySelectorAll(".sc-contract-rule-row");
            let targetInput = null;
            for (let i = rows.length - 1; i >= 0; i--) {
              const input = rows[i].querySelector(".sc-rule-item");
              if (input && !input.value.trim()) {
                targetInput = input;
                break;
              }
            }
            if (!targetInput) {
              addRuleRow(name, "", "");
              const newRows = rulesListContainer.querySelectorAll(".sc-contract-rule-row");
              targetInput = newRows[newRows.length - 1].querySelector(".sc-rule-item");
            } else {
              targetInput.value = name;
            }
            if (targetInput) {
              targetInput.focus();
              const origBorder = targetInput.style.borderColor;
              targetInput.style.borderColor = "#4CAF50";
              setTimeout(() => {
                targetInput.style.borderColor = origBorder;
              }, 500);
            }
          };
          tagsContainer.appendChild(tag);
        }
      }
      const closeBtn = document.getElementById("sc-contract-price-close");
      const cancelBtn = document.getElementById("sc-contract-price-cancel");
      const saveBtn = document.getElementById("sc-contract-price-save");
      const closeModal = () => {
        themeObserver.disconnect();
        modal.remove();
      };
      closeBtn.onclick = closeModal;
      cancelBtn.onclick = closeModal;
      saveBtn.onclick = (e) => {
        e.preventDefault();
        const globalInput = document.getElementById("sc-contract-global-val").value.trim();
        if (globalInput) {
          if (!/^-\d+(?:\.\d+)?%?$/.test(globalInput)) {
            showToast("\u5168\u5C40\u8BBE\u7F6E\u683C\u5F0F\u4E0D\u6B63\u786E\u3002\u8BF7\u8F93\u5165\u7C7B\u4F3C -1.8% \u6216 -0.5 \u7684\u504F\u79BB\u683C\u5F0F", "error");
            return;
          }
        }
        const rows = rulesListContainer.querySelectorAll(".sc-contract-rule-row");
        const indivRules = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const itemInput = row.querySelector(".sc-rule-item").value.trim();
          const qualInput = row.querySelector(".sc-rule-quality").value.trim();
          const valInput = row.querySelector(".sc-rule-value").value.trim();
          if (!itemInput && !valInput) continue;
          if (!itemInput || qualInput === "" || !valInput) {
            showToast(`\u7B2C ${i + 1} \u884C\u89C4\u5219\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u586B\u5199\u6240\u6709\u5217\u6216\u5C06\u5176\u5220\u9664`, "error");
            return;
          }
          let itemId = null;
          if (/^\d+$/.test(itemInput)) {
            itemId = parseInt(itemInput);
          } else {
            for (const [id, name] of Object.entries(resourceIdNameMap)) {
              if (name === itemInput) {
                itemId = parseInt(id);
                break;
              }
            }
          }
          if (itemId === null) {
            showToast(`\u7B2C ${i + 1} \u884C\u7684\u7269\u54C1\u540D\u79F0\u6216ID '${itemInput}' \u65E0\u6CD5\u8BC6\u522B\uFF0C\u8BF7\u4F7F\u7528\u7269\u54C1ID\u6216\u6B63\u786E\u7684\u7269\u54C1\u540D\u79F0`, "error");
            return;
          }
          const quality = parseInt(qualInput);
          if (isNaN(quality) || quality < 0) {
            showToast(`\u7B2C ${i + 1} \u884C\u7684\u54C1\u8D28 '${qualInput}' \u5FC5\u987B\u662F\u6B63\u6574\u6570`, "error");
            return;
          }
          const isAbsolute = /^\d+(?:\.\d+)?$/.test(valInput);
          const isOffset = /^-\d+(?:\.\d+)?%?$/.test(valInput);
          if (!isAbsolute && !isOffset) {
            showToast(`\u7B2C ${i + 1} \u884C\u7684\u89C4\u5219 '${valInput}' \u683C\u5F0F\u4E0D\u6B63\u786E\u3002\u8BF7\u8F93\u5165\u7EDD\u5BF9\u4EF7\u683C\uFF08\u5982 1.7\uFF09\u6216\u504F\u79BB\u503C\uFF08\u5982 -1.5% \u6216 -0.5\uFF09`, "error");
            return;
          }
          if (EXCLUDED_IDS.includes(itemId) && !isAbsolute) {
            showToast(`\u7269\u54C1 ID ${itemId} \u6CA1\u6709 MP \u6570\u636E\uFF0C\u53EA\u80FD\u4F7F\u7528\u7EDD\u5BF9\u4EF7\u683C\u4F5C\u4E3A\u5224\u5B9A\u6761\u4EF6\uFF08\u7B2C ${i + 1} \u884C\uFF09`, "error");
            return;
          }
          indivRules.push(`${itemInput},${quality},${valInput}`);
        }
        localStorage.setItem("SC_Contract_HighPrice_Settings", JSON.stringify({
          global: globalInput,
          individual: indivRules.join("\n")
        }));
        showToast("\u4FDD\u5B58\u6210\u529F", "success");
        closeModal();
        refreshAllContractProfits();
      };
    }
    return { init: init2 };
  })();
  window.SC_Modules = window.SC_Modules || {};
  window.SC_Modules.incomingContractsHandler = incomingContractsHandler2;

  // src/features/marketInterceptor.js
  registerExportInfo({
    name: "\u5E02\u573A\u7F13\u5B58",
    scope: "realm",
    match: (realmId) => realmId === null ? /(?!)/ : new RegExp(`^(?:market_|market_all_)${realmId}_\\d+$`)
  });
  var { SCXXCS: SCXXCS3, PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL3, RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT3 } = state;
  (function() {
    let cachedRetailIds = null;
    function getRetailIds() {
      if (cachedRetailIds) return cachedRetailIds;
      const SCDStr = localStorage.getItem("SimcompaniesConstantsData");
      if (!SCDStr) return /* @__PURE__ */ new Set();
      try {
        const SCD = JSON.parse(SCDStr);
        if (!SCD.data || !SCD.data.SALES) return /* @__PURE__ */ new Set();
        const sales = SCD.data.SALES;
        const retailIds = /* @__PURE__ */ new Set();
        Object.keys(sales).forEach((key) => {
          const arr = sales[key];
          if (Array.isArray(arr)) arr.forEach((id) => retailIds.add(id));
        });
        cachedRetailIds = retailIds;
        return retailIds;
      } catch {
        return /* @__PURE__ */ new Set();
      }
    }
    function isRetailId(id) {
      const retailIds = getRetailIds();
      return retailIds.has(id);
    }
    function createProfitWorker() {
      const workerCode = `
            self.onmessage = function(e) {
                const { data, inputPercent, SCD, SRC, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT} = e.data;
                // bring constants into worker scope
                const lwe = SCD.retailInfo;
                const zn = SCD.data;

                // Utility functions defined inside to use local lwe and zn
                const Ul = (overhead, skillCOO) => {
                    const r = overhead || 1;
                    return r - (r - 1) * skillCOO / 100;
                };
                const wv = (e, t, r) => {
                    return r === null ? lwe[e][t] : lwe[e][t].quality[r];
                };
                const Upt = (e, t, r, n) => t + (e + n) / r;
                const Hpt = (e, t, r, n, a) => {
                    const o = (n + e) / ((t - a) * (t - a));
                    return e - (r - t) * (r - t) * o;
                };
                const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
                const Bpt = (e, t, r, n, a, o) => {
                    const g = RETAIL_ADJUSTMENT[e] ?? 1;
                    const s = Math.min(Math.max(2 - n, 0), 2),
                          l = Math.max(0.9, s / 2 + 0.5),
                          c = r / 12;
                    const d = PROFIT_PER_BUILDING_LEVEL *
                        (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                        g *
                        (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                        (t.modeledStoreWages ?? 0) * SCXXCS;
                    const h = t.modeledUnitsSoldAnHour * l;
                    const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
                    const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
                    return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
                };
                const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
                    const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
                    if (u <= 0) return NaN;
                    const d = u / acc / size;
                    let p = d - d * salesModifier / 100;
                    return weather && (p /= weather.sellingSpeedMultiplier), p
                };

                // Initial debug log
                const results = data.map(order => {
                    // profit calculation loop
                    let currentPrice = inputPercent < 0 ? order.price + inputPercent : order.price * (1 - inputPercent/100),
                        cost = currentPrice,
                        quantity = order.quantity,
                        maxProfit = -Infinity,
                        size = 1,
                        acceleration = SRC.acceleration,
                        economyState = SRC.economyState,
                        salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus,
                        skillCMO = SRC.saleBonus,
                        skillCOO = SRC.adminBonus;

                    if(order.kind === 153 || order.kind === 154){
                        quantity = Math.floor(order.quantity * Math.pow(1 - 0.05, (Math.round((Math.abs(Date.now() - Date.parse(order.datetimeDecayUpdated))) / (1000 * 60) / 4) * 4 / 60)))
                    }

                    // compute saturation locally
                    const saturation = (() => {
                        const list = SRC.ResourcesRetailInfo;
                        const m = list.find(item =>
                            item.dbLetter === parseInt(order.kind) &&
                            (parseInt(order.kind) !== 150 || item.quality === order.quality)
                        );
                        return m?.saturation;
                    })();

                    const administrationOverhead = SRC.administration;
                    const buildingKind = Object.entries(zn.SALES).find(([k, ids]) =>
                        ids.includes(parseInt(order.kind))
                    )?.[0];
                    const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
                    const averageSalary = zn.AVERAGE_SALARY;
                    const wages = averageSalary * salaryModifier;
                    const forceQuality = (parseInt(order.kind) === 150) ? order.quality : undefined;
                    const resourceDetail = SCD.constantsResources[parseInt(order.kind)]

                    const v = salesModifierWithRecreationBonus + skillCMO;
                    const b = Ul(administrationOverhead, skillCOO);
                    let selltime;

                    while (currentPrice > 0) {
                        const modeledData = wv(economyState, order.kind, forceQuality ?? null);
                        const w = zL(
                            buildingKind,
                            modeledData,
                            quantity,
                            v,
                            currentPrice,
                            forceQuality === void 0 ? order.quality : 0,
                            saturation,
                            acceleration,
                            size,
                            resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0
                        );
                        const revenue = currentPrice * quantity;
                        const wagesTotal = Math.ceil(w * wages * acceleration * b / 3600);
                        const secondsToFinish = w;
                        const profit = (!secondsToFinish || secondsToFinish <= 0)
                            ? NaN
                            : (revenue - cost * quantity - wagesTotal) / secondsToFinish;

                        if (!secondsToFinish || secondsToFinish <= 0) break;
                        if (profit > maxProfit) {
                            maxProfit = profit;
                            selltime = secondsToFinish;
                        }
                        // price increment
                        if (currentPrice < 8) {
                            currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                        } else if (currentPrice < 2001) {
                            currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                        } else {
                            currentPrice = Math.round(currentPrice + 1);
                        }
                    }

                    // \u8FD4\u56DE\u6BCF\u4E2A\u8BA2\u5355\u7684\u8BA1\u7B97\u7ED3\u679C
                    return {
                        seller: order.seller?.company || "",
                        marketPrice: order.price,
                        quality: order.quality,
                        saleAmout: quantity,
                        contractPrice: cost,
                        contractMaxProfit: (maxProfit * 3600).toFixed(2)
                    };
                });
                self.postMessage(results);
            };
            `;
      const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
      return worker;
    }
    const profitWorker = createProfitWorker();
    window.MarketInterceptor = {
      profitWorker,
      calculateProfit(inputPercent, data2, realmId) {
        const SCD = JSON.parse(localStorage.getItem("SimcompaniesConstantsData"));
        const SRC = JSON.parse(localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`));
        return new Promise((resolve) => {
          profitWorker.onmessage = (e) => {
            resolve(e.data);
          };
          profitWorker.postMessage({ data: data2, inputPercent, SCD, SRC, SCXXCS: SCXXCS3, PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL3, RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT3 });
        });
      }
    };
    function processMarketData(json, realm, id, isAll) {
      if (!Array.isArray(json)) return;
      const dataToSave = {
        timestamp: Date.now(),
        data: json
      };
      const prefix = isAll ? "market_all_" : "market_";
      localStorage.setItem(`${prefix}${realm}_${id}`, JSON.stringify(dataToSave));
    }
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const url = args[0];
      const match2 = typeof url === "string" && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)\/?($|\?)/);
      const matchAll = typeof url === "string" && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)\/?($|\?)/);
      const m = match2 || matchAll;
      if (m) {
        const realm = parseInt(m[1], 10);
        const id = parseInt(m[2], 10);
        const response = await originalFetch(...args);
        response.clone().json().then((json) => {
          processMarketData(json, realm, id, !!matchAll);
        }).catch(() => {
        });
        return response;
      }
      return originalFetch(...args);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      try {
        const match2 = typeof url === "string" && url.match(/\/api\/v3\/market\/(\d+)\/(\d+)(\/|$|\?)/);
        const matchAll = typeof url === "string" && url.match(/\/api\/v3\/market\/all\/(\d+)\/(\d+)(\/|$|\?)/);
        const m = match2 || matchAll;
        if (m) {
          const realm = parseInt(m[1], 10);
          const id = parseInt(m[2], 10);
          this._realm = realm;
          this._id = id;
          this._isAll = !!matchAll;
          this.addEventListener("readystatechange", () => {
            if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
              try {
                const json = JSON.parse(this.responseText);
                processMarketData(json, this._realm, this._id, this._isAll);
              } catch {
              }
            }
          }, false);
        }
      } catch {
      }
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(...args) {
      return originalSend.call(this, ...args);
    };
  })();

  // src/features/warehouseRetailProfit.js
  var { SCXXCS: SCXXCS4, PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL4, RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT4 } = state;
  var WarehouseRetailProfit = (function() {
    const workerCode = `
        self.onmessage = function(e) {
        const { items, shared, SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT } = e.data;
        if (!items || !items.length) { self.postMessage([]); return; }

        const lwe = shared.SCD.retailInfo;
        const zn = shared.SCD.data;
        const SRC = shared.SRC;
        const acceleration = SRC.acceleration;
        const size = 1;

        const Ul = (overhead, skillCOO) => {
            const r = overhead || 1;
            return r - (r - 1) * skillCOO / 100;
        };
        const wv = (e, t, r) => {
            return r === null ? lwe[e][t] : lwe[e][t].quality[r];
        };
        const Upt = (e, t, r, n) => t + (e + n) / r;
        const Hpt = (e, t, r, n, a) => {
            const o = (n + e) / ((t - a) * (t - a));
            return e - (r - t) * (r - t) * o;
        };
        const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
        const Bpt = (e, t, r, n, a, o) => {
            const g = RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = Math.max(0.9, s / 2 + 0.5),
                  c = r / 12;
            const d = PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0) * SCXXCS;
            const h = t.modeledUnitsSoldAnHour * l;
            const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
            const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
            return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
        };
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, sz, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / sz;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        const results = [];

        for (const item of items) {
            const { idx, unitCost, quality, quantity, resourceId, itemSaturation, itemForceQuality } = item;

            const economyState = shared.economyState;
            const buildingKind = shared.buildingKind;
            const wagesVal = shared.wages;
            const v = shared.v;
            const b = shared.b;
            const weather = shared.weather;

            // \u6210\u672C\u4EF7\uFF08\u517C\u5BB9 unitCost \u53EF\u80FD\u4E3A 0 \u7684\u60C5\u51B5\uFF09
            const startPrice = Math.max(Math.ceil(unitCost) || 1, 1);
            let currentPrice = startPrice;
            let maxProfit = -Infinity;
            let bestPrice = currentPrice;

            while (currentPrice > 0) {
                const modeledData = wv(economyState, resourceId, itemForceQuality ?? null);
                const w = zL(
                    buildingKind,
                    modeledData,
                    quantity,
                    v,
                    currentPrice,
                    itemForceQuality === void 0 ? quality : 0,
                    itemSaturation,
                    acceleration,
                    size,
                    weather
                );
                const revenue = currentPrice * quantity;
                const wagesTotal = Math.ceil(w * wagesVal * acceleration * b / 3600);
                const secondsToFinish = w;

                if (!secondsToFinish || secondsToFinish <= 0) break;

                const profit = (revenue - unitCost * quantity - wagesTotal) / secondsToFinish;
                if (profit > maxProfit) {
                    maxProfit = profit;
                    bestPrice = currentPrice;
                }

                if (currentPrice < 8) {
                    currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
                } else if (currentPrice < 2001) {
                    currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
                } else {
                    currentPrice = Math.round(currentPrice + 1);
                }
            }

            results.push({
                idx,
                maxProfit: maxProfit > -Infinity ? maxProfit * 3600 : null,
                bestPrice: maxProfit > -Infinity ? bestPrice : null
            });
        }

        self.postMessage(results);
        };
        `;
    const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
    const pendingItems = /* @__PURE__ */ new Map();
    profitWorker.onmessage = function(e) {
      const results = e.data;
      if (!Array.isArray(results)) return;
      if (!Array.isArray(results)) return;
      for (const item of results) {
        const { idx, maxProfit, bestPrice } = item;
        const el = pendingItems.get(idx);
        if (!el) continue;
        pendingItems.delete(idx);
        if (maxProfit !== null && isFinite(maxProfit)) {
          const profitColor = maxProfit >= 0 ? "#4CAF50" : "#f44336";
          const prefix = maxProfit >= 0 ? "" : "\u26A0\uFE0F";
          el.textContent = `${prefix}\u65F6\u5229\u6DA6:${maxProfit.toFixed(2)}`;
          el.style.color = profitColor;
        } else {
          el.textContent = "\u65E0\u6CD5\u8BA1\u7B97";
          el.style.color = "#888";
        }
        el.style.fontWeight = "bold";
      }
    };
    function parseResourceId() {
      const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
      if (!link) return null;
      const match2 = link.href.match(/\/resource\/(\d+)\//);
      return match2 ? parseInt(match2[1], 10) : null;
    }
    function parseQualityFromContainer(container) {
      const starSelectors = [
        'svg[data-icon="star"]',
        "svg.fa-star",
        ".fa-star",
        '[class*="fa-star"]'
      ];
      for (const sel of starSelectors) {
        try {
          const stars = container.querySelectorAll(sel);
          if (stars.length === 0) continue;
          const groups = /* @__PURE__ */ new Map();
          stars.forEach((svg) => {
            const p = svg.parentElement;
            if (!groups.has(p)) groups.set(p, []);
            groups.get(p).push(svg);
          });
          let maxQ = 0;
          for (const [parent, svgs] of groups) {
            const txt = parent.textContent?.trim() || "";
            const numMatch = txt.match(/^(\d+)/);
            if (numMatch) {
              const q = parseInt(numMatch[1], 10);
              if (q > maxQ) maxQ = q;
            } else if (svgs.length > maxQ) {
              maxQ = svgs.length;
            }
          }
          if (maxQ > 0) return maxQ;
        } catch (e) {
        }
      }
      return 0;
    }
    function findItemStacks() {
      const costRows = document.querySelectorAll(".css-16qjhms");
      const stacks = /* @__PURE__ */ new Set();
      costRows.forEach((row) => {
        let el = row.parentElement;
        while (el && el !== document.body) {
          const hasQuantity = el.querySelector("span.css-nzibbl > b");
          if (hasQuantity) {
            stacks.add(el);
            break;
          }
          el = el.parentElement;
        }
      });
      return [...stacks];
    }
    function findQuantityRow(stack) {
      const bEl = stack.querySelector("span.css-nzibbl > b");
      if (!bEl) return null;
      let el = bEl.parentElement;
      while (el && el.parentElement !== stack) {
        el = el.parentElement;
      }
      return el;
    }
    function isWarehouseItemPage() {
      const url = location.href;
      return /\/headquarters\/warehouse\/(?!.*\/(?:sell|contract)\/?$)[^\/]+\/?$/.test(url);
    }
    function injectCustomToggle() {
      if (document.querySelector("[data-warehouse-custom-toggle]")) return;
      const link = document.querySelector('a[href*="/encyclopedia/"][href*="/resource/"]');
      if (!link) return;
      const parent = link.parentElement;
      if (!parent) return;
      const toggleContainer = document.createElement("span");
      toggleContainer.dataset.warehouseCustomToggle = "true";
      toggleContainer.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-right:8px;";
      const toggle = createGlobalCustomToggle(
        "executiveCustomToggle",
        "\u81EA\u5B9A\u4E49",
        { buttonClass: "btn btn-primary" },
        () => {
          document.querySelectorAll(".sc-warehouse-profit").forEach((e) => e.remove());
          pendingItems.clear();
          calculateAndDisplay();
        }
      );
      toggle.wrapper.style.marginLeft = "0";
      toggleContainer.appendChild(toggle.wrapper);
      const customBtn = document.createElement("button");
      customBtn.type = "button";
      customBtn.textContent = "\u81EA\u5B9A\u4E49\u9AD8\u7BA1\u6570\u636E";
      customBtn.style.cssText = "padding:4px 10px;background:#2196f3;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;white-space:nowrap;";
      customBtn.onclick = (e) => {
        e.preventDefault();
        if (typeof executiveCustomButton !== "undefined") executiveCustomButton.show();
      };
      toggleContainer.appendChild(customBtn);
      const economySpan = document.createElement("span");
      economySpan.style.cssText = "display:inline-flex;align-items:center;gap:2px;margin-left:4px;";
      const economyLabel = document.createElement("span");
      economyLabel.textContent = "\u5468\u671F:";
      economyLabel.style.cssText = "font-size:12px;color:#666;";
      const economySelect = document.createElement("select");
      economySelect.id = "sc-warehouse-economy-select";
      economySelect.style.cssText = "font-size:12px;color:#333;background:#fff;border:1px solid #bbb;border-radius:4px;padding:3px 4px;";
      economySelect.innerHTML = `
                <option value="">\u5F53\u524D</option>
                <option value="0">\u8427\u6761</option>
                <option value="1">\u5E73\u7F13</option>
                <option value="2">\u666F\u6C14</option>
            `;
      economySelect.addEventListener("change", () => {
        document.querySelectorAll(".sc-warehouse-profit").forEach((e) => e.remove());
        pendingItems.clear();
        calculateAndDisplay();
      });
      economySpan.appendChild(economyLabel);
      economySpan.appendChild(economySelect);
      toggleContainer.appendChild(economySpan);
      parent.parentNode.insertBefore(toggleContainer, parent);
    }
    function calculateAndDisplay() {
      if (!isWarehouseItemPage()) return;
      const resourceId = parseResourceId();
      if (!resourceId) return;
      const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
      if (realmId === null) return;
      const SCD_raw = localStorage.getItem("SimcompaniesConstantsData");
      if (!SCD_raw) return;
      const SCD = JSON.parse(SCD_raw);
      const isRetail = Object.values(SCD.data.SALES || {}).some((arr) => arr.includes(resourceId));
      if (!isRetail) return;
      const SRC_raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
      if (!SRC_raw) return;
      const SRC = JSON.parse(SRC_raw);
      const warehouseResources = SRC.warehouseResources;
      if (!warehouseResources || !Array.isArray(warehouseResources)) return;
      const stacks = findItemStacks();
      if (stacks.length === 0) return;
      injectCustomToggle();
      const zn = SCD.data;
      const pageActionsConfig = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
      const isCustomEnabled = pageActionsConfig["executiveCustomToggle"] === true;
      let skillCMO, skillCOO;
      if (isCustomEnabled) {
        const bonusKey = `R${realmId}-SC-Saved-Bonuses`;
        try {
          const SSB = JSON.parse(localStorage.getItem(bonusKey));
          if (SSB) {
            skillCMO = SSB.saleBonus;
            skillCOO = SSB.adminBonus;
          } else {
            skillCMO = SRC.saleBonus;
            skillCOO = SRC.adminBonus;
          }
        } catch (e) {
          skillCMO = SRC.saleBonus;
          skillCOO = SRC.adminBonus;
        }
      } else {
        skillCMO = SRC.saleBonus;
        skillCOO = SRC.adminBonus;
      }
      const salesModifierWithRecreationBonus = SRC.salesModifier + SRC.recreationBonus;
      const buildingKind = Object.entries(zn.SALES).find(([, ids]) => ids.includes(resourceId))?.[0];
      const salaryModifier = SCD.buildingsSalaryModifier?.[buildingKind];
      const wages = (zn.AVERAGE_SALARY || 0) * (salaryModifier || 1);
      const economySelectEl = document.getElementById("sc-warehouse-economy-select");
      const economyState = economySelectEl && economySelectEl.value !== "" ? parseInt(economySelectEl.value) : SRC.economyState;
      const v = salesModifierWithRecreationBonus + skillCMO;
      const b = (() => {
        const r = SRC.administration || 1;
        return r - (r - 1) * skillCOO / 100;
      })();
      const resourceDetail = SCD.constantsResources?.[resourceId];
      const weather = resourceDetail && resourceDetail.retailSeason === "Summer" ? SRC.sellingSpeedMultiplier : void 0;
      const shared = {
        SCD,
        SRC,
        economyState,
        buildingKind,
        wages,
        v,
        b,
        weather
      };
      const list = SRC.ResourcesRetailInfo || [];
      const orders = [];
      let idx = 0;
      stacks.forEach((stack) => {
        if (stack.querySelector(".sc-warehouse-profit")) return;
        const bEl = stack.querySelector("b");
        const rawQty = bEl ? bEl.textContent?.replace(/,/g, "") : "0";
        const quantity = parseFloat(rawQty) || 0;
        if (quantity <= 0) return;
        const quality = parseQualityFromContainer(stack);
        const warehouseEntry = warehouseResources.find((e) => e.kind === resourceId && e.quality === quality);
        if (!warehouseEntry) return;
        const costSum = Object.values(warehouseEntry.cost || {}).reduce((s, val) => s + (typeof val === "number" ? val : 0), 0);
        const unitCost = warehouseEntry.amount > 0 ? costSum / warehouseEntry.amount : 0;
        let itemSaturation;
        if (resourceId === 150) {
          const m150 = list.find((item) => item.dbLetter === 150 && item.quality === quality);
          itemSaturation = m150?.saturation;
        } else {
          const m = list.find((item) => item.dbLetter === resourceId);
          itemSaturation = m?.saturation;
        }
        const itemForceQuality = resourceId === 150 ? quality : void 0;
        const profitEl = document.createElement("span");
        profitEl.className = "sc-warehouse-profit";
        profitEl.textContent = "\u8BA1\u7B97\u4E2D...";
        profitEl.style.cssText = "margin-left:8px;font-size:13px;color:#888;";
        const quantityRow = findQuantityRow(stack);
        if (quantityRow) {
          quantityRow.appendChild(profitEl);
        }
        pendingItems.set(idx, profitEl);
        orders.push({
          idx,
          unitCost,
          quality,
          quantity,
          resourceId: String(resourceId),
          itemSaturation,
          itemForceQuality
        });
        idx++;
      });
      if (orders.length > 0) {
        profitWorker.postMessage({
          items: orders,
          shared,
          SCXXCS: SCXXCS4,
          PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL4,
          RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT4
        });
      }
    }
    let initRetries = 0;
    let domObserver = null;
    function tryInit() {
      if (!isWarehouseItemPage()) return;
      const stacks = findItemStacks();
      if (stacks.length > 0) {
        calculateAndDisplay();
        initRetries = 0;
        return;
      }
      if (initRetries < 30) {
        initRetries++;
        setTimeout(tryInit, 400);
      }
    }
    function init2() {
      if (typeof window.isPageModuleEnabled === "function" && !window.isPageModuleEnabled("warehouseProfit")) {
        document.querySelectorAll(".sc-warehouse-profit").forEach((e) => e.remove());
        document.querySelectorAll("[data-warehouse-custom-toggle]").forEach((e) => e.remove());
        if (domObserver) {
          domObserver.disconnect();
          domObserver = null;
        }
        pendingItems.clear();
        return;
      }
      initRetries = 0;
      document.querySelectorAll(".sc-warehouse-profit").forEach((e) => e.remove());
      pendingItems.clear();
      if (domObserver) domObserver.disconnect();
      tryInit();
      domObserver = new MutationObserver(() => {
        if (isWarehouseItemPage()) {
          const allStacks = findItemStacks();
          const hasNew = allStacks.length > 0;
          const hasPending = allStacks.some((s) => !s.querySelector(".sc-warehouse-profit"));
          if (hasNew && hasPending) calculateAndDisplay();
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        if (isWarehouseItemPage()) {
          setTimeout(init2, 400);
        } else {
          if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
          }
          document.querySelectorAll("[data-warehouse-custom-toggle]").forEach((e) => e.remove());
          document.querySelectorAll(".sc-warehouse-profit").forEach((e) => e.remove());
          pendingItems.clear();
        }
      }
    }).observe(document, { subtree: true, childList: true });
    setTimeout(init2, 600);
    return { init: init2 };
  })();

  // src/features/chatAccessibility.js
  var ChatAccessibility = (function() {
    const EMOJI_TEXT = {
      "\u{1F7E2}": "\u7EFF",
      "\u{1F534}": "\u7EA2",
      "\u{1F7E1}": "\u9EC4",
      "\u{1F535}": "\u84DD",
      "\u{1F7E3}": "\u7D2B",
      "\u{1F7E0}": "\u6A59",
      "\u26AA": "\u767D",
      "\u26AB": "\u9ED1",
      "\u{1F7E4}": "\u68D5"
    };
    const ALLOWED_ROOMS = ["Sales", "Aerospace sales", "[ZH] \u4EA4\u6613"];
    let observer = null;
    let styleInjected = false;
    function isEnabled() {
      try {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg["chatAccessibility"] === true;
      } catch (e) {
        return false;
      }
    }
    function setEnabled(val) {
      try {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        cfg["chatAccessibility"] = val;
        localStorage.setItem("SC_PageActions_Settings", JSON.stringify(cfg));
      } catch (e) {
      }
    }
    function refreshAllButtons() {
      const enabled = isEnabled();
      document.querySelectorAll(".sc-chat-toggle-btn").forEach((btn) => {
        btn.textContent = enabled ? "\u{1F7E2} \u6587\u5B57" : "\u{1F534} \u56FE\u6807";
        btn.title = enabled ? "\u70B9\u51FB\u5207\u6362\u4E3A\u539F\u59CB Emoji \u56FE\u6807\u663E\u793A" : "\u70B9\u51FB\u5207\u6362\u4E3A\u6587\u5B57\u8F85\u52A9\u663E\u793A\uFF08\u65B9\u4FBF\u8272\u5F31\u8BC6\u522B\uFF09";
      });
    }
    function refreshAllContainers() {
      const enabled = isEnabled();
      findChatContainers().forEach((container) => {
        container.classList.toggle("sc-chat-assist", enabled);
      });
    }
    function injectStyles() {
      if (styleInjected) return;
      styleInjected = true;
      const style = document.createElement("style");
      style.textContent = `.sc-chat-emoji-text{display:none;font-size:inherit;vertical-align:middle;font-style:normal;color:inherit}.sc-chat-assist .sc-chat-emoji-text{display:inline}.sc-chat-assist .sc-chat-emoji-wrapper img.emoji{display:none}`;
      document.head.appendChild(style);
    }
    function processEmoji(img) {
      if (img.dataset.scEmojiDone) return;
      const alt = img.getAttribute("alt") || "";
      const text = EMOJI_TEXT[alt];
      if (!text) return;
      img.dataset.scEmojiDone = "true";
      const wrapper = document.createElement("span");
      wrapper.className = "sc-chat-emoji-wrapper";
      wrapper.style.cssText = "display:inline-flex;align-items:center;";
      const textSpan = document.createElement("span");
      textSpan.className = "sc-chat-emoji-text";
      textSpan.textContent = "[" + text + "]";
      img.parentNode?.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      wrapper.appendChild(textSpan);
    }
    function scanContainer(container) {
      const emojis = container.querySelectorAll("img.emoji:not([data-sc-emoji-done])");
      emojis.forEach(processEmoji);
    }
    function findChatContainers() {
      const byClass = document.querySelectorAll("div.css-xo2rg1.e1llepen2");
      if (byClass.length > 0) return byClass;
      return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
    }
    function getChatRoom() {
      const roomIndicator = document.querySelector("div.css-13udsys.col-lg-6");
      if (roomIndicator) {
        const header2 = roomIndicator.querySelector("div.well-header.text-uppercase.css-12ztnbp");
        if (header2) return header2.textContent?.trim() || "";
      }
      const header = document.querySelector("div.well-header.text-uppercase.css-12ztnbp");
      if (header) return header.textContent?.trim() || "";
      return "";
    }
    function addToggleButtons() {
      if (!isEnabled()) return;
      const headers = document.querySelectorAll("div.well-header.text-uppercase.css-12ztnbp");
      headers.forEach((header) => {
        if (header.querySelector(".sc-chat-toggle-btn")) return;
        const roomName = header.textContent?.trim() || "";
        if (!ALLOWED_ROOMS.includes(roomName)) return;
        const enabled = isEnabled();
        const btn = document.createElement("button");
        btn.className = "sc-chat-toggle-btn";
        btn.textContent = enabled ? "\u{1F7E2} \u6587\u5B57" : "\u{1F534} \u56FE\u6807";
        btn.title = enabled ? "\u70B9\u51FB\u5207\u6362\u4E3A\u539F\u59CB Emoji \u56FE\u6807\u663E\u793A" : "\u70B9\u51FB\u5207\u6362\u4E3A\u6587\u5B57\u8F85\u52A9\u663E\u793A\uFF08\u65B9\u4FBF\u8272\u5F31\u8BC6\u522B\uFF09";
        btn.style.cssText = "background:none;border:1px solid currentColor;border-radius:4px;cursor:pointer;font-size:12px;padding:1px 6px;margin-left:8px;vertical-align:middle;line-height:1.4;color:inherit;opacity:0.8;";
        btn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          const newState = !isEnabled();
          setEnabled(newState);
          refreshAllContainers();
          refreshAllButtons();
          if (newState) {
            findChatContainers().forEach((c) => scanContainer(c));
          }
          if (typeof refreshPageActionToggles === "function") refreshPageActionToggles();
        };
        header.appendChild(btn);
      });
    }
    function init2() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      injectStyles();
      const room = getChatRoom();
      if (!room) {
        setTimeout(init2, 1e3);
        return;
      }
      if (!ALLOWED_ROOMS.includes(room)) return;
      const chatContainers = findChatContainers();
      if (chatContainers.length === 0) {
        setTimeout(init2, 1e3);
        return;
      }
      chatContainers.forEach((container) => {
        scanContainer(container);
      });
      addToggleButtons();
      refreshAllContainers();
      if (observer) observer.disconnect();
      observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) scanContainer(n);
          }
        }
      });
      chatContainers.forEach((container) => {
        observer.observe(container, { childList: true, subtree: true });
      });
    }
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (lastUrl !== location.href) {
        lastUrl = location.href;
        setTimeout(init2, 500);
      }
    }).observe(document, { subtree: true, childList: true });
    setTimeout(init2, 1e3);
    return { init: init2, getChatRoom, EMOJI_TEXT, ALLOWED_ROOMS };
  })();

  // src/features/chatEmojiPicker.js
  registerExportInfo({
    name: "\u804A\u5929\u8868\u60C5\u9009\u62E9\u5668\u6700\u8FD1\u4F7F\u7528",
    scope: "global",
    keys: ["SC_EmojiPicker_Recent"]
  });
  (function() {
    "use strict";
    const MODULE_KEY = "chatEmojiPicker";
    const BUTTON_SELECTOR = "[data-sc-emoji-picker-added]";
    const BUNDLE_SELECTOR = 'script[type="module"][crossorigin][src^="https://www.simcompanies.com/static/bundle/assets/index-"][src$=".js"]';
    const RECENT_KEY = "SC_EmojiPicker_Recent";
    const RECENT_MAX = 30;
    const BUILDING_NAMES = {
      P: "\u519C\u573A",
      W: "\u6C34\u5E93",
      E: "\u53D1\u7535\u5382",
      O: "\u6CB9\u7530",
      R: "\u70BC\u6CB9\u5382",
      S: "\u8FD0\u8F93\u7AD9",
      G: "\u6742\u8D27\u5E97",
      C: "\u7535\u5B50\u4EA7\u54C1\u5546\u5E97",
      A: "\u52A0\u6CB9\u7AD9",
      F: "\u7267\u573A",
      M: "\u77FF\u4E95",
      Y: "\u5DE5\u5382",
      L: "\u7535\u5B50\u5DE5\u5382",
      T: "\u65F6\u88C5\u5DE5\u5382",
      B: "\u9500\u552E\u529E\u516C\u5BA4",
      d: "\u4E94\u91D1\u5E97",
      g: "\u5EFA\u7B51\u627F\u5305\u5546",
      H: "\u65F6\u88C5\u5E97",
      i: "\u78E8\u574A",
      I: "\u6625\u5B63\u5E02\u573A",
      j: "\u9762\u5305\u623F",
      k: "\u98DF\u54C1\u52A0\u5DE5\u5382",
      m: "\u9910\u996E",
      n: "\u5C60\u5BB0\u573A",
      o: "\u6DF7\u51DD\u571F\u5382",
      p: "\u63A8\u8FDB\u5668\u5DE5\u5382",
      Q: "\u91C7\u77F3\u573A",
      r: "\u9910\u5385",
      t: "\u82D7\u5703",
      x: "\u5EFA\u7B51\u5DE5\u5382",
      y: "\u5B66\u9662",
      z: "\u6CF3\u6C60\u5E02\u573A"
    };
    let openPanel = null;
    let openButton = null;
    let openInputGroup = null;
    let layoutObserver = null;
    let layoutTimer = null;
    let buttonPositionTimer = null;
    let variantPopup = null;
    let scanTimer = null;
    let started = false;
    let lastUrl = location.href;
    let emojiDataPromise = null;
    let insertQueue = Promise.resolve();
    function isEnabled() {
      try {
        const cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
        return cfg[MODULE_KEY] !== false;
      } catch (e) {
        return true;
      }
    }
    function isChatInput(el) {
      if (!el || el.tagName !== "TEXTAREA") return false;
      if (!el.closest(".input-group")) return false;
      let cur = el.parentElement;
      while (cur && cur !== document.body) {
        if (cur.classList.contains("e1llepen1") || cur.querySelector(".e1llepen2") || cur.querySelector('div[style*="column-reverse"]')) {
          return true;
        }
        cur = cur.parentElement;
      }
      return false;
    }
    function getStaticBaseUrl() {
      try {
        const props = window.reactjs && window.reactjs.props;
        const staticUrl = props && props.staticUrl;
        if (typeof staticUrl === "string" && staticUrl) {
          if (staticUrl.startsWith("http")) return staticUrl.replace(/\/?$/, "/");
          return location.origin + (staticUrl.startsWith("/") ? staticUrl : "/" + staticUrl);
        }
      } catch (e) {
      }
      return location.origin + "/static/";
    }
    function getBundleUrl() {
      const tag = document.querySelector(BUNDLE_SELECTOR);
      return tag ? tag.src : "";
    }
    function getEmojiSourceUrls() {
      const urls = /* @__PURE__ */ new Set();
      const mainUrl = getBundleUrl();
      if (mainUrl) urls.add(mainUrl);
      document.querySelectorAll("script[src]").forEach((script) => {
        const src = script.src;
        if (!src) return;
        if (/\.js(\?|#)?$/.test(src) && (src.toLowerCase().includes("emoji") || /\/assets\/[^/]*index-[^/]+\.js$/.test(src))) {
          urls.add(src);
        }
      });
      return Array.from(urls);
    }
    async function requestBundleRaw(url) {
      const network = window.__SC_Network;
      if (network && typeof network.requestRaw === "function") {
        return await network.requestRaw(url);
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("bundle-fetch-failed");
      return await res.text();
    }
    function parseAssetMap(raw) {
      const match2 = raw.match(/JSON\.parse\('((?:\\.|[^'\\])*)'\)/);
      if (!match2) return {};
      try {
        return JSON.parse(match2[1]);
      } catch (e) {
        return {};
      }
    }
    function resolveAssetUrl(assets, path) {
      const hashed = assets[path] || path;
      return getStaticBaseUrl() + hashed;
    }
    function parseSpecialEmojis(raw, assets) {
      const fallback = [
        { code: ":sc:", name: "Sim Companies", image: resolveAssetUrl(assets, "images/logo.png") },
        { code: ":simboosts:", name: "Sim Boosts", image: resolveAssetUrl(assets, "images/sim-boosts2.png") }
      ];
      try {
        const start2 = raw.indexOf("const qBt =");
        if (start2 === -1) return fallback;
        const end = raw.indexOf("tMn =", start2);
        const segment = end === -1 ? raw.slice(start2) : raw.slice(start2, end);
        const entryRe = /\{\s*name:\s*"([^"]+)",\s*shortNames:\s*\[([^\]]+)\],\s*imageUrl:\s*xe\("([^"]+)"\)/g;
        const result = [];
        let match2;
        while ((match2 = entryRe.exec(segment)) !== null) {
          const names = match2[2].match(/"([^"]+)"/g) || [];
          const first = names[0] ? names[0].slice(1, -1) : "";
          if (!first) continue;
          result.push({
            code: `:${first}:`,
            name: match2[1],
            image: resolveAssetUrl(assets, match2[3])
          });
        }
        return result.length > 0 ? result : fallback;
      } catch (e) {
        return fallback;
      }
    }
    function parseEmojiData(raw) {
      const assets = parseAssetMap(raw);
      const resources = [];
      const seenResources = /* @__PURE__ */ new Set();
      const resourceRe = /\bdbLetter:\s*(\d+),[\s\S]{0,2500}?image:\s*"images\/resources\/([^"]+)"/g;
      let match2;
      while ((match2 = resourceRe.exec(raw)) !== null) {
        const id = Number(match2[1]);
        if (seenResources.has(id)) continue;
        seenResources.add(id);
        resources.push({
          code: `:re-${id}:`,
          name: resourceIdNameMap[id] || "",
          image: resolveAssetUrl(assets, "images/resources/" + match2[2])
        });
      }
      resources.sort((a, b) => Number(a.code.replace(/\D/g, "")) - Number(b.code.replace(/\D/g, "")));
      const buildings = [];
      const seenBuildings = /* @__PURE__ */ new Set();
      const buildingRe = /\bdbLetter:\s*"([A-Za-z])",[\s\S]{0,4000}?levelImages:\s*\[\s*\{\s*level:\s*\d+,\s*image:\s*"([^"]+)"/g;
      while ((match2 = buildingRe.exec(raw)) !== null) {
        const file = match2[2];
        if (!file.startsWith("images/buildings/") || seenBuildings.has(match2[1])) continue;
        seenBuildings.add(match2[1]);
        buildings.push({
          code: `:bd-${match2[1]}:`,
          name: BUILDING_NAMES[match2[1]] || "",
          image: resolveAssetUrl(assets, file)
        });
      }
      buildings.sort((a, b) => a.code.localeCompare(b.code));
      const eggs = [];
      const eggRe = /id:\s*"([A-Z0-9_]+)",\s*rarity:\s*"[A-Z]+",\s*image:\s*"([^"]+)"/g;
      while ((match2 = eggRe.exec(raw)) !== null) {
        const file = match2[2];
        if (!file.startsWith("images/eggs/")) continue;
        eggs.push({
          code: `:egg-${match2[1]}:`,
          name: match2[1].replace(/_/g, " "),
          image: resolveAssetUrl(assets, file)
        });
      }
      eggs.sort((a, b) => a.code.localeCompare(b.code));
      const realms = [];
      const realmRe = /\b(\d+):\s*\{\s*idx:\s*(\d+),\s*textId:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*logo:\s*"([^"]+)"/g;
      while ((match2 = realmRe.exec(raw)) !== null) {
        realms.push({
          code: `:realm-${Number(match2[2]) + 1}:`,
          name: match2[4],
          image: resolveAssetUrl(assets, match2[5])
        });
      }
      realms.sort((a, b) => Number(a.code.replace(/\D/g, "")) - Number(b.code.replace(/\D/g, "")));
      return {
        resources,
        buildings,
        eggs,
        realms,
        special: parseSpecialEmojis(raw, assets),
        other: parseUnicodeEmojis(raw)
      };
    }
    function parseUnicodeEmojis(raw) {
      const seen = /* @__PURE__ */ new Set();
      const result = [];
      const patterns = [
        /emoji:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g,
        /description:\s*"([^"]+)",\s*emoji:\s*"([^"]+)"/g
      ];
      for (const pattern of patterns) {
        let match2;
        while ((match2 = pattern.exec(raw)) !== null) {
          const emojiRaw = pattern.source.startsWith("emoji") ? match2[1] : match2[2];
          const name = pattern.source.startsWith("emoji") ? match2[2] : match2[1];
          let emoji = emojiRaw;
          try {
            emoji = JSON.parse('"' + emojiRaw + '"');
          } catch (e) {
          }
          if (seen.has(emoji)) continue;
          seen.add(emoji);
          result.push({
            code: emoji,
            emoji,
            name
          });
        }
      }
      const grouped = /* @__PURE__ */ new Map();
      for (const item of result) {
        const base = item.emoji.replace(/[\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, "");
        if (!base) continue;
        if (!grouped.has(base)) {
          grouped.set(base, { item, variants: [] });
          continue;
        }
        const group = grouped.get(base);
        if (item.emoji === group.item.emoji) continue;
        if (item.emoji.length < group.item.emoji.length) {
          group.variants.push(group.item);
          group.item = item;
        } else if (!group.variants.some((variant) => variant.emoji === item.emoji)) {
          group.variants.push(item);
        }
      }
      return Array.from(grouped.values()).map((group) => ({
        ...group.item,
        variants: group.variants
      }));
    }
    function loadEmojiData() {
      if (!emojiDataPromise) {
        emojiDataPromise = (async () => {
          const url = getBundleUrl();
          if (!url) throw new Error("emoji-bundle-not-found");
          const raw = await requestBundleRaw(url);
          const data2 = parseEmojiData(raw);
          if (data2.other.length === 0) {
            for (const candidate of getEmojiSourceUrls()) {
              if (candidate === url) continue;
              try {
                const candidateRaw = await requestBundleRaw(candidate);
                const other = parseUnicodeEmojis(candidateRaw);
                if (other.length > 0) {
                  data2.other = other;
                  break;
                }
              } catch (e) {
              }
            }
          }
          if (data2.other.length === 0) {
            console.warn("[SC-EmojiPicker] Unicode emoji data not found in loaded scripts.");
          }
          return data2;
        })().catch((err) => {
          emojiDataPromise = null;
          throw err;
        });
      }
      return emojiDataPromise;
    }
    function getRecentCodes() {
      try {
        const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(raw) ? raw.filter((code) => typeof code === "string") : [];
      } catch (e) {
        return [];
      }
    }
    function rememberRecent(code) {
      const list = getRecentCodes().filter((item) => item !== code);
      list.unshift(code);
      if (list.length > RECENT_MAX) list.length = RECENT_MAX;
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      } catch (e) {
      }
    }
    function applyPanelTheme(panel) {
      const dark = typeof DM === "function" ? DM() : false;
      panel.style.background = dark ? "rgba(35,35,38,0.98)" : "rgba(255,255,255,0.98)";
      panel.style.setProperty("--sc-fg", dark ? "#efefef" : "#333");
      panel.style.setProperty("--sc-border", dark ? "#555" : "#ccc");
      panel.style.setProperty("--sc-input-bg", dark ? "#1d1d1f" : "#f4f4f4");
      panel.style.setProperty("--sc-hover", dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)");
      panel.style.setProperty("--sc-accent", "#2196F3");
    }
    function positionPanel(panel, btn) {
      const rect = btn.getBoundingClientRect();
      const gap = 6;
      const panelWidth = Math.min(360, window.innerWidth - 16);
      const panelHeight = panel.offsetHeight || 340;
      let input = null;
      if (openInputGroup) {
        const textareas = openInputGroup.querySelectorAll("textarea");
        for (const ta of textareas) {
          if (isChatInput(ta) && ta.getBoundingClientRect().height > 0) {
            input = ta;
            break;
          }
        }
        if (!input) input = textareas[0] || null;
      }
      const anchorRect = input ? input.getBoundingClientRect() : rect;
      const availableAbove = anchorRect.top - gap - 8;
      const maxHeight = Math.max(0, Math.min(420, availableAbove, window.innerHeight - 16));
      panel.style.maxHeight = maxHeight + "px";
      const top = anchorRect.top - gap - Math.min(panelHeight, maxHeight);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
      panel.style.width = panelWidth + "px";
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    }
    function findMentionsComponent(textarea) {
      const fiberKey = Object.keys(textarea).find(
        (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")
      );
      if (!fiberKey) return null;
      let fiber = textarea[fiberKey];
      while (fiber) {
        const node = fiber.stateNode;
        if (node && typeof node.executeOnChange === "function" && (node.inputElement === textarea || typeof node.handleChange === "function" && typeof node.addMention === "function")) {
          return node;
        }
        fiber = fiber.return;
      }
      return null;
    }
    function waitForMentionsValue(component, textarea, expected, timeout = 300) {
      return new Promise((resolve) => {
        if (component.props.value === expected || textarea.value === expected) {
          resolve(true);
          return;
        }
        const started2 = Date.now();
        const timer = setInterval(() => {
          if (component.props.value === expected || textarea.value === expected) {
            clearInterval(timer);
            resolve(true);
          } else if (Date.now() - started2 > timeout) {
            clearInterval(timer);
            resolve(false);
          }
        }, 5);
      });
    }
    async function insertViaMentions(component, textarea, code) {
      const currentValue = typeof component.props.value === "string" ? component.props.value : textarea.value || "";
      const stateStart = component.state && typeof component.state.selectionStart === "number" ? component.state.selectionStart : typeof textarea.selectionStart === "number" ? textarea.selectionStart : 0;
      const stateEnd = component.state && typeof component.state.selectionEnd === "number" ? component.state.selectionEnd : stateStart;
      const start2 = Math.max(0, Math.min(stateStart, currentValue.length));
      const end = Math.max(start2, Math.min(stateEnd, currentValue.length));
      const before = currentValue.slice(0, start2);
      const after = currentValue.slice(end);
      const leading = before.length > 0 && !/\s$/.test(before) ? " " : "";
      const trailing = " ";
      const text = leading + code + trailing;
      const next = currentValue.slice(0, start2) + text + currentValue.slice(end);
      const pos = start2 + text.length;
      component.setState({
        selectionStart: pos,
        selectionEnd: pos,
        setSelectionAfterMentionChange: true
      });
      component.executeOnChange({ target: { value: next } }, next, next, []);
      await waitForMentionsValue(component, textarea, next);
    }
    function insertViaDom(textarea, code) {
      return new Promise((resolve) => {
        textarea.focus();
        const start2 = typeof textarea.selectionStart === "number" ? textarea.selectionStart : 0;
        const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start2;
        textarea.setSelectionRange(start2, end);
        textarea.dispatchEvent(new Event("select", { bubbles: true }));
        setTimeout(() => {
          try {
            if (!textarea.isConnected) return;
            textarea.focus();
            const currentStart = typeof textarea.selectionStart === "number" ? textarea.selectionStart : start2;
            const currentEnd = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : end;
            const value = textarea.value || "";
            const before = value.slice(0, currentStart);
            const after = value.slice(currentEnd);
            const leading = before.length > 0 && !/\s$/.test(before) ? " " : "";
            const trailing = " ";
            const text = leading + code + trailing;
            textarea.setSelectionRange(currentStart, currentEnd);
            const inserted = document.execCommand("insertText", false, text);
            if (!inserted) {
              textarea.setRangeText(text, currentStart, currentEnd, "preserve");
              textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }
            const pos = currentStart + text.length;
            textarea.setSelectionRange(pos, pos);
            textarea.dispatchEvent(new Event("select", { bubbles: true }));
            textarea.focus();
          } catch (e) {
          }
          resolve();
        }, 0);
      });
    }
    function insertCode(textarea, code) {
      if (!textarea) return Promise.resolve();
      insertQueue = insertQueue.then(() => {
        const component = findMentionsComponent(textarea);
        if (component) {
          console.log("[SC-EmojiPicker] using react-mentions insertion path.");
          return insertViaMentions(component, textarea, code).catch(() => insertViaDom(textarea, code));
        }
        console.warn("[SC-EmojiPicker] react-mentions component not found, using DOM fallback.");
        return insertViaDom(textarea, code);
      });
      return insertQueue;
    }
    function closeVariantPopup() {
      if (variantPopup) variantPopup.remove();
      variantPopup = null;
      document.removeEventListener("pointerdown", onVariantPopupPointerDown, true);
      document.removeEventListener("keydown", onVariantPopupKeyDown);
    }
    function onVariantPopupPointerDown(e) {
      if (!variantPopup) return;
      if (variantPopup.contains(e.target)) return;
      closeVariantPopup();
    }
    function onVariantPopupKeyDown(e) {
      if (e.key === "Escape") closeVariantPopup();
    }
    function openVariantPopup(item, anchor, getTextarea, afterInsert) {
      closeVariantPopup();
      const popup = document.createElement("div");
      popup.className = "sc-chat-emoji-variant-popup";
      popup.style.cssText = "position:fixed;z-index:2147483647;display:flex;flex-wrap:wrap;gap:4px;padding:6px;max-width:190px;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,0.35);";
      applyPanelTheme(popup);
      const choices = [item, ...item.variants || []];
      choices.forEach((choice) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = choice.emoji || choice.code;
        btn.title = choice.name || choice.code;
        btn.style.cssText = "width:34px;height:34px;padding:0;border:1px solid var(--sc-border);border-radius:4px;background:var(--sc-input-bg);color:var(--sc-fg);cursor:pointer;font-size:22px;line-height:1;";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          rememberRecent(choice.code);
          if (afterInsert) afterInsert();
          insertCode(getTextarea(), choice.code);
          closeVariantPopup();
        });
        popup.appendChild(btn);
      });
      document.body.appendChild(popup);
      variantPopup = popup;
      requestAnimationFrame(() => {
        const rect = anchor.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();
        let top = rect.bottom + 6;
        if (top + popupRect.height > window.innerHeight - 8) {
          top = Math.max(8, rect.top - popupRect.height - 6);
        }
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupRect.width - 8));
        popup.style.top = top + "px";
        popup.style.left = left + "px";
      });
      document.addEventListener("pointerdown", onVariantPopupPointerDown, true);
      document.addEventListener("keydown", onVariantPopupKeyDown);
    }
    function buildItemButton(item, getTextarea, afterInsert) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-chat-emoji-picker-item";
      btn.title = item.name ? `${item.code} ${item.name}` : item.code;
      const hasVariants = !!(item.variants && item.variants.length > 0);
      btn.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:52px;height:46px;padding:3px;border:1px solid transparent;border-radius:5px;background:transparent;cursor:pointer;font-size:9px;line-height:1;color:var(--sc-fg);touch-action:manipulation;";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "var(--sc-hover)";
        btn.style.borderColor = "var(--sc-accent)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
        btn.style.borderColor = "transparent";
      });
      if (item.emoji) {
        const emojiSpan = document.createElement("span");
        emojiSpan.textContent = item.emoji;
        emojiSpan.style.cssText = "width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;pointer-events:none;";
        btn.appendChild(emojiSpan);
      } else if (item.image) {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = item.name || item.code;
        img.loading = "lazy";
        img.style.cssText = "width:24px;height:24px;object-fit:contain;pointer-events:none;";
        img.addEventListener("error", () => img.remove());
        btn.appendChild(img);
      }
      const code = document.createElement("span");
      code.textContent = item.code;
      code.style.cssText = "max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      btn.appendChild(code);
      let pressTimer = null;
      let longPressTriggered = false;
      if (hasVariants) {
        btn.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          clearTimeout(pressTimer);
          longPressTriggered = false;
          pressTimer = setTimeout(() => {
            longPressTriggered = true;
            e.preventDefault();
            openVariantPopup(item, btn, getTextarea, afterInsert);
          }, 420);
        });
        ["pointerup", "pointerleave", "pointercancel"].forEach((type) => {
          btn.addEventListener(type, () => clearTimeout(pressTimer));
        });
        btn.addEventListener("contextmenu", (e) => e.preventDefault());
      }
      btn.addEventListener("click", (e) => {
        if (longPressTriggered) {
          longPressTriggered = false;
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        rememberRecent(item.code);
        if (afterInsert) afterInsert();
        insertCode(getTextarea(), item.code);
      });
      return btn;
    }
    function renderPanelContent(panel, items, inputGroup) {
      const search = panel.querySelector(".sc-chat-emoji-picker-search");
      const tabs = panel.querySelector(".sc-chat-emoji-picker-tabs");
      const grid = panel.querySelector(".sc-chat-emoji-picker-grid");
      const getTextarea = () => inputGroup.querySelector("textarea");
      const allItems = [].concat(items.special, items.resources, items.buildings, items.eggs, items.realms, items.other);
      const groupLabels = {
        recent: "\u6700\u8FD1",
        resources: "\u8D44\u6E90",
        buildings: "\u5EFA\u7B51",
        eggs: "\u5F69\u86CB",
        realms: "\u9886\u57DF",
        special: "\u7279\u6B8A",
        other: "\u5176\u5B83"
      };
      function recentItems() {
        const byCode = new Map(allItems.map((item) => [item.code, item]));
        return getRecentCodes().map((code) => byCode.get(code)).filter(Boolean);
      }
      let activeKey = recentItems().length > 0 ? "recent" : "resources";
      const PAGE_SIZE = 240;
      let visibleLimit = PAGE_SIZE;
      function getGroupItems(key) {
        if (key === "recent") return recentItems();
        return items[key] || [];
      }
      function renderTabs() {
        tabs.textContent = "";
        Object.entries(groupLabels).forEach(([key, label]) => {
          const tab = document.createElement("button");
          tab.type = "button";
          const active = key === activeKey;
          const count = getGroupItems(key).length;
          tab.textContent = label;
          tab.title = `${label} (${count})`;
          tab.style.cssText = "flex:0 0 auto;min-height:30px;padding:4px 10px;border:1px solid " + (active ? "var(--sc-accent)" : "var(--sc-border)") + ";border-radius:4px;background:" + (active ? "var(--sc-accent)" : "transparent") + ";color:" + (active ? "#fff" : "var(--sc-fg)") + ";cursor:pointer;font-size:12px;line-height:1.4;white-space:nowrap;box-sizing:border-box;";
          tab.addEventListener("click", () => {
            activeKey = key;
            search.value = "";
            visibleLimit = PAGE_SIZE;
            grid.scrollTop = 0;
            renderTabs();
            renderGrid();
          });
          tabs.appendChild(tab);
        });
      }
      function renderGrid() {
        const prevScroll = grid.scrollTop;
        grid.textContent = "";
        const q = search.value.trim().toLowerCase();
        const list = getGroupItems(activeKey).filter(
          (item) => !q || item.code.toLowerCase().includes(q) || (item.name || "").toLowerCase().includes(q)
        );
        const shown = list.slice(0, visibleLimit);
        if (list.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = activeKey === "recent" ? "\u8FD8\u6CA1\u6709\u6700\u8FD1\u4F7F\u7528\u7684\u8868\u60C5" : search.value.trim() ? `\u6CA1\u6709\u5339\u914D\u201C${search.value.trim()}\u201D\u7684\u8868\u60C5` : activeKey === "other" && items.other.length === 0 ? "\u5176\u5B83\u8868\u60C5\u6682\u672A\u52A0\u8F7D\u6210\u529F" : "\u8BE5\u5206\u7C7B\u6682\u65E0\u8868\u60C5";
          empty.style.cssText = "color:var(--sc-fg);opacity:0.75;font-size:12px;padding:16px;text-align:center;";
          grid.appendChild(empty);
          repositionPanel();
          return;
        }
        shown.forEach((item) => grid.appendChild(buildItemButton(item, getTextarea, () => {
          if (activeKey === "recent") renderGrid();
        })));
        if (list.length > shown.length) {
          const more = document.createElement("button");
          more.type = "button";
          more.textContent = `\u663E\u793A\u66F4\u591A (${list.length - shown.length})`;
          more.style.cssText = "grid-column:1 / -1;min-height:34px;margin-top:4px;border:1px solid var(--sc-border);border-radius:4px;background:var(--sc-input-bg);color:var(--sc-fg);cursor:pointer;font-size:12px;line-height:1.4;";
          more.addEventListener("click", () => {
            visibleLimit += PAGE_SIZE;
            renderGrid();
          });
          grid.appendChild(more);
        }
        grid.scrollTop = prevScroll;
        repositionPanel();
      }
      function repositionPanel() {
        if (openPanel === panel && openButton) {
          requestAnimationFrame(() => positionPanel(panel, openButton));
        }
      }
      search.addEventListener("input", () => {
        visibleLimit = PAGE_SIZE;
        renderGrid();
      });
      renderTabs();
      renderGrid();
    }
    function buildPanel(btn, inputGroup) {
      const panel = document.createElement("div");
      panel.className = "sc-chat-emoji-picker-panel";
      panel.style.cssText = "position:fixed;z-index:2147483646;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.35);";
      applyPanelTheme(panel);
      const hint = document.createElement("div");
      hint.className = "sc-chat-emoji-picker-hint";
      hint.textContent = "\u8BE5\u529F\u80FD\u6D4B\u8BD5\u4E2D\uFF0C\u5982\u51FA\u73B0\u95EE\u9898\u8BF7\u53CD\u9988\u5E76\u8BBE\u7F6E\u4E2D\u5173\u95ED\u8BE5\u529F\u80FD";
      hint.style.cssText = "padding:6px 8px;font-size:11px;line-height:1.4;color:var(--sc-fg);opacity:0.75;border-bottom:1px solid var(--sc-border);";
      const header = document.createElement("div");
      header.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--sc-border);";
      const search = document.createElement("input");
      search.type = "search";
      search.className = "sc-chat-emoji-picker-search";
      search.placeholder = "\u641C\u7D22\u8868\u60C5";
      search.style.cssText = "flex:1;min-width:0;height:30px;padding:4px 8px;border:1px solid var(--sc-border);border-radius:4px;background:var(--sc-input-bg);color:var(--sc-fg);font-size:13px;outline:none;";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.textContent = "\xD7";
      closeBtn.title = "\u5173\u95ED";
      closeBtn.style.cssText = "flex:0 0 30px;width:30px;height:30px;padding:0;border:1px solid var(--sc-border);border-radius:4px;background:transparent;color:var(--sc-fg);cursor:pointer;font-size:18px;line-height:1;";
      closeBtn.addEventListener("click", () => closePanel());
      const tabs = document.createElement("div");
      tabs.className = "sc-chat-emoji-picker-tabs";
      tabs.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:8px 8px 4px;";
      const grid = document.createElement("div");
      grid.className = "sc-chat-emoji-picker-grid";
      grid.style.cssText = "flex:1;overflow:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px;align-content:start;";
      const loading = document.createElement("div");
      loading.textContent = "\u52A0\u8F7D\u8868\u60C5\u4E2D...";
      loading.style.cssText = "color:var(--sc-fg);opacity:0.75;font-size:12px;padding:16px;text-align:center;";
      grid.appendChild(loading);
      header.append(search, closeBtn);
      panel.append(hint, header, tabs, grid);
      loadEmojiData().then((items) => {
        if (!panel.isConnected) return;
        renderPanelContent(panel, items, inputGroup);
      }).catch(() => {
        if (!panel.isConnected) return;
        grid.textContent = "";
        const error = document.createElement("div");
        error.textContent = "\u8868\u60C5\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u91CD\u8BD5";
        error.style.cssText = "color:var(--sc-fg);opacity:0.8;font-size:12px;padding:16px;text-align:center;";
        grid.appendChild(error);
        if (openPanel === panel && openButton) {
          requestAnimationFrame(() => positionPanel(panel, openButton));
        }
      });
      return panel;
    }
    function ensureButton(inputGroup) {
      if (inputGroup.dataset.scEmojiPickerGroup === "1") return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sc-chat-emoji-picker-btn";
      btn.setAttribute("data-sc-emoji-picker-added", "1");
      btn._inputGroup = inputGroup;
      btn.title = "\u9009\u62E9\u8868\u60C5";
      btn.textContent = "\u{1F642}";
      btn.style.cssText = "position:fixed;z-index:2147483645;display:flex;align-items:center;justify-content:center;width:34px;height:34px;min-width:34px;max-width:34px;min-height:34px;max-height:34px;padding:0;margin:0;overflow:hidden;border:1px solid rgba(128,128,128,0.55);border-radius:4px;background:transparent;color:inherit;cursor:pointer;font-size:18px;line-height:1;box-sizing:border-box;";
      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(128,128,128,0.18)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "transparent";
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePanel(btn, inputGroup);
      });
      inputGroup.dataset.scEmojiPickerGroup = "1";
      document.body.appendChild(btn);
      positionButton(btn, inputGroup);
    }
    function positionButton(btn, inputGroup) {
      const sendBtn = inputGroup.querySelector(".input-group-btn button");
      const anchor = sendBtn || inputGroup.querySelector(".input-group-btn") || inputGroup;
      const rect = anchor.getBoundingClientRect();
      if (sendBtn) {
        btn.style.left = Math.max(4, rect.left - 42) + "px";
        btn.style.top = Math.max(4, rect.bottom - 34) + "px";
      } else {
        btn.style.left = Math.max(4, rect.right - 42) + "px";
        btn.style.top = Math.max(4, rect.bottom - 34) + "px";
      }
    }
    function updateButtonPositions() {
      document.querySelectorAll(BUTTON_SELECTOR).forEach((btn) => {
        const group = btn._inputGroup;
        if (!group || !group.isConnected) {
          if (group) delete group.dataset.scEmojiPickerGroup;
          btn.remove();
          return;
        }
        positionButton(btn, group);
      });
    }
    function stopLayoutObserver() {
      if (layoutObserver) {
        layoutObserver.disconnect();
        layoutObserver = null;
      }
      if (layoutTimer) {
        clearInterval(layoutTimer);
        layoutTimer = null;
      }
    }
    function startLayoutObserver() {
      stopLayoutObserver();
      layoutTimer = setInterval(() => {
        if (openPanel && openButton) positionPanel(openPanel, openButton);
      }, 250);
      layoutObserver = new MutationObserver(() => {
        if (openPanel && openButton) {
          requestAnimationFrame(() => positionPanel(openPanel, openButton));
        }
      });
      const seen = /* @__PURE__ */ new Set();
      let el = openInputGroup;
      while (el && !seen.has(el)) {
        layoutObserver.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
        seen.add(el);
        el = el.parentElement;
      }
      const textareas = openInputGroup.querySelectorAll("textarea");
      for (const textarea of textareas) {
        layoutObserver.observe(textarea, { attributes: true, attributeFilter: ["class", "style"] });
      }
    }
    function closePanel() {
      stopLayoutObserver();
      closeVariantPopup();
      if (openPanel) openPanel.remove();
      openPanel = null;
      openButton = null;
      openInputGroup = null;
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    }
    function onPointerDown(e) {
      if (variantPopup && variantPopup.contains(e.target)) return;
      if (!openPanel || !openButton) return;
      if (openPanel.contains(e.target) || openButton.contains(e.target)) return;
      closePanel();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        if (variantPopup) closeVariantPopup();
        else closePanel();
      }
    }
    function onViewportChange() {
      if (openPanel && openButton) positionPanel(openPanel, openButton);
    }
    function togglePanel(btn, inputGroup) {
      if (openButton === btn && openPanel) {
        closePanel();
        return;
      }
      closePanel();
      if (!inputGroup.querySelector("textarea")) return;
      const panel = buildPanel(btn, inputGroup);
      document.body.appendChild(panel);
      openPanel = panel;
      openButton = btn;
      openInputGroup = inputGroup;
      startLayoutObserver();
      requestAnimationFrame(() => positionPanel(panel, btn));
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("keydown", onKeyDown);
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, true);
      const search = panel.querySelector(".sc-chat-emoji-picker-search");
      if (search) setTimeout(() => search.focus(), 0);
    }
    function removeAll() {
      closePanel();
      document.querySelectorAll(BUTTON_SELECTOR).forEach((btn) => {
        if (btn._inputGroup) delete btn._inputGroup.dataset.scEmojiPickerGroup;
        btn.remove();
      });
    }
    function requestScan() {
      if (scanTimer) return;
      scanTimer = setTimeout(() => {
        scanTimer = null;
        scan();
      }, 150);
    }
    function scan() {
      if (!isEnabled()) {
        removeAll();
        return;
      }
      updateButtonPositions();
      document.querySelectorAll("textarea").forEach((textarea) => {
        if (!isChatInput(textarea)) return;
        const inputGroup = textarea.closest(".input-group");
        if (inputGroup) ensureButton(inputGroup);
      });
      updateButtonPositions();
    }
    function start() {
      if (started) return;
      if (!document.body) {
        setTimeout(start, 200);
        return;
      }
      started = true;
      new MutationObserver(() => requestScan()).observe(document.body, { childList: true, subtree: true });
      new MutationObserver(() => {
        if (lastUrl !== location.href) {
          lastUrl = location.href;
          closePanel();
          setTimeout(scan, 400);
        }
      }).observe(document.body, { childList: true, subtree: true });
      const themeObserver = new MutationObserver(() => {
        if (openPanel) applyPanelTheme(openPanel);
      });
      [document.documentElement, document.body].forEach((target) => {
        themeObserver.observe(target, { attributes: true, attributeFilter: ["class", "style"] });
      });
      buttonPositionTimer = setInterval(updateButtonPositions, 300);
      window.addEventListener("scroll", updateButtonPositions, true);
      window.addEventListener("resize", updateButtonPositions);
      window.scChatEmojiPickerRefresh = () => {
        removeAll();
        scan();
      };
      scan();
      loadEmojiData().catch(() => {
      });
    }
    setTimeout(start, 300);
  })();

  // src/features/autoUpdaters.js
  var ConstantsAutoUpdater = (() => {
    const STORAGE_KEY = "SimcompaniesConstantsData";
    const ONE_HOUR = 60 * 60 * 1e3;
    const needsUpdate = () => {
      const dataStr = localStorage.getItem(STORAGE_KEY);
      if (!dataStr) return true;
      try {
        const data2 = JSON.parse(dataStr);
        const lastTime = new Date(data2.timestamp).getTime();
        const now = Date.now();
        return now - lastTime > ONE_HOUR;
      } catch (e) {
        return true;
      }
    };
    const update = async () => {
      try {
        const data2 = await constantsData.initialize();
        Storage.save("constants", data2);
      } catch (err) {
        console.error("[ConstantsAutoUpdater] \u57FA\u672C\u6570\u636E\u66F4\u65B0\u5931\u8D25", err);
      }
    };
    const checkAndUpdate = () => {
      if (needsUpdate()) {
        update();
      } else {
      }
    };
    return { checkAndUpdate };
  })();
  var RegionAutoUpdater = (() => {
    const ONE_HOUR = 60 * 60 * 1e3;
    const needsUpdate = (realmId) => {
      const key = `SimcompaniesRetailCalculation_${realmId}`;
      const dataStr = localStorage.getItem(key);
      if (!dataStr) return true;
      try {
        const data2 = JSON.parse(dataStr);
        const lastTime = new Date(data2.timestamp).getTime();
        const weatherUntil = new Date(data2.sellingSpeedMultiplier.Until).getTime();
        const now = Date.now();
        const ONE_HOUR2 = 60 * 60 * 1e3;
        if (now - lastTime > ONE_HOUR2) return true;
        if (now > weatherUntil) return true;
        const nowInBeijing = new Date(now + 8 * 60 * 60 * 1e3);
        const todayBeijing = new Date(nowInBeijing.toISOString().slice(0, 10));
        const morning745 = new Date(todayBeijing.getTime() + 7 * 60 * 60 * 1e3 + 45 * 60 * 1e3).getTime();
        const todayBeijing1 = new Date(nowInBeijing.toISOString().slice(0, 10));
        const executives2201 = new Date(todayBeijing1.getTime() + 22 * 60 * 60 * 1e3 + 1 * 60 * 1e3).getTime();
        const currentWeekday = nowInBeijing.getUTCDay();
        const daysUntilFriday = (5 - currentWeekday + 7) % 7;
        const fridayDate = new Date(todayBeijing.getTime() + daysUntilFriday * 24 * 60 * 60 * 1e3);
        const friday2301 = new Date(fridayDate.getTime() + 23 * 60 * 60 * 1e3 + 1 * 60 * 1e3).getTime();
        const lastTimeInBeijing = lastTime + 8 * 60 * 60 * 1e3;
        if (now >= morning745 && lastTimeInBeijing < morning745) {
          return true;
        }
        if (now >= executives2201 && lastTimeInBeijing < executives2201) {
          return true;
        }
        if (now >= friday2301 && lastTimeInBeijing < friday2301) {
          return true;
        }
        return false;
      } catch (e) {
        return true;
      }
    };
    const update = async (realmId) => {
      try {
        let data2;
        data2 = await RegionData.fetchFullRegionData();
        Storage.save("region", data2);
      } catch (err) {
        console.error(`[RegionAutoUpdater] \u9886\u57DF\u6570\u636E\uFF08${realmId}\uFF09\u66F4\u65B0\u5931\u8D25`, err);
      }
    };
    const checkAndUpdate = (realmId) => {
      if (realmId === null) {
        console.warn("[RegionAutoUpdater] \u9875\u9762\u4E0A\u65E0\u6CD5\u8BC6\u522B realmId");
        return;
      }
      if (needsUpdate(realmId)) {
        update(realmId);
      } else {
      }
    };
    return { checkAndUpdate };
  })();

  // src/features/pageModuleConfig.js
  (function() {
    const PAGE_ACTIONS_CONFIG_KEY = "SC_PageActions_Settings";
    registerExportInfo({
      name: "\u9875\u9762\u529F\u80FD\u5F00\u5173\u8BBE\u7F6E",
      scope: "global",
      keys: [PAGE_ACTIONS_CONFIG_KEY]
    });
    window.isPageModuleEnabled = (key) => {
      try {
        const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY);
        if (stored === null) return true;
        const config = JSON.parse(stored);
        return config[key] !== false;
      } catch (e) {
        return true;
      }
    };
    window.savePageModuleEnabled = (key, isEnabled) => {
      try {
        const stored = localStorage.getItem(PAGE_ACTIONS_CONFIG_KEY) || "{}";
        const config = JSON.parse(stored);
        config[key] = isEnabled;
        localStorage.setItem(PAGE_ACTIONS_CONFIG_KEY, JSON.stringify(config));
      } catch (e) {
        console.error("\u4FDD\u5B58\u914D\u7F6E\u5931\u8D25", e);
      }
    };
  })();

  // src/index.js
  (function() {
    "use strict";
    let hasNewVersion = false;
    let latestVersion = null;
    let { localVersion, SCXXCS: SCXXCS5, PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL5, RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT5 } = state;
    registerExportInfo({
      name: "\u9762\u677F\u4E0E\u5168\u5C40\u8BBE\u7F6E",
      scope: "global",
      keys: ["SC_PanelPosition", "mp_inputPercent", "sc_autoMaxPPHPL_ignored_version"]
    });
    registerExportInfo({
      name: "\u5E93\u5B58/\u5408\u540C/\u5E02\u573A\u8BA1\u7B97\u7ED3\u679C",
      scope: "realm",
      keys: (realmId) => {
        if (realmId === null) return [];
        try {
          const raw = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
          const src = raw ? JSON.parse(raw) : null;
          const companyId = src && src.companyId;
          if (companyId == null) return [];
          return [
            `wareHouse-${companyId}`,
            `contractsOutgoing-${companyId}`,
            `contractsIncoming-${companyId}`,
            `marketOrders-${companyId}`
          ];
        } catch (e) {
          return [];
        }
      }
    });
    let zn, lwe;
    let size, acceleration, economyState, resource, salesModifierWithRecreationBonus, skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, cogs, quality, quantity;
    const Ul = (overhead, skillCOO2) => {
      const r = overhead || 1;
      return r - (r - 1) * skillCOO2 / 100;
    };
    const wv = (e, t, r) => {
      return r === null ? lwe[e][t] : lwe[e][t].quality[r];
    };
    const Upt = (e, t, r, n) => t + (e + n) / r;
    const Hpt = (e, t, r, n, a) => {
      const o = (n + e) / ((t - a) * (t - a));
      return e - (r - t) * (r - t) * o;
    };
    const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
    const Bpt = (e, t, r, n, a, o) => {
      const g = RETAIL_ADJUSTMENT5[e] ?? 1;
      const s = Math.min(Math.max(2 - n, 0), 2), l = Math.max(0.9, s / 2 + 0.5), c = r / 12;
      const d = PROFIT_PER_BUILDING_LEVEL5 * (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) * g * (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) + (t.modeledStoreWages ?? 0) * SCXXCS5;
      const h = t.modeledUnitsSoldAnHour * l;
      const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
      const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
      return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
    };
    const zL = (buildingKind2, modeledData, quantity2, salesModifier, price, qOverride, saturation2, acc, size2, weather) => {
      const u = Bpt(buildingKind2, modeledData, qOverride, saturation2, quantity2, price);
      if (u <= 0) return NaN;
      const d = u / acc / size2;
      let p = d - d * salesModifier / 100;
      return weather && (p /= weather.sellingSpeedMultiplier), p;
    };
    window.__SC_Network = Network2;
    const PanelUI = (() => {
      let panelElement = null;
      const statusElements = {};
      let needsPositionRecalc = true;
      let intendedLeft = null;
      let intendedBottom = null;
      const typeDisplayNames = {
        r1: "R1",
        r2: "R2",
        constants: "\u57FA\u672C"
      };
      const injectStyles = () => {
        const style = document.createElement("style");
        style.id = "sc-panel-dynamic-styles";
        style.textContent = `
            .SimcompaniesRetailCalculation-mini-panel {
                position: fixed;
                z-index: 9999;
                font-family: Arial, sans-serif;
            }
            .SimcompaniesRetailCalculation-trigger-btn {
                width: 32px;
                height: 32px;
                background: #4CAF50;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 18px;
                user-select: none;
                -webkit-user-select: none;
                line-height: 1;
            }
            .SimcompaniesRetailCalculation-panel-content {
                display: none;
                position: absolute;
                bottom: 40px;
                left: 0;
                background: var(--sc-panel-bg, rgba(40,40,40,0.95));
                border-radius: 4px;
                padding: 8px;
                min-width: min(260px, calc(100vw - 26px));
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 100px);
                overflow-y: auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                color: var(--sc-panel-fg, #efefef);
            }
            .SimcompaniesRetailCalculation-data-row {
                margin: 6px 0;
                font-size: 13px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .SimcompaniesRetailCalculation-region-label {
                color: var(--sc-panel-label, #BDBDBD);
                min-width: 70px;
            }
            .SimcompaniesRetailCalculation-region-status {
                font-family: monospace;
                margin-left: 10px;
                text-align: right;
                flex-grow: 1;
            }
            .SimcompaniesRetailCalculation-btn-group {
                margin-top: 8px;
                display: grid;
                gap: 6px;
            }
            .SimcompaniesRetailCalculation-action-btn {
                background: #2196F3;
                border: none;
                color: white;
                padding: 6px 10px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }
            .SimcompaniesRetailCalculation-action-btn:disabled {
                background: #607D8B;
                cursor: not-allowed;
            }
            .SimcompaniesRetailCalculation-no-data { color: #f44336; }
            .SimcompaniesRetailCalculation-has-data { color: #4CAF50; }

            /* 1. \u9ED8\u8BA4\u72B6\u6001\uFF1A\u9690\u85CF\u4E8C\u7EA7\u83DC\u5355 */
            #secondary-menu-container {
                display: none;
            }

            /* 2. \u8054\u52A8\u903B\u8F91\uFF1A\u5F53 content \u62E5\u6709 show-settings \u7C7B\u65F6 */
            /* \u9690\u85CF\u4E00\u7EA7\u83DC\u5355 */
            .SimcompaniesRetailCalculation-panel-content.show-settings #main-menu-container {
                display: none;
            }

            /* \u663E\u793A\u4E8C\u7EA7\u83DC\u5355 */
            .SimcompaniesRetailCalculation-panel-content.show-settings #secondary-menu-container {
                display: block;
            }
        `;
        document.head.appendChild(style);
      };
      const showSaturationTable = () => {
        const realmId = getRealmIdFromLink();
        if (realmId === null) return alert("\u672A\u8BC6\u522B\u5230 realmId\uFF01");
        const dataStr = localStorage.getItem(`SimcompaniesRetailCalculation_${realmId}`);
        if (!dataStr) return alert(`\u6CA1\u6709\u627E\u5230\u9886\u57DF ${realmId} \u6570\u636E\uFF0C\u8BF7\u5148\u66F4\u65B0\uFF01`);
        const data2 = JSON.parse(dataStr);
        SaturationDisplay.toggle(data2);
      };
      const initAutoAmountToggle = () => {
        const btn = document.getElementById("auto-amount-toggle-btn");
        if (!btn) return;
        if (typeof window.isAutoAmountEnabled !== "function") {
          btn.textContent = "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: (\u52A0\u8F7D\u4E2D...)";
          btn.style.backgroundColor = "#607D8B";
          return;
        }
        const updateToggleBtn = () => {
          const isEnabled = window.isAutoAmountEnabled();
          btn.textContent = isEnabled ? "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: \u{1F7E2} \u5DF2\u542F\u7528" : "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: \u{1F534} \u5DF2\u7981\u7528";
          btn.style.backgroundColor = isEnabled ? "#4CAF50" : "#f44336";
        };
        updateToggleBtn();
        btn.onclick = () => {
          if (typeof window.isAutoAmountEnabled === "function" && typeof window.saveAutoAmountEnabled === "function" && typeof window.initAutoAmountButtons === "function") {
            const isCurrentlyEnabled = window.isAutoAmountEnabled();
            const newEnabledState = !isCurrentlyEnabled;
            window.saveAutoAmountEnabled(newEnabledState);
            window.initAutoAmountButtons(true);
            updateToggleBtn();
          } else {
            alert("\u9519\u8BEF\uFF1A\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F\u63A7\u5236\u51FD\u6570\u672A\u627E\u5230\uFF01");
          }
        };
      };
      const refreshPageActionToggles2 = () => {
        if (!panelElement) return;
        const configKey = "SC_PageActions_Settings";
        let config = {};
        try {
          config = JSON.parse(localStorage.getItem(configKey)) || {};
        } catch (e) {
          config = {};
        }
        const toggles = panelElement.querySelectorAll(".page-action-toggle");
        toggles.forEach((btn) => {
          const key = btn.dataset.key;
          const label = btn.dataset.label;
          if (!key || !label) return;
          const defaultEnabled = btn.dataset.defaultEnabled !== "false";
          const isEnabled = config[key] !== void 0 ? config[key] !== false : defaultEnabled;
          btn.textContent = `${label}: ${isEnabled ? "\u{1F7E2} \u5DF2\u542F\u7528" : "\u{1F534} \u5DF2\u7981\u7528"}`;
          btn.style.backgroundColor = isEnabled ? "#4CAF50" : "#f44336";
        });
      };
      const PANEL_POS_KEY = "SC_PanelPosition";
      const getSavedPos = () => {
        try {
          const raw = localStorage.getItem(PANEL_POS_KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) {
        }
        return null;
      };
      const savePos = (left, bottom) => {
        try {
          localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left, bottom }));
        } catch (e) {
        }
      };
      const resetPanelPosition = () => {
        localStorage.removeItem(PANEL_POS_KEY);
        intendedLeft = 10;
        intendedBottom = 55;
        if (panelElement) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const btnW = panelElement.offsetWidth || 32;
          const btnH = panelElement.offsetHeight || 32;
          const intendedTop = vh - intendedBottom - btnH;
          const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
          const top = Math.max(0, Math.min(vh - btnH, intendedTop));
          panelElement.style.left = left + "px";
          panelElement.style.bottom = vh - top - btnH + "px";
          panelElement.style.top = "auto";
        }
      };
      const adjustPanelPosition = (contentEl) => {
        contentEl.style.top = "";
        contentEl.style.bottom = "";
        contentEl.style.left = "";
        contentEl.style.right = "";
        contentEl.style.maxHeight = "";
        contentEl.style.maxWidth = "";
        contentEl.style.overflowY = "";
        void contentEl.offsetHeight;
        const triggerEl = panelElement.querySelector(".SimcompaniesRetailCalculation-trigger-btn");
        if (!triggerEl) return;
        const margin = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const triggerRect = triggerEl.getBoundingClientRect();
        const triggerH = triggerRect.height;
        const availTop = triggerRect.top - margin;
        const availBottom = vh - triggerRect.bottom - margin;
        const availLeft = triggerRect.left - margin;
        const availRight = vw - triggerRect.right - margin;
        contentEl.style.maxHeight = Math.max(availTop, availBottom, 100) + "px";
        contentEl.style.overflowY = "auto";
        contentEl.style.maxWidth = Math.max(triggerRect.width + Math.max(availLeft, availRight), vw - margin * 2, 260) + "px";
        const gap = triggerH;
        contentEl.style.top = "auto";
        contentEl.style.bottom = gap + "px";
        void contentEl.offsetHeight;
        let rect = contentEl.getBoundingClientRect();
        const neededH = Math.min(rect.height, parseFloat(contentEl.style.maxHeight));
        if (rect.top < margin && availBottom >= neededH) {
          contentEl.style.bottom = "auto";
          contentEl.style.top = gap + "px";
        } else if (availTop < neededH && availBottom >= neededH) {
          contentEl.style.bottom = "auto";
          contentEl.style.top = gap + "px";
        } else {
          contentEl.style.top = "auto";
          contentEl.style.bottom = gap + "px";
        }
        const panelRect = panelElement.getBoundingClientRect();
        const btnCenterX = triggerRect.left + triggerRect.width / 2;
        if (btnCenterX > vw / 2) {
          contentEl.style.left = "auto";
          contentEl.style.right = panelRect.right - triggerRect.right + "px";
        } else {
          contentEl.style.right = "auto";
          contentEl.style.left = triggerRect.left - panelRect.left + "px";
        }
        void contentEl.offsetHeight;
        rect = contentEl.getBoundingClientRect();
        if (rect.left < margin) {
          contentEl.style.left = margin + "px";
          contentEl.style.right = "auto";
        }
        if (rect.right > vw - margin) {
          contentEl.style.right = vw - rect.right + "px";
          contentEl.style.left = "auto";
        }
        if (rect.top < margin) {
          contentEl.style.bottom = "auto";
          contentEl.style.top = margin + "px";
        }
      };
      const createPanel = () => {
        const panel = document.createElement("div");
        panel.className = "SimcompaniesRetailCalculation-mini-panel";
        const trigger = document.createElement("button");
        trigger.className = "SimcompaniesRetailCalculation-trigger-btn";
        trigger.textContent = "\u2261";
        let dragState = null;
        let longPressTimer = null;
        const clearLongPress = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        };
        const getClientPos = (e) => {
          if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
          return { x: e.clientX, y: e.clientY };
        };
        const getPanelBounds = () => {
          const w = panel.offsetWidth || 40;
          const h = panel.offsetHeight || 40;
          return { w, h };
        };
        const clampPosition = (left, top) => {
          const { w, h } = getPanelBounds();
          return {
            left: Math.max(0, Math.min(window.innerWidth - w, left)),
            top: Math.max(0, Math.min(window.innerHeight - h, top))
          };
        };
        const saveDragPosition = () => {
          const rect = panel.getBoundingClientRect();
          intendedLeft = Math.round(rect.left);
          intendedBottom = Math.round(window.innerHeight - rect.bottom);
          savePos(intendedLeft, intendedBottom);
        };
        const applyClampedPosition = () => {
          if (intendedLeft === null || !panel) return;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const btnW = panel.offsetWidth || 32;
          const btnH = panel.offsetHeight || 32;
          const intendedTop = vh - intendedBottom - btnH;
          const left = Math.max(0, Math.min(vw - btnW, intendedLeft));
          const top = Math.max(0, Math.min(vh - btnH, intendedTop));
          panel.style.left = left + "px";
          panel.style.bottom = vh - top - btnH + "px";
          panel.style.top = "auto";
        };
        const savedPos = getSavedPos();
        if (savedPos) {
          intendedLeft = savedPos.left;
          intendedBottom = savedPos.bottom;
        } else {
          intendedLeft = 10;
          intendedBottom = 55;
        }
        applyClampedPosition();
        window.addEventListener("resize", applyClampedPosition);
        const onDragStart = (e) => {
          if (e.button !== void 0 && e.button !== 0) return;
          const isTouch = !!e.touches;
          const pos = getClientPos(e);
          const rect = panel.getBoundingClientRect();
          const state2 = {
            startX: pos.x,
            startY: pos.y,
            origLeft: rect.left,
            origTop: rect.top,
            isDragging: false,
            readyToDrag: !isTouch
            // 鼠标立即生效，触摸需等长按
          };
          dragState = state2;
          if (isTouch) {
            clearLongPress();
            longPressTimer = setTimeout(() => {
              state2.readyToDrag = true;
              longPressTimer = null;
            }, 500);
          }
        };
        const onDragMove = (e) => {
          if (!dragState) return;
          const pos = getClientPos(e);
          const dx = pos.x - dragState.startX;
          const dy = pos.y - dragState.startY;
          if (!dragState.readyToDrag) {
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
              clearLongPress();
              dragState = null;
            }
            return;
          }
          dragState.isDragging = true;
          let newLeft = dragState.origLeft + dx;
          let newTop = dragState.origTop + dy;
          const clamped = clampPosition(newLeft, newTop);
          panel.style.left = clamped.left + "px";
          panel.style.top = clamped.top + "px";
          panel.style.bottom = "auto";
          if (e.cancelable) e.preventDefault();
        };
        const onDragEnd = () => {
          clearLongPress();
          if (!dragState) return;
          if (dragState.isDragging) {
            const rect = panel.getBoundingClientRect();
            const clamped = clampPosition(rect.left, rect.top);
            panel.style.left = clamped.left + "px";
            panel.style.top = clamped.top + "px";
            saveDragPosition();
            if (content.style.display === "block") {
              setTimeout(() => adjustPanelPosition(content), 50);
            } else {
              needsPositionRecalc = true;
            }
            trigger.dataset.dragged = "true";
            setTimeout(() => {
              trigger.dataset.dragged = "false";
            }, 100);
          }
          dragState = null;
        };
        trigger.addEventListener("mousedown", onDragStart);
        document.addEventListener("mousemove", onDragMove);
        document.addEventListener("mouseup", onDragEnd);
        trigger.addEventListener("touchstart", onDragStart, { passive: true });
        document.addEventListener("touchmove", onDragMove, { passive: false });
        document.addEventListener("touchend", onDragEnd);
        trigger.addEventListener("contextmenu", (e) => {
          e.preventDefault();
        });
        trigger.addEventListener("click", (e) => {
          if (trigger.dataset.dragged === "true") {
            e.stopPropagation();
            return;
          }
          togglePanel(e);
        });
        const content = document.createElement("div");
        content.className = "SimcompaniesRetailCalculation-panel-content";
        const createStatusRow = (type) => {
          const row = document.createElement("div");
          row.className = "SimcompaniesRetailCalculation-data-row";
          const label = document.createElement("span");
          label.className = "SimcompaniesRetailCalculation-region-label";
          label.textContent = `${typeDisplayNames[type]}\u6570\u636E\uFF1A`;
          const status = document.createElement("span");
          status.className = "SimcompaniesRetailCalculation-region-status";
          statusElements[type] = status;
          row.append(label, status);
          return row;
        };
        const switchMenu = (isSettings) => {
          content.classList.toggle("show-settings", isSettings);
          if (isSettings) {
            initAutoAmountToggle();
            refreshPageActionToggles2();
          }
        };
        const mainMenu = document.createElement("div");
        mainMenu.id = "main-menu-container";
        const secondaryMenu = document.createElement("div");
        secondaryMenu.id = "secondary-menu-container";
        const createActionButton = (text, type) => {
          const btn = document.createElement("button");
          btn.className = "SimcompaniesRetailCalculation-action-btn";
          btn.textContent = text;
          btn.dataset.actionType = type;
          return btn;
        };
        const createPageActionToggle = (key, label, defaultEnabled = true) => {
          const btn = document.createElement("button");
          btn.className = "SimcompaniesRetailCalculation-action-btn page-action-toggle";
          btn.dataset.key = key;
          btn.dataset.label = label;
          btn.dataset.defaultEnabled = defaultEnabled ? "true" : "false";
          const updateUI = () => {
            refreshPageActionToggles2();
          };
          btn.onclick = (e) => {
            e.stopPropagation();
            const configKey = "SC_PageActions_Settings";
            const stored = localStorage.getItem(configKey) || "{}";
            let config = {};
            try {
              config = JSON.parse(stored);
            } catch (e2) {
            }
            const newState = config[key] === false;
            config[key] = newState;
            localStorage.setItem(configKey, JSON.stringify(config));
            updateUI();
            if (typeof window.scChatEmojiPickerRefresh === "function") {
              window.scChatEmojiPickerRefresh();
            }
          };
          const initialConfig = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
          const isEnabled = initialConfig[key] !== void 0 ? initialConfig[key] !== false : defaultEnabled;
          btn.textContent = `${label}: ${isEnabled ? "\u{1F7E2} \u5DF2\u542F\u7528" : "\u{1F534} \u5DF2\u7981\u7528"}`;
          btn.style.backgroundColor = isEnabled ? "#4CAF50" : "#f44336";
          return btn;
        };
        const CHAT_INPUT_HEIGHT_KEY = {
          desktop: "chatInputExpanderHeight",
          mobile: "chatInputExpanderHeightMobile"
        };
        const CHAT_INPUT_HEIGHT_DEFAULTS = { desktop: 130, mobile: 90 };
        const CHAT_INPUT_HEIGHT_RANGE = { min: 40 };
        const readChatInputHeight = (key, fallback) => {
          try {
            const config = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
            const value = parseInt(config[key], 10);
            return isFinite(value) ? value : fallback;
          } catch (e) {
            return fallback;
          }
        };
        const createChatInputHeightControls = () => {
          const row = document.createElement("div");
          row.className = "sc-chat-input-height-row";
          row.style.cssText = "display:grid;grid-template-columns:auto 64px auto;gap:6px;align-items:center;margin-top:6px;font-size:12px;color:var(--sc-panel-fg,#efefef);";
          const makeInput = (label, key, fallback) => {
            const labelSpan = document.createElement("span");
            labelSpan.textContent = label;
            labelSpan.style.cssText = "white-space:nowrap;line-height:24px;";
            const input = document.createElement("input");
            input.type = "number";
            input.min = CHAT_INPUT_HEIGHT_RANGE.min;
            input.step = 10;
            input.value = readChatInputHeight(key, fallback);
            input.style.cssText = "width:100%;height:24px;box-sizing:border-box;padding:2px 4px;border:1px solid #666;border-radius:3px;background:rgba(255,255,255,0.08);color:inherit;font-size:12px;";
            const unit = document.createElement("span");
            unit.textContent = "px";
            unit.style.cssText = "line-height:24px;";
            row.append(labelSpan, input, unit);
            return input;
          };
          const desktopInput = makeInput("\u684C\u9762\u7AEF\u9AD8\u5EA6:", CHAT_INPUT_HEIGHT_KEY.desktop, CHAT_INPUT_HEIGHT_DEFAULTS.desktop);
          const mobileInput = makeInput("\u79FB\u52A8\u7AEF\u9AD8\u5EA6:", CHAT_INPUT_HEIGHT_KEY.mobile, CHAT_INPUT_HEIGHT_DEFAULTS.mobile);
          const clampHeight = (value, fallback) => {
            const n = parseInt(value, 10);
            if (!isFinite(n)) return fallback;
            return Math.max(CHAT_INPUT_HEIGHT_RANGE.min, n);
          };
          const flashButton = (btn, activeText, activeColor, idleText, idleColor) => {
            if (btn._flashTimer) clearTimeout(btn._flashTimer);
            btn.textContent = activeText;
            btn.style.backgroundColor = activeColor;
            btn._flashTimer = setTimeout(() => {
              btn.textContent = idleText;
              btn.style.backgroundColor = idleColor;
            }, 1500);
          };
          const applyBtn = document.createElement("button");
          applyBtn.className = "SimcompaniesRetailCalculation-action-btn";
          applyBtn.textContent = "\u5E94\u7528";
          applyBtn.style.cssText = "flex:1;background:#2196F3;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:12px;";
          applyBtn.onclick = (e) => {
            e.stopPropagation();
            const configKey = "SC_PageActions_Settings";
            let config = {};
            try {
              config = JSON.parse(localStorage.getItem(configKey)) || {};
            } catch (err) {
              config = {};
            }
            config[CHAT_INPUT_HEIGHT_KEY.desktop] = clampHeight(desktopInput.value, CHAT_INPUT_HEIGHT_DEFAULTS.desktop);
            config[CHAT_INPUT_HEIGHT_KEY.mobile] = clampHeight(mobileInput.value, CHAT_INPUT_HEIGHT_DEFAULTS.mobile);
            localStorage.setItem(configKey, JSON.stringify(config));
            desktopInput.value = config[CHAT_INPUT_HEIGHT_KEY.desktop];
            mobileInput.value = config[CHAT_INPUT_HEIGHT_KEY.mobile];
            if (typeof window.scChatInputExpanderApplyStyles === "function") {
              window.scChatInputExpanderApplyStyles();
            }
            flashButton(applyBtn, "\u2713 \u5DF2\u5E94\u7528", "#4CAF50", "\u5E94\u7528", "#2196F3");
          };
          const resetBtn = document.createElement("button");
          resetBtn.className = "SimcompaniesRetailCalculation-action-btn";
          resetBtn.textContent = "\u91CD\u7F6E";
          resetBtn.style.cssText = "flex:1;background:#607D8B;color:white;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:12px;";
          resetBtn.onclick = (e) => {
            e.stopPropagation();
            const configKey = "SC_PageActions_Settings";
            let config = {};
            try {
              config = JSON.parse(localStorage.getItem(configKey)) || {};
            } catch (err) {
              config = {};
            }
            delete config[CHAT_INPUT_HEIGHT_KEY.desktop];
            delete config[CHAT_INPUT_HEIGHT_KEY.mobile];
            localStorage.setItem(configKey, JSON.stringify(config));
            desktopInput.value = CHAT_INPUT_HEIGHT_DEFAULTS.desktop;
            mobileInput.value = CHAT_INPUT_HEIGHT_DEFAULTS.mobile;
            if (typeof window.scChatInputExpanderApplyStyles === "function") {
              window.scChatInputExpanderApplyStyles();
            }
            flashButton(resetBtn, "\u2713 \u5DF2\u91CD\u7F6E", "#4CAF50", "\u91CD\u7F6E", "#607D8B");
          };
          const actionRow = document.createElement("div");
          actionRow.style.cssText = "display:flex;gap:6px;grid-column:1 / -1;margin-top:2px;";
          actionRow.append(applyBtn, resetBtn);
          row.appendChild(actionRow);
          return row;
        };
        mainMenu.append(
          createStatusRow("r1"),
          createStatusRow("r2"),
          createStatusRow("constants")
        );
        const btnGroup = document.createElement("div");
        btnGroup.className = "SimcompaniesRetailCalculation-btn-group";
        btnGroup.append(
          createActionButton("\u66F4\u65B0\u9886\u57DF\u6570\u636E", "region"),
          createActionButton("\u66F4\u65B0\u57FA\u672C\u6570\u636E", "constants"),
          (() => {
            const btn = document.createElement("button");
            btn.className = "SimcompaniesRetailCalculation-action-btn";
            btn.textContent = "\u5F53\u524D\u9886\u57DF\u5929\u6C14\u548C\u9971\u548C\u5EA6\u8868";
            btn.onclick = showSaturationTable;
            return btn;
          })(),
          createActionButton("MP-?%", "mpShow"),
          createActionButton("\u8BA1\u7B97\u5F53\u524D\u51B0\u6DC7\u6DCB\u5269\u4F59\u91CF", "calculateDecay"),
          (() => {
            const btn = document.createElement("button");
            btn.className = "SimcompaniesRetailCalculation-action-btn";
            const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
            btn.textContent = "SC\u56FE\u7247\u66FF\u6362\u7BA1\u7406 (\u68C0\u6D4B\u4E2D...)";
            btn.style.backgroundColor = "#546E7A";
            let retry = 0;
            const maxRetry = 20;
            const timer = setInterval(() => {
              if (typeof win.SCobg_TogglePanel === "function") {
                clearInterval(timer);
                btn.textContent = "SC\u56FE\u7247\u66FF\u6362\u7BA1\u7406";
                btn.style.backgroundColor = "#9C27B0";
                btn.onclick = () => win.SCobg_TogglePanel();
              } else if (retry++ > maxRetry) {
                clearInterval(timer);
                btn.textContent = "SC\u56FE\u7247\u66FF\u6362\u7BA1\u7406 (\u672A\u5B89\u88C5)";
                btn.onclick = () => {
                  if (confirm("\u68C0\u6D4B\u5230\u672A\u5B89\u88C5\u56FE\u7247\u66FF\u6362\u811A\u672C\uFF0C\u662F\u5426\u524D\u5F80\u5B89\u88C5\uFF1F")) {
                    window.open("https://sc.22-7.top/scripts/oldBuildingsGraphic.user.js", "_blank");
                  }
                };
              }
            }, 500);
            return btn;
          })(),
          (() => {
            const btn = document.createElement("button");
            btn.className = "SimcompaniesRetailCalculation-action-btn";
            btn.textContent = "\u2699\uFE0F \u529F\u80FD\u5F00\u5173\u8BBE\u7F6E";
            btn.style.backgroundColor = "#607D8B";
            btn.onclick = () => switchMenu(true);
            return btn;
          })()
        );
        content.appendChild(btnGroup);
        const secBtnGroup = document.createElement("div");
        secBtnGroup.className = "SimcompaniesRetailCalculation-btn-group";
        const backBtn = document.createElement("button");
        backBtn.className = "SimcompaniesRetailCalculation-action-btn";
        backBtn.textContent = "\u2B05 \u8FD4\u56DE";
        backBtn.style.backgroundColor = "#E91E63";
        backBtn.onclick = () => switchMenu(false);
        secBtnGroup.append(backBtn);
        const toggleItems = [
          {
            type: "factory",
            fn: () => {
              const b = document.createElement("button");
              b.className = "SimcompaniesRetailCalculation-action-btn";
              b.id = "auto-amount-toggle-btn";
              const refreshState = () => {
                try {
                  const enabled = typeof window.isAutoAmountEnabled === "function" && window.isAutoAmountEnabled();
                  b.textContent = enabled ? "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: \u{1F7E2} \u5DF2\u542F\u7528" : "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: \u{1F534} \u5DF2\u7981\u7528";
                  b.style.backgroundColor = enabled ? "#4CAF50" : "#f44336";
                } catch (e) {
                  b.textContent = "\u81EA\u5B9A\u4E49\u8FD0\u884C\u65F6\u957F: (\u52A0\u8F7D\u4E2D...)";
                  b.style.backgroundColor = "#607D8B";
                }
              };
              refreshState();
              b.onclick = (ev) => {
                ev.stopPropagation();
                if (typeof window.isAutoAmountEnabled !== "function") return;
                window.saveAutoAmountEnabled(!window.isAutoAmountEnabled());
                window.initAutoAmountButtons(true);
                refreshState();
              };
              return b;
            }
          },
          { type: "toggle", key: "marketProfit", label: "\u4EA4\u6613\u6240\u8BA1\u7B97\u65F6\u5229\u6DA6" },
          { type: "toggle", key: "marketMessageIcon", label: "\u4EA4\u6613\u6240\u79C1\u4FE1\u56FE\u6807", defaultEnabled: false },
          { type: "toggle", key: "contractProfit", label: "\u5408\u540C\u8BA1\u7B97\u65F6\u5229\u6DA6" },
          { type: "toggle", key: "executiveHistory", label: "\u663E\u793A\u9AD8\u7BA1\u57F9\u8BAD\u8BB0\u5F55" },
          { type: "toggle", key: "formerExecEnhance", label: "\u524D\u4EFB\u9AD8\u7BA1\u66F4\u591A\u4FE1\u606F" },
          { type: "toggle", key: "outgoingMP", label: "\u51FA\u5E93\u5408\u540CMP-?%" },
          { type: "toggle", key: "autoSelectBestMarketRow", label: "\u4EA4\u6613\u6240\u81EA\u52A8\u9009\u4E2D\u9AD8\u4EAE\u884C", defaultEnabled: false },
          { type: "toggle", key: "warehouseProfit", label: "\u4ED3\u5E93\u65F6\u5229\u6DA6\u8BA1\u7B97" },
          { type: "toggle", key: "chatAccessibility", label: "\u804A\u5929\u5BA4\u8272\u5F31\u8F85\u52A9", defaultEnabled: false },
          { type: "toggle", key: "landscapeHighlight", label: "\u5730\u56FE\u7A7A\u95F2\u5EFA\u7B51\u9AD8\u4EAE" },
          { type: "toggle", key: "restaurantStock", label: "\u9910\u9986\u5907\u8D27\u63D0\u9192" },
          { type: "toggle", key: "paQuestAnswers", label: "PA\u4EFB\u52A1\u7B54\u6848", defaultEnabled: true },
          { type: "toggle", key: "snipboardPreview", label: "Snipboard\u56FE\u7247\u9884\u89C8", defaultEnabled: true },
          { type: "toggle", key: "chatInputExpander", label: "\u804A\u5929\u8F93\u5165\u6846\u81EA\u52A8\u6269\u5927", defaultEnabled: true, heightInput: true },
          { type: "toggle", key: "chatEmojiPicker", label: "\u804A\u5929\u8868\u60C5\u9009\u62E9\u5668", defaultEnabled: true }
        ];
        const ITEMS_PER_PAGE = 5;
        let currentPage = 0;
        const totalPages = Math.ceil(toggleItems.length / ITEMS_PER_PAGE);
        function renderPage(page) {
          secBtnGroup.querySelectorAll(".sc-toggle-item, .sc-page-controls").forEach((el) => el.remove());
          const startIdx = page * ITEMS_PER_PAGE;
          const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, toggleItems.length);
          for (let i = startIdx; i < endIdx; i++) {
            const item = toggleItems[i];
            let el;
            if (item.type === "factory") {
              el = item.fn();
            } else {
              el = createPageActionToggle(item.key, item.label, item.defaultEnabled !== false);
            }
            if (item.heightInput) {
              const wrap = document.createElement("div");
              wrap.className = "sc-toggle-item";
              wrap.style.cssText = "display:flex;flex-direction:column;";
              wrap.appendChild(el);
              wrap.appendChild(createChatInputHeightControls());
              el = wrap;
            } else {
              el.classList.add("sc-toggle-item");
            }
            secBtnGroup.appendChild(el);
          }
          const controls = document.createElement("div");
          controls.className = "sc-page-controls";
          controls.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:6px;";
          const prevBtn = document.createElement("button");
          prevBtn.className = "SimcompaniesRetailCalculation-action-btn";
          prevBtn.textContent = "\u25C0 \u4E0A\u4E00\u9875";
          prevBtn.style.cssText = `background:${page === 0 ? "#607D8B" : "#2196F3"};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page === 0 ? "not-allowed" : "pointer"};font-size:11px;flex:1;`;
          prevBtn.disabled = page === 0;
          prevBtn.onclick = (e) => {
            e.stopPropagation();
            if (page > 0) {
              currentPage = page - 1;
              renderPage(currentPage);
            }
          };
          const pageInfo = document.createElement("span");
          pageInfo.textContent = `${page + 1} / ${totalPages}`;
          pageInfo.style.cssText = "font-size:12px;color:var(--sc-panel-fg,#efefef);white-space:nowrap;";
          const nextBtn = document.createElement("button");
          nextBtn.className = "SimcompaniesRetailCalculation-action-btn";
          nextBtn.textContent = "\u4E0B\u4E00\u9875 \u25B6";
          nextBtn.style.cssText = `background:${page >= totalPages - 1 ? "#607D8B" : "#2196F3"};color:white;border:none;padding:4px 8px;border-radius:3px;cursor:${page >= totalPages - 1 ? "not-allowed" : "pointer"};font-size:11px;flex:1;`;
          nextBtn.disabled = page >= totalPages - 1;
          nextBtn.onclick = (e) => {
            e.stopPropagation();
            if (page < totalPages - 1) {
              currentPage = page + 1;
              renderPage(currentPage);
            }
          };
          controls.appendChild(prevBtn);
          controls.appendChild(pageInfo);
          controls.appendChild(nextBtn);
          secBtnGroup.appendChild(controls);
        }
        secondaryMenu.appendChild(secBtnGroup);
        renderPage(0);
        const info = document.createElement("div");
        info.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:#ccc;border-top:1px solid #555;`;
        const version = GM_info?.script?.version || "\u672A\u77E5\u7248\u672C";
        info.innerHTML = `
                \u4F5C\u8005\uFF1A<a href="https://www.simcompanies.com/zh-cn/company/0/Rabbit-House/" target="_blank" class="sc-info-link">Rabbit House</a> <span id="sc-feedback-export" style="cursor:pointer;">\u53CD\u9988\u8BF7\u8BF4\u660E\u95EE\u9898</span><br>
                \u53CD\u9988\u7FA4\uFF1A798670333 <br>
                \u6E90\u7801\uFF1A<a href="https://github.com/gangbaRuby/SimCompanies-Scripts" target="_blank" class="sc-info-link">GitHub</a> \u2B50\u{1F647}<br>
                \u7248\u672C\uFF1A<span id="script-version">${version}</span>
            `;
        let feedbackClickCount = 0;
        let feedbackClickTimer = null;
        const feedbackExportEl = info.querySelector("#sc-feedback-export");
        if (feedbackExportEl) {
          feedbackExportEl.addEventListener("click", (e) => {
            e.stopPropagation();
            feedbackClickCount += 1;
            clearTimeout(feedbackClickTimer);
            feedbackClickTimer = setTimeout(() => {
              feedbackClickCount = 0;
            }, 1200);
            if (feedbackClickCount < 3) return;
            feedbackClickCount = 0;
            if (!confirm("\u662F\u5426\u8981\u5BFC\u51FA\u5F53\u524D\u9886\u57DF\u6570\u636E\uFF1F")) return;
            try {
              downloadExportData();
              showToast("\u6392\u9519\u6570\u636E\u5DF2\u5BFC\u51FA", "success");
            } catch (err) {
              console.error("\u5BFC\u51FA\u6392\u9519\u6570\u636E\u5931\u8D25", err);
              showToast("\u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0", "error");
            }
          });
        }
        let checkTimer = setInterval(() => {
          console.log(hasNewVersion);
          if (hasNewVersion === true) {
            const verNode = document.getElementById("script-version");
            if (verNode) {
              verNode.innerHTML = `${version} <a href="https://sc.22-7.top/scripts/autoMaxPPHPL.user.js" span style="color:#ff6;">\uFF08\u53D1\u73B0\u65B0\u7248\u672C\uFF1A${latestVersion}\uFF09</span>`;
            }
            clearInterval(checkTimer);
          } else if (hasNewVersion === false) {
            clearInterval(checkTimer);
          }
        }, 500);
        mainMenu.appendChild(btnGroup);
        content.append(mainMenu, secondaryMenu, info);
        panel.append(trigger, content);
        return panel;
      };
      let panelThemeInited = false;
      const refreshPanelTheme = () => {
        const d = DM();
        const root = document.documentElement;
        root.style.setProperty("--sc-panel-bg", d ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.98)");
        root.style.setProperty("--sc-panel-fg", d ? "#efefef" : "#333");
        root.style.setProperty("--sc-panel-label", d ? "#BDBDBD" : "#666");
        const linkColor = d ? "#6cf" : "#2196F3";
        document.querySelectorAll(".sc-info-link").forEach((a) => {
          a.style.color = linkColor;
        });
        const infoDiv = panelElement?.querySelector(".SimcompaniesRetailCalculation-panel-content > div:last-child");
        if (infoDiv) {
          infoDiv.style.cssText = `margin-top:10px;padding:8px;font-size:12px;line-height:1.5;color:${d ? "#ccc" : "#666"};border-top:1px solid ${d ? "#555" : "#ddd"};`;
        }
        panelThemeInited = true;
      };
      const togglePanel = (e) => {
        e.stopPropagation();
        const content = panelElement.querySelector(".SimcompaniesRetailCalculation-panel-content");
        const isCurrentlyVisible = content.style.display === "block";
        if (isCurrentlyVisible) {
          content.style.display = "none";
          return;
        }
        content.style.display = "block";
        content.style.visibility = "hidden";
        if (!panelThemeInited) refreshPanelTheme();
        content.classList.remove("show-settings");
        refreshStatus();
        initAutoAmountToggle();
        refreshPageActionToggles2();
        if (needsPositionRecalc) {
          adjustPanelPosition(content);
          needsPositionRecalc = false;
        }
        content.style.visibility = "visible";
      };
      const refreshStatus = () => {
        ["r1", "r2", "constants"].forEach((type) => {
          const { text, className } = Storage.getFormattedStatus(type);
          statusElements[type].textContent = text;
          statusElements[type].className = `SimcompaniesRetailCalculation-region-status ${className}`;
        });
      };
      const MpPanel = (() => {
        let inputPercent = (() => {
          const val = localStorage.getItem("mp_inputPercent");
          return val === null ? 2.5 : parseFloat(val);
        })();
        function addUrlChangeListener(callback) {
          let lastUrl = location.href;
          new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
              lastUrl = url;
              callback(url);
            }
          }).observe(document, { subtree: true, childList: true });
        }
        function getCurrentResourceId() {
          const url = location.pathname;
          const match2 = url.match(/\/market\/resource\/(\d+)(\/|$)/);
          return match2 ? match2[1] : null;
        }
        addUrlChangeListener(() => {
          updateContent("\u8BF7\u70B9\u51FB\u8BA1\u7B97");
          const titleEl = document.querySelector("#mp-floating-box div:first-child div");
          if (titleEl) {
            titleEl.textContent = `MP-?% - \u70B9\u5408\u540C\u65F6\u5229\u6DA6\u964D\u5E8F\uFF0C\u70B9\u5356\u5BB6\u8DF3\u8F6C\u79C1\u4FE1`;
          }
        });
        function renderResultTable(results) {
          if (!Array.isArray(results) || results.length === 0) {
            return "<p>\u65E0\u6570\u636E</p>";
          }
          const headers = ["\u5356\u5BB6", "\u5E02\u573A\u4EF7", "\u54C1\u8D28", "\u6570\u91CF", "\u5408\u540C\u4EF7", "\u5408\u540C\u65F6\u5229\u6DA6"];
          let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; width: 100%;">';
          html += "<thead><tr>" + headers.map((h, i) => `<th class="th-${i}">${h}</th>`).join("") + "</tr></thead>";
          html += "<tbody>";
          for (const row of results) {
            html += `<tr><td style="max-width:120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    <a href="https://www.simcompanies.com/zh-cn/messages/${encodeURIComponent(row.seller)}" target="_blank"
                       style="color: inherit; text-decoration: none; display: inline-block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                       ${row.seller}
                    </a>
                 </td><td>${row.marketPrice}</td><td>${row.quality}</td><td>${row.saleAmout}</td><td>${row.contractPrice.toFixed(2)}</td><td>${row.contractMaxProfit}</td></tr>`;
          }
          html += "</tbody></table>";
          return html;
        }
        function enableTableFeatures() {
          const table = document.querySelector("#mp-table-container table");
          if (!table) return;
          const profitTh = table.querySelector("thead th.th-5");
          if (!profitTh) return;
          let ascending = false;
          profitTh.style.cursor = "pointer";
          profitTh.onclick = () => {
            const tbody = table.querySelector("tbody");
            const rows = Array.from(tbody.querySelectorAll("tr"));
            rows.sort((a, b) => {
              const aVal = parseFloat(a.cells[5].textContent) || 0;
              const bVal = parseFloat(b.cells[5].textContent) || 0;
              return ascending ? aVal - bVal : bVal - aVal;
            });
            rows.forEach((row) => tbody.appendChild(row));
            ascending = !ascending;
          };
        }
        function showPanel() {
          let box = document.getElementById("mp-floating-box");
          if (box) {
            box.style.display = box.style.display === "none" ? "block" : "none";
            updateContent("\u70B9\u51FB\u201C\u8BA1\u7B97\u201D\u5F00\u59CB\u8BA1\u7B97");
            return;
          }
          const dMp = DM();
          box = document.createElement("div");
          box.id = "mp-floating-box";
          box.style.cssText = `
                position: fixed;
                left: min(25px, 5vw);
                top: 50px;
                width: min(450px, 90vw);
                max-height: 70vh;
                background: ${dMp ? "#222" : "#fff"};
                color: ${dMp ? "#eee" : "#333"};
                padding: 12px;
                border-radius: 6px;
                box-shadow: 0 0 15px rgba(0,0,0,0.3);
                z-index: 9998;
                overflow: hidden;
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                white-space: normal;
                word-break: break-word;
                user-select: none;
                display: flex;
                flex-direction: column;
                border: 1px solid ${dMp ? "#444" : "#ddd"};
              `;
          const header = document.createElement("div");
          header.style.cssText = `
                cursor: move;
                padding: 6px 10px;
                background: ${dMp ? "#111" : "#f0f0f0"};
                border-radius: 6px 6px 0 0;
                font-weight: bold;
                user-select: none;
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: ${dMp ? "#eee" : "#333"};
              `;
          const title = document.createElement("div");
          title.textContent = `MP-?% - \u70B9\u5408\u540C\u65F6\u5229\u6DA6\u964D\u5E8F\uFF0C\u70B9\u516C\u53F8\u8DF3\u8F6C\u79C1\u4FE1`;
          header.appendChild(title);
          const closeBtn = document.createElement("span");
          closeBtn.textContent = "\u2716";
          closeBtn.title = "\u5173\u95ED";
          closeBtn.style.cssText = `
                cursor: pointer;
                font-weight: bold;
                color: ${dMp ? "#aaa" : "#888"};
                user-select: none;
                margin-left: 10px;
              `;
          closeBtn.onmouseenter = () => closeBtn.style.color = dMp ? "#fff" : "#333";
          closeBtn.onmouseleave = () => closeBtn.style.color = dMp ? "#aaa" : "#888";
          closeBtn.onclick = () => box.style.display = "none";
          header.appendChild(closeBtn);
          box.appendChild(header);
          const inputWrapper = document.createElement("div");
          inputWrapper.style.cssText = `display: flex; align-items: center; gap: 8px; margin: 10px 0; color: ${dMp ? "#eee" : "#333"}; font-weight: bold;`;
          inputWrapper.innerHTML = `
                <span style="flex: 0 0 auto;">MP-</span>
                <input id="mp-percent-input" type="number" min="0" step="0.1" value="${inputPercent}" style="background: ${dMp ? "#2c3e50" : "#e8f0fe"}; color: ${dMp ? "#fff" : "#333"}; width: 40px; border: 1px solid ${dMp ? "#555" : "#bbb"};">
                <span style="flex: 0 0 auto;">% \u8F93\u5165\u8D1F\u6570\u4E3A\u76F4\u63A5\u51CF\u53BB</span>
                <button id="mp-calc-btn" style="background: #2196F3; color: white; flex: 0 0 auto; margin-left: 12px; cursor: pointer;">\u8BA1\u7B97</button>
              `;
          box.appendChild(inputWrapper);
          const content = document.createElement("div");
          content.id = "mp-floating-content";
          content.style.cssText = `
                  flex-shrink: 0;
                  height: 28px;
                  line-height: 28px;
                  overflow: hidden;
                  margin-top: 8px;
                  color: ${dMp ? "#eee" : "#333"};
                  white-space: nowrap;
                  text-overflow: ellipsis;
                `;
          box.appendChild(content);
          const tableContainer = document.createElement("div");
          tableContainer.id = "mp-table-container";
          tableContainer.style.cssText = `
                  flex-grow: 1;
                  margin-top: 8px;
                  max-height: 320px;  /* \u4F60\u53EF\u4EE5\u8C03\u8282\u8FD9\u4E2A\u9AD8\u5EA6 */
                  overflow-y: auto;
                `;
          box.appendChild(tableContainer);
          document.body.appendChild(box);
          const style = document.createElement("style");
          style.textContent = `
                    #mp-table-container table {
                        width: 100%;
                        table-layout: fixed;
                        word-break: break-word;
                    }
                    #mp-table-container table th:first-child,
                    #mp-table-container table td:first-child {
                        width: auto;
                        min-width: 50px;
                        text-align: center;
                    }
                    #mp-floating-box div {
                        flex-wrap: wrap;   /* \u5C0F\u5C4F\u5E55\u81EA\u52A8\u6362\u884C */
                    }
                    #mp-floating-box input,
                    #mp-floating-box button,
                    #mp-floating-box span {
                        flex-shrink: 1;    /* \u7F29\u5C0F\u907F\u514D\u6491\u51FA */
                    }
                `;
          document.head.appendChild(style);
          const calcBtn = document.getElementById("mp-calc-btn");
          const percentInput = document.getElementById("mp-percent-input");
          calcBtn.addEventListener("click", async () => {
            calcBtn.disabled = true;
            inputPercent = parseFloat(percentInput.value) || 0;
            localStorage.setItem("mp_inputPercent", inputPercent);
            const realm = getRealmIdFromLink();
            const resourceId = getCurrentResourceId();
            const name = resourceIdNameMap[resourceId] || `\u672A\u77E5(${resourceId})`;
            if (realm === null || resourceId === null) {
              updateContent("\u65E0\u6CD5\u786E\u5B9A realmId \u6216 resourceId");
              calcBtn.disabled = false;
              return;
            }
            const raw = localStorage.getItem(`market_${realm}_${resourceId}`);
            if (!raw) {
              updateContent("\u65E0\u5E02\u573A\u6570\u636E\uFF0C\u65E0\u6CD5\u8BA1\u7B97");
              calcBtn.disabled = false;
              return;
            }
            let data2;
            try {
              const parsed = JSON.parse(raw);
              data2 = Array.isArray(parsed) ? parsed : parsed.data;
            } catch {
              updateContent("\u5E02\u573A\u6570\u636E\u89E3\u6790\u9519\u8BEF");
              calcBtn.disabled = false;
              return;
            }
            updateContent("\u8BA1\u7B97\u4E2D\uFF0C\u8BF7\u7A0D\u5019...");
            document.getElementById("mp-table-container").innerHTML = "";
            try {
              if (!window.MarketInterceptor || !window.MarketInterceptor.calculateProfit) {
                updateContent("\u8BA1\u7B97\u670D\u52A1\u672A\u51C6\u5907\u597D");
                calcBtn.disabled = false;
                return;
              }
              const result = await window.MarketInterceptor.calculateProfit(inputPercent, data2, getRealmIdFromLink());
              updateContent(`\u8BA1\u7B97\u5B8C\u6210,\u5F53\u524D\u4EA7\u54C1\u4E3A\uFF1A${name}`);
              document.getElementById("mp-table-container").innerHTML = renderResultTable(result);
              enableTableFeatures();
            } catch (e) {
              updateContent("\u8BA1\u7B97\u53D1\u751F\u9519\u8BEF");
              console.error(e);
            } finally {
              calcBtn.disabled = false;
            }
          });
          updateContent("\u8BF7\u8F93\u5165\u53C2\u6570\uFF0C\u70B9\u51FB\u8BA1\u7B97");
          dragElement(box, header);
        }
        function updateContent(text) {
          const content = document.getElementById("mp-floating-content");
          if (!content) return;
          content.textContent = text;
        }
        return {
          showPanel
        };
      })();
      const dragElement = (elmnt, dragHandle) => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        dragHandle.onmousedown = dragMouseDown;
        function dragMouseDown(e) {
          e.preventDefault();
          pos3 = e.clientX;
          pos4 = e.clientY;
          document.onmouseup = closeDragElement;
          document.onmousemove = elementDrag;
        }
        function elementDrag(e) {
          e.preventDefault();
          pos1 = pos3 - e.clientX;
          pos2 = pos4 - e.clientY;
          pos3 = e.clientX;
          pos4 = e.clientY;
          let newTop = elmnt.offsetTop - pos2;
          let newLeft = elmnt.offsetLeft - pos1;
          newTop = Math.max(0, Math.min(window.innerHeight - elmnt.offsetHeight, newTop));
          newLeft = Math.max(0, Math.min(window.innerWidth - elmnt.offsetWidth, newLeft));
          elmnt.style.top = newTop + "px";
          elmnt.style.left = newLeft + "px";
        }
        function closeDragElement() {
          document.onmouseup = null;
          document.onmousemove = null;
        }
      };
      const handleUpdate = async (type) => {
        const button = panelElement.querySelector(`[data-action-type="${type}"]`);
        if (!button) return;
        if (type === "mpShow") return MpPanel.showPanel();
        const updateConfigs = {
          "region": {
            action: async () => {
              await RegionData.getCurrentRealmId();
              return await RegionData.fetchFullRegionData();
            },
            statusKey: "r1",
            failText: "\u9886\u57DF\u66F4\u65B0\u5931\u8D25"
          },
          "constants": {
            action: async () => await constantsData.initialize(),
            statusKey: "constants",
            failText: "\u57FA\u7840\u66F4\u65B0\u5931\u8D25"
          },
          "calculateDecay": {
            action: async () => await window.calculateAll(),
            onSuccess: () => {
              const wasOpen = document.getElementById("decayDataPanel")?.style.display !== "none";
              wasOpen ? DecayResultViewer.show() : DecayResultViewer.toggle();
            }
          }
        };
        const config = updateConfigs[type];
        if (!config) return;
        const originalText = button.textContent;
        try {
          button.disabled = true;
          button.textContent = type === "calculateDecay" ? "\u8BA1\u7B97\u4E2D..." : "\u66F4\u65B0\u4E2D...";
          const result = await config.action();
          if (result && type !== "calculateDecay") {
            Storage.save(type, result);
          }
          if (config.onSuccess) {
            config.onSuccess();
          } else {
            refreshStatus();
          }
        } catch (error) {
          console.error(`${type}\u64CD\u4F5C\u5931\u8D25:`, error);
          if (config.statusKey && statusElements[config.statusKey]) {
            const el = statusElements[config.statusKey];
            el.textContent = "\u66F4\u65B0\u5931\u8D25";
            el.className = "SimcompaniesRetailCalculation-region-status SimcompaniesRetailCalculation-no-data";
          }
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      };
      return {
        init() {
          injectStyles();
          panelElement = createPanel();
          document.body.appendChild(panelElement);
          panelElement.addEventListener("click", (e) => {
            if (e.target.closest("[data-action-type]")) {
              const type = e.target.dataset.actionType;
              handleUpdate(type);
            }
          });
          document.addEventListener("click", (e) => {
            if (!panelElement.contains(e.target)) {
              panelElement.querySelector(".SimcompaniesRetailCalculation-panel-content").style.display = "none";
            }
          });
          refreshStatus();
        },
        initAutoAmountToggle,
        resetPanelPosition
      };
    })();
    PanelUI.init();
    const registerMenu = typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : typeof GM !== "undefined" && GM.registerMenuCommand ? GM.registerMenuCommand.bind(GM) : null;
    if (registerMenu) {
      registerMenu("\u8FD8\u539F\u6309\u94AE\u9ED8\u8BA4\u4F4D\u7F6E", () => PanelUI.resetPanelPosition());
    }
    const SaturationDisplay = /* @__PURE__ */ (() => {
      let saturationTableElement = null;
      const isNarrowViewport = () => window.innerWidth <= 480;
      const createTable = (list) => {
        const d = DM();
        const isNarrow = isNarrowViewport();
        const cellPadding = isNarrow ? "4px 5px" : "4px 8px";
        const table = document.createElement("table");
        table.style.cssText = `border-collapse:collapse;margin:10px 0;background:${d ? "#333" : "#f9f9f9"};color:${d ? "white" : "#333"};font-size:${isNarrow ? 12 : 13}px;width:auto;table-layout:auto;white-space:nowrap;`;
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["\u7269\u54C1", "\u8D28\u91CF", "\u9971\u548C\u5EA6"].forEach((text) => {
          const th = document.createElement("th");
          th.textContent = text;
          th.style.cssText = `border:1px solid ${d ? "#666" : "#ccc"};padding:${cellPadding};text-align:center;vertical-align:middle;white-space:nowrap;`;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement("tbody");
        list.forEach((item) => {
          const row = document.createElement("tr");
          const name = resourceIdNameMap[item.dbLetter] || `\u672A\u77E5(${item.dbLetter})`;
          [name, item.quality ?? "-", String(item.saturation)].forEach((text) => {
            const td = document.createElement("td");
            td.textContent = text;
            td.style.cssText = `border:1px solid ${d ? "#666" : "#ccc"};padding:${cellPadding};text-align:center;vertical-align:middle;white-space:nowrap;`;
            row.appendChild(td);
          });
          tbody.appendChild(row);
        });
        table.appendChild(tbody);
        return table;
      };
      return {
        toggle(data2, onClose) {
          if (saturationTableElement) {
            saturationTableElement.remove();
            saturationTableElement = null;
            return;
          }
          const d = DM();
          const isNarrow = isNarrowViewport();
          const containerPadding = isNarrow ? 8 : 12;
          const containerMaxHeight = isNarrow ? "320px" : "400px";
          const titleFont = isNarrow ? 13 : 14;
          const subFont = isNarrow ? 12 : 13;
          const list = data2.ResourcesRetailInfo;
          const weatherMultiplier = data2.sellingSpeedMultiplier.sellingSpeedMultiplier;
          const weatherData = data2.sellingSpeedMultiplier || {};
          const weatherUntilRaw = weatherData.Until || weatherData.until || weatherData.weatherUntil || data2.weatherUntil && (data2.weatherUntil.Until || data2.weatherUntil.until);
          const weatherUntilDate = weatherUntilRaw ? new Date(weatherUntilRaw) : null;
          const weatherUntilText = weatherUntilDate && !isNaN(weatherUntilDate.getTime()) ? weatherUntilDate.toLocaleString([], {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }) : "\u672A\u77E5";
          saturationTableElement = document.createElement("div");
          saturationTableElement.style.cssText = `
                position:fixed; left:10px; top:50px; z-index:9998; box-sizing:border-box;
                background:${d ? "#2c2c2c" : "#fff"}; color:${d ? "#fff" : "#333"}; padding:${containerPadding}px;
                border-radius:8px; max-height:${containerMaxHeight}; overflow:auto;
                width:max-content; max-width: calc(100vw - 20px);
                box-shadow:0 4px 15px rgba(0,0,0,0.5); font-family:Arial, sans-serif;
            `;
          const headerInfo = document.createElement("div");
          headerInfo.style.paddingRight = "26px";
          headerInfo.style.overflowWrap = "anywhere";
          headerInfo.innerHTML = `
                <div style="margin-bottom:6px; font-size:${titleFont}px; font-weight:bold; color:${d ? "#f1c40f" : "#b8860b"};">\u5929\u6C14\u901F\u5EA6\u52A0\u6210: ${weatherMultiplier}</div>
                <div style="margin-bottom:6px; font-size:${subFont}px; color:${d ? "#ddd" : "#666"};">\u4E0B\u6B21\u53D8\u66F4\u65F6\u95F4: ${weatherUntilText}</div>
                <div style="margin-bottom:6px; font-size:${subFont}px; color:${d ? "#ddd" : "#666"};">\u67E5\u8BE2\u5386\u53F2\u9971\u548C\u5EA6: <a href="https://sc.22-7.top/marketsaturation" target="_blank" style="color:#3498db; text-decoration:underline;">\u70B9\u51FB\u67E5\u770B</a></div>
            `;
          const closeBtn = document.createElement("button");
          closeBtn.textContent = "\xD7";
          closeBtn.style.cssText = `
                position:absolute; top:6px; right:6px; background:#e74c3c; color:white;
                border:none; border-radius:50%; width:24px; height:24px; cursor:pointer;
            `;
          closeBtn.onclick = () => {
            saturationTableElement.remove();
            saturationTableElement = null;
            if (onClose) onClose();
          };
          saturationTableElement.appendChild(closeBtn);
          saturationTableElement.appendChild(headerInfo);
          saturationTableElement.appendChild(createTable(list));
          document.body.appendChild(saturationTableElement);
        }
      };
    })();
    (function() {
      function setInput(inputNode, value, count = 3) {
        let lastValue = inputNode.value;
        inputNode.value = value;
        let event = new Event("input", { bubbles: true });
        event.simulated = true;
        if (inputNode._valueTracker) inputNode._valueTracker.setValue(lastValue);
        inputNode.dispatchEvent(event);
        if (count >= 0) return setInput(inputNode, value, --count);
      }
      function findReactComponent(element) {
        const reactKeys = Object.keys(element).filter(
          (key) => key.startsWith("__reactInternalInstance") || key.startsWith("__reactFiber")
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
      const workerCode = `
        self.onmessage = function(e) {
        const { lwe, zn, size, acceleration, economyState, resource, salesModifierWithRecreationBonus,
            skillCMO, skillCOO, saturation, administrationOverhead, wages, buildingKind, forceQuality, weather,
            v, b,
            cogs, quality, quantity, cardIndex, retryCount,
            SCXXCS, PROFIT_PER_BUILDING_LEVEL, RETAIL_ADJUSTMENT,
            calcMode} = e.data;

        // Utility functions defined inside to use local lwe and zn
        const wv = (e, t, r) => {
            return r === null ? lwe[e][t] : lwe[e][t].quality[r];
        };
        const Upt = (e, t, r, n) => t + (e + n) / r;
        const Hpt = (e, t, r, n, a) => {
            const o = (n + e) / ((t - a) * (t - a));
            return e - (r - t) * (r - t) * o;
        };
        const qpt = (e, t, r, n, a = 1) => (a * ((n - t) * 3600) - r) / (e + r);
        const Bpt = (e, t, r, n, a, o) => {
            const g = RETAIL_ADJUSTMENT[e] ?? 1;
            const s = Math.min(Math.max(2 - n, 0), 2),
                  l = Math.max(0.9, s / 2 + 0.5),
                  c = r / 12;
            const d = PROFIT_PER_BUILDING_LEVEL *
                (t.buildingLevelsNeededPerUnitPerHour * t.modeledUnitsSoldAnHour + 1) *
                g *
                (s / 2 * (1 + c * zn.RETAIL_MODELING_QUALITY_WEIGHT)) +
                (t.modeledStoreWages ?? 0) * SCXXCS;
            const h = t.modeledUnitsSoldAnHour * l;
            const p = Upt(d, t.modeledProductionCostPerUnit, h, t.modeledStoreWages ?? 0);
            const m = Hpt(d, p, o, t.modeledStoreWages ?? 0, t.modeledProductionCostPerUnit);
            return qpt(m, t.modeledProductionCostPerUnit, t.modeledStoreWages ?? 0, o, a);
        };
        const zL = (buildingKind, modeledData, quantity, salesModifier, price, qOverride, saturation, acc, size, weather) => {
            const u = Bpt(buildingKind, modeledData, qOverride, saturation, quantity, price);
            if (u <= 0) return NaN;
            const d = u / acc / size;
            let p = d - d * salesModifier / 100;
            return weather && (p /= weather.sellingSpeedMultiplier), p
        };

        // Initial debug log

        // profit calculation loop
        let currentPrice = Math.floor(cogs / quantity) || 1;
        let bestPrice = currentPrice;
        let maxProfit = -Infinity;
        let _, w, revenue, wagesTotal, secondsToFinish = 0


        while (currentPrice > 0) {

            w = zL(buildingKind, wv(economyState, resource.dbLetter, (_ = forceQuality) != null ? _ : null), parseFloat(quantity), v, currentPrice, forceQuality === void 0 ? quality : 0, saturation, acceleration, size, resource.retailSeason === "Summer" ? weather : void 0);

            revenue = currentPrice * quantity;
            wagesTotal = Math.ceil(w * wages * acceleration * b / 60 / 60);
            secondsToFinish = w;

            if (!secondsToFinish || secondsToFinish <= 0) break;

            let profit = revenue - cogs - wagesTotal;
            if (calcMode === 'hourly') {
                profit = profit / secondsToFinish;
            }

            if (profit > maxProfit) {
                maxProfit = profit;
                bestPrice = currentPrice;
            }

            if (currentPrice < 8) {
                currentPrice = Math.round((currentPrice + 0.01) * 100) / 100;
            } else if (currentPrice < 2001) {
                currentPrice = Math.round((currentPrice + 0.1) * 10) / 10;
            } else {
                currentPrice = Math.round(currentPrice + 1);
            }
        }

        const finalW = zL(
            buildingKind,
            wv(economyState, resource.dbLetter, forceQuality ?? null),
            parseFloat(quantity),
            v,
            bestPrice, // \u4F7F\u7528\u627E\u5230\u7684\u6700\u4F73\u4EF7\u683C
            forceQuality === undefined ? quality : 0,
            saturation,
            acceleration,
            size,
            resource.retailSeason === "Summer" ? weather : undefined
        );

        // \u8BA1\u7B97\u5BF9\u5E94\u7684\u5DE5\u8D44\u603B\u989D
        const calculatedWages = Math.ceil(finalW * wages * acceleration * b / 3600);

        // \u53D1\u9001\u7ED3\u679C\uFF0C\u5E26\u4E0A calculatedWages, calcMode, finalTotalProfit, finalW
        self.postMessage({
            bestPrice: bestPrice,
            maxProfit: maxProfit,
            calculatedWages: calculatedWages,
            cardIndex: cardIndex,
            retryCount: retryCount,
            calcMode: calcMode,
            finalTotalProfit: (bestPrice * parseFloat(quantity)) - cogs - calculatedWages,
            finalW: finalW
        });

    };
    `;
      const profitWorker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" })));
      function triggerCalculation(comp, index, retryCount = 0, calcMode = "hourly") {
        if (localStorage.getItem("SimcompaniesConstantsData") == null) {
          showToast("\u8BF7\u5148\u70B9\u51FB\u5DE6\u4E0B\u89D2\u66F4\u65B0\u57FA\u7840\u6570\u636E", "error");
          return;
        }
        const lweData = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
        const znData = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;
        const {
          size: size2,
          acceleration: acceleration2,
          economyState: economyState2,
          resource: resource2,
          salesModifierWithRecreationBonus: salesModifierWithRecreationBonus2,
          skillCMO: skillCMO2,
          skillCOO: skillCOO2,
          saturation: saturation2,
          administrationOverhead: administrationOverhead2,
          wages: wages2,
          buildingKind: buildingKind2,
          forceQuality: forceQuality2,
          weather
        } = comp.props;
        const { cogs: originalCogs, quality: quality2, quantity: quantity2 } = comp.state;
        const cardEl = document.querySelectorAll('div[style="overflow: visible;"]')[index];
        const customCostEl = cardEl?.querySelector(".custom-unit-cost-input");
        const customUnitCostVal = customCostEl ? parseFloat(customCostEl.value) || 0 : 0;
        const cogs2 = customUnitCostVal > 0 ? customUnitCostVal * quantity2 : originalCogs;
        const vVal = salesModifierWithRecreationBonus2 + Math.floor(skillCMO2 / 3);
        const bVal = Ul(administrationOverhead2, skillCOO2);
        profitWorker.postMessage({
          lwe: lweData,
          zn: znData,
          size: size2,
          acceleration: acceleration2,
          economyState: economyState2,
          resource: resource2,
          wages: wages2,
          buildingKind: buildingKind2,
          forceQuality: forceQuality2,
          weather,
          v: vVal,
          b: bVal,
          // 传入预计算结果
          skillCMO: skillCMO2,
          skillCOO: skillCOO2,
          saturation: saturation2,
          // 备用
          cogs: cogs2,
          quality: quality2,
          quantity: quantity2,
          cardIndex: index,
          retryCount,
          SCXXCS: SCXXCS5,
          PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL5,
          RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT5,
          calcMode
        });
      }
      profitWorker.onmessage = (event) => {
        const { bestPrice, maxProfit, calculatedWages, cardIndex, retryCount, calcMode, finalTotalProfit, finalW } = event.data;
        const mode = calcMode || "hourly";
        const card = document.querySelectorAll('div[style="overflow: visible;"]')[cardIndex];
        if (!card) return;
        const priceInput = card.querySelector('input[name="price"]');
        const btnHourly = card.querySelector(".btn-max-hourly-profit");
        const btnTotal = card.querySelector(".btn-max-total-profit");
        const profitDisplay = card.querySelector(".auto-profit-display");
        if (!priceInput || !profitDisplay) return;
        const comp = findReactComponent(priceInput);
        if (!comp) return;
        const size2 = comp.props.size || 1;
        setInput(priceInput, bestPrice.toFixed(2));
        const hourlyProfit = finalW > 0 ? finalTotalProfit / finalW / size2 * 3600 : 0;
        profitDisplay.innerHTML = `
                <div>\u603B\u5229\u6DA6: ${finalTotalProfit.toFixed(2)}</div>
                <div style="margin-top: 2px;">\u6BCF\u7EA7\u65F6\u5229\u6DA6: ${hourlyProfit.toFixed(2)}</div>
            `;
        profitDisplay.style.background = "#4CAF50";
        profitDisplay.style.color = "white";
        profitDisplay.style.fontWeight = "bold";
        if (btnHourly) {
          btnHourly.textContent = "\u6700\u5927\u65F6\u5229\u6DA6";
          btnHourly.disabled = false;
        }
        if (btnTotal) {
          btnTotal.textContent = "\u6700\u5927\u5229\u6DA6";
          btnTotal.disabled = false;
        }
        setTimeout(() => {
          const updatedComp = findReactComponent(priceInput);
          if (!updatedComp) return;
          const actualWages = updatedComp.state.wagesTotal;
          if (Math.abs(calculatedWages - actualWages) > 1) {
            if (retryCount < 5) {
              const newQty = updatedComp.state.quantity;
              profitDisplay.style.background = "#2196F3";
              profitDisplay.style.color = "white";
              profitDisplay.innerHTML = "\u{1F504} \u4FEE\u6B63\u6570\u91CF\u4E2D...";
              if (typeof card.doAutoCalc === "function") {
                card.doAutoCalc(updatedComp, retryCount + 1, mode);
              } else if (typeof triggerCalculation === "function") {
                triggerCalculation(updatedComp, cardIndex, retryCount + 1, mode);
              } else {
              }
            } else {
              profitDisplay.style.background = "#f44336";
              profitDisplay.style.color = "white";
              profitDisplay.innerHTML = "\u26A0\uFE0F \u8BA1\u7B97\u504F\u5DEE\u8FC7\u5927";
              showToast("\u5229\u6DA6\u8BA1\u7B97\u504F\u5DEE\uFF1A\u5EFA\u8BAE\u624B\u52A8\u8F93\u5165\u5177\u4F53\u6570\u91CF\u6216\u66F4\u65B0\u57FA\u7840\u6570\u636E,\u4F9D\u7136\u62A5\u9519\u8BF7\u8054\u7CFBRabbit House", "error");
            }
          }
        }, 100);
      };
      function initAutoPricing() {
        try {
          const input = document.querySelector('input[name="price"]');
          if (!input) return;
          const reactInstance = findReactComponent(input);
          if (!reactInstance) return;
          const cards = document.querySelectorAll('div[style="overflow: visible;"]');
          cards.forEach((card, index) => {
            if (card.dataset.autoPricingAdded) return;
            const priceInput = card.querySelector('input[name="price"]');
            if (!priceInput) return;
            const comp = findReactComponent(priceInput);
            if (!comp) return;
            const btnContainer = document.createElement("div");
            btnContainer.style = `display: flex; flex-direction: column; gap: 4px; margin-top: 5px;`;
            const btnHourly = document.createElement("button");
            btnHourly.textContent = "\u6700\u5927\u65F6\u5229\u6DA6";
            btnHourly.type = "button";
            btnHourly.className = "btn-max-hourly-profit";
            btnHourly.setAttribute("data-index", index);
            btnHourly.style = `background: #2196F3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;
            const btnTotal = document.createElement("button");
            btnTotal.textContent = "\u6700\u5927\u5229\u6DA6";
            btnTotal.type = "button";
            btnTotal.className = "btn-max-total-profit";
            btnTotal.setAttribute("data-index", index);
            btnTotal.style = `background: #e91e63; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;`;
            btnContainer.appendChild(btnHourly);
            btnContainer.appendChild(btnTotal);
            const d = DM();
            const profitDisplay = document.createElement("div");
            profitDisplay.className = "auto-profit-display";
            profitDisplay.textContent = `\u7B49\u5F85\u8BA1\u7B97...`;
            profitDisplay.style = `margin-top: 5px; font-size: 14px; color: ${d ? "#fff" : "#333"}; background: ${d ? "#555" : "#e0e0e0"}; padding: 4px 8px; text-align: center; border-radius: 4px;`;
            const customCostInput = document.createElement("input");
            customCostInput.type = "number";
            customCostInput.className = "custom-unit-cost-input";
            customCostInput.placeholder = "\u5047\u8BBE\u5355\u4F4D\u6210\u672C";
            customCostInput.min = "0";
            customCostInput.step = "0.01";
            customCostInput.style = `margin-top: 5px; width: 100%; padding: 4px 8px; border: 1px solid ${d ? "#555" : "#bbb"}; border-radius: 4px; background: ${d ? "#333" : "#fff"}; color: ${d ? "#fff" : "#333"}; font-size: 13px; box-sizing: border-box;`;
            const startCalc = (targetComp, retryIdx = 0, mode = "hourly") => {
              if (localStorage.getItem("SimcompaniesConstantsData") == null) {
                showToast("\u8BF7\u5C1D\u8BD5\u66F4\u65B0\u57FA\u672C\u6570\u636E\uFF08\u5DE6\u4E0B\u89D2\u6309\u94AE\uFF09");
                return;
              }
              if (retryIdx === 0) {
                if (mode === "hourly") {
                  btnHourly.textContent = "\u8BA1\u7B97\u4E2D...";
                  btnHourly.disabled = true;
                } else {
                  btnTotal.textContent = "\u8BA1\u7B97\u4E2D...";
                  btnTotal.disabled = true;
                }
              }
              profitDisplay.textContent = retryIdx > 0 ? `\u4FEE\u6B63\u4E2D(${retryIdx})...` : `\u8BA1\u7B97\u4E2D...`;
              const lwe2 = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).retailInfo;
              const zn2 = JSON.parse(localStorage.getItem("SimcompaniesConstantsData")).data;
              const { size: size2, acceleration: acceleration2, economyState: economyState2, resource: resource2, salesModifierWithRecreationBonus: salesModifierWithRecreationBonus2, skillCMO: skillCMO2, skillCOO: skillCOO2, saturation: saturation2, administrationOverhead: administrationOverhead2, wages: wages2, buildingKind: buildingKind2, forceQuality: forceQuality2, weather = null } = targetComp.props;
              const { cogs: originalCogs, quality: quality2, quantity: quantity2 } = targetComp.state;
              const customUnitCost = parseFloat(customCostInput.value) || 0;
              const cogs2 = customUnitCost > 0 ? customUnitCost * quantity2 : originalCogs;
              const v = salesModifierWithRecreationBonus2 + Math.floor(skillCMO2 / 3);
              const b = Ul(administrationOverhead2, skillCOO2);
              profitWorker.postMessage({
                lwe: lwe2,
                zn: zn2,
                size: size2,
                acceleration: acceleration2,
                economyState: economyState2,
                resource: resource2,
                salesModifierWithRecreationBonus: salesModifierWithRecreationBonus2,
                skillCMO: skillCMO2,
                skillCOO: skillCOO2,
                saturation: saturation2,
                administrationOverhead: administrationOverhead2,
                wages: wages2,
                buildingKind: buildingKind2,
                forceQuality: forceQuality2,
                weather,
                v,
                b,
                cogs: cogs2,
                quality: quality2,
                quantity: quantity2,
                cardIndex: index,
                retryCount: retryIdx,
                // 发送当前是第几次尝试
                SCXXCS: SCXXCS5,
                PROFIT_PER_BUILDING_LEVEL: PROFIT_PER_BUILDING_LEVEL5,
                RETAIL_ADJUSTMENT: RETAIL_ADJUSTMENT5,
                calcMode: mode
              });
            };
            btnHourly.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              startCalc(comp, 0, "hourly");
            };
            btnTotal.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              startCalc(comp, 0, "total");
            };
            card.doAutoCalc = startCalc;
            priceInput.parentNode.insertBefore(btnContainer, priceInput.nextSibling);
            priceInput.parentNode.insertBefore(profitDisplay, btnContainer.nextSibling);
            priceInput.parentNode.insertBefore(customCostInput, profitDisplay.nextSibling);
            card.dataset.autoPricingAdded = "true";
          });
        } catch (err) {
        }
      }
      window.initAutoPricing = initAutoPricing;
      function observeCardsForAutoPricing() {
        let debounceTimer;
        let lateCheckTimer;
        const targetNode = document.body;
        const observer = new MutationObserver((mutationsList) => {
          clearTimeout(debounceTimer);
          clearTimeout(lateCheckTimer);
          debounceTimer = setTimeout(() => {
            const hasNewCards = mutationsList.some((mutation) => {
              return mutation.type === "childList" && mutation.addedNodes.length > 0 && Array.from(mutation.addedNodes).some((node) => {
                return node.nodeType === 1 && // 元素节点
                (node.matches('div[style="overflow: visible;"]') || node.querySelector('div[style="overflow: visible;"]'));
              });
            });
            if (hasNewCards) {
              initAutoPricing();
              lateCheckTimer = setTimeout(() => {
                initAutoPricing();
              }, 500);
            }
          }, 100);
        });
        observer.observe(targetNode, {
          childList: true,
          // 观察直接子节点的添加/删除
          subtree: true,
          // 观察所有后代节点
          attributes: false,
          // 不需要观察属性变化
          characterData: false
          // 不需要观察文本变化
        });
        function ensureInputsLoaded() {
          let tries = 0;
          const timer = setInterval(() => {
            const inputs = document.querySelectorAll('input[name="price"]');
            if (inputs.length > 0 || tries > 50) {
              clearInterval(timer);
              if (inputs.length > 0) {
                initAutoPricing();
              }
            }
            tries++;
          }, 100);
        }
        requestAnimationFrame(() => {
          ensureInputsLoaded();
        });
      }
      if (typeof window.isPageModuleEnabled === "function" && window.isPageModuleEnabled("autoPricing")) {
        observeCardsForAutoPricing();
      }
    })();
    ConstantsAutoUpdater.checkAndUpdate();
    setTimeout(() => {
      RegionAutoUpdater.checkAndUpdate(getRealmIdFromLink());
    }, 3e3);
    const regionUpdateTimer = setInterval(() => {
      RegionAutoUpdater.checkAndUpdate(getRealmIdFromLink());
    }, 60 * 1e3);
    window.addEventListener("pagehide", () => clearInterval(regionUpdateTimer), { once: true });
    (function() {
      async function calculateAllDecayResources() {
        try {
          const realmId = getRealmIdFromLink();
          const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
          const SRC = JSON.parse(localStorage.getItem(regionKey));
          if (!SRC || !SRC.companyId) {
            console.warn("[\u5E93\u5B58\u6A21\u5757] \u672A\u627E\u5230 companyId\uFF0C\u65E0\u6CD5\u53D1\u8D77\u8BF7\u6C42");
            return;
          }
          const url = `https://www.simcompanies.com/api/v3/resources/${SRC.companyId}/`;
          const response = await fetch(url);
          const data2 = await response.json();
          const now = Date.now();
          const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.amount * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.amount;
                    const totalCost = Object.values(entry.cost || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        const unitCost = amount === 0 ? Infinity : Number((totalCost / amount).toFixed(3));
                        results.push({
                          time: dateStr,
                          amount,
                          unitCost
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      quality: entry.quality,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind)) {
                      if (!output[entry.kind]) output[entry.kind] = {};
                      if (!output[entry.kind][entry.quality]) {
                        output[entry.kind][entry.quality] = calculate(entry);
                      }
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;
          const blob = new Blob([workerCode], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function(e) {
            const { companyId, output } = e.data;
            const key = `wareHouse-${companyId}`;
            localStorage.setItem(key, JSON.stringify(output));
            window.dispatchEvent(new Event("warehouse-updated"));
          };
          worker.postMessage({ data: data2, now, companyId: SRC.companyId });
        } catch (e) {
          console.error("[\u5E93\u5B58\u6A21\u5757] \u5904\u7406\u5931\u8D25\uFF1A", e);
        }
      }
      async function calculateContractsOutgoing() {
        try {
          const realmId = getRealmIdFromLink();
          const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
          const SRC = JSON.parse(localStorage.getItem(regionKey));
          if (!SRC || !SRC.companyId) {
            console.warn("[\u5408\u540C\u6A21\u5757] \u672A\u627E\u5230 companyId\uFF0C\u65E0\u6CD5\u53D1\u8D77\u8BF7\u6C42");
            return;
          }
          const url = `https://www.simcompanies.com/api/v2/contracts-outgoing/`;
          const response = await fetch(url);
          const data2 = await response.json();
          const now = Date.now();
          const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      buyer: entry.buyer.company,
                      quality: entry.quality,
                      quantity: entry.quantity,
                      price: entry.price,
                      datetime: entry.datetime,
                      rawTime: decayTime,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetime) {
                        if (!output[entry.kind]) output[entry.kind] = {};
                        if (!output[entry.kind][entry.buyer.company]) output[entry.kind][entry.buyer.company] = [];
                        output[entry.kind][entry.buyer.company].push(calculate(entry));
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;
          const blob = new Blob([workerCode], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function(e) {
            const { companyId, output } = e.data;
            const key = `contractsOutgoing-${companyId}`;
            localStorage.setItem(key, JSON.stringify(output));
            window.dispatchEvent(new Event("contractsOutgoing-updated"));
          };
          worker.postMessage({ data: data2, now, companyId: SRC.companyId });
        } catch (e) {
          console.error("[\u5408\u540C\u6A21\u5757] \u5904\u7406\u5931\u8D25\uFF1A", e);
        }
      }
      async function calculateContractsIncoming() {
        try {
          const realmId = getRealmIdFromLink();
          const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
          const SRC = JSON.parse(localStorage.getItem(regionKey));
          if (!SRC || !SRC.companyId) {
            console.warn("[\u5408\u540C\u6A21\u5757] \u672A\u627E\u5230 companyId\uFF0C\u65E0\u6CD5\u53D1\u8D77\u8BF7\u6C42");
            return;
          }
          const url = `https://www.simcompanies.com/api/v2/contracts-incoming/`;
          const response = await fetch(url);
          const json = await response.json();
          const data2 = json.incomingContracts;
          const now = Date.now();
          const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetime);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetime);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetime, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                        kind: entry.kind,
                        seller: entry.seller.company,
                        quality: entry.quality,
                        quantity: entry.quantity,
                        price: entry.price,
                        datetime: entry.datetime,
                        rawTime: decayTime,
                        result: results
                      };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetime) {
                        if (!output[entry.kind]) output[entry.kind] = {};
                        if (!output[entry.kind][entry.buyer.company]) output[entry.kind][entry.buyer.company] = [];
                        output[entry.kind][entry.buyer.company].push(calculate(entry));
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;
          const blob = new Blob([workerCode], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function(e) {
            const { companyId, output } = e.data;
            const key = `contractsIncoming-${companyId}`;
            localStorage.setItem(key, JSON.stringify(output));
            window.dispatchEvent(new Event("contractsIncoming-updated"));
          };
          worker.postMessage({ data: data2, now, companyId: SRC.companyId });
        } catch (e) {
          console.error("[\u5408\u540C\u6A21\u5757] \u5904\u7406\u5931\u8D25\uFF1A", e);
        }
      }
      async function calculateMarket() {
        try {
          const realmId = getRealmIdFromLink();
          const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
          const SRC = JSON.parse(localStorage.getItem(regionKey));
          if (!SRC || !SRC.companyId) {
            console.warn("[\u5E02\u573A\u6A21\u5757] \u672A\u627E\u5230 companyId\uFF0C\u65E0\u6CD5\u53D1\u8D77\u8BF7\u6C42");
            return;
          }
          const url = `https://www.simcompanies.com/api/v2/companies/${SRC.companyId}/market-orders/`;
          const response = await fetch(url);
          const data2 = await response.json();
          const now = Date.now();
          const workerCode = `
                self.onmessage = function(e) {
                  const { data, now, companyId } = e.data;

                  function fo(entry, t) {
                    const n = Date.parse(entry.datetimeDecayUpdated);
                    const a = Math.abs(t - n);
                    const o = Math.round(a / (1e3 * 60) / 4) * 4 / 60;
                    return Math.floor(entry.quantity * Math.pow(1 - 0.05, o));
                  }

                  function alignTimeToOriginalSeconds(originalTimeStr, nowTimestamp) {
                    const originalDate = new Date(originalTimeStr);
                    const nowDate = new Date(nowTimestamp);
                    const originalSeconds = originalDate.getSeconds();
                    const originalMilliseconds = originalDate.getMilliseconds();
                    const alignedDate = new Date(nowDate);
                    alignedDate.setSeconds(originalSeconds, originalMilliseconds);
                    if (alignedDate.getTime() > nowTimestamp) {
                      alignedDate.setMinutes(alignedDate.getMinutes() - 1);
                    }
                    return alignedDate.getTime();
                  }

                  function formatLocalDateSimple(date) {
                    const pad = (n) => String(n).padStart(2, '0');
                    return \`\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \${pad(date.getHours())}:\${pad(date.getMinutes())}:\${pad(Math.floor(date.getSeconds()))}\`;
                  }

                  function calculate(entry) {
                    const decayTime = Date.parse(entry.datetimeDecayUpdated);
                    const quantity = entry.quantity;
                    let lastAmount = fo(entry, now);
                    const results = [];
                    let currentTime = alignTimeToOriginalSeconds(entry.datetimeDecayUpdated, now);

                    for (; currentTime < decayTime + 8760 * 60 * 60 * 1000; currentTime += 1000) {
                      const diff = Math.abs(currentTime - decayTime);
                      const cycleCount = Math.round(diff / (1000 * 60) / 4) * 4 / 60;
                      const amount = Math.floor(quantity * Math.pow(1 - 0.05, cycleCount));
                      if (amount !== lastAmount) {
                        const dateStr = formatLocalDateSimple(new Date(currentTime));
                        results.push({
                          time: dateStr,
                          amount,
                        });
                        lastAmount = amount;
                        if (amount === 0) break;
                      }
                    }

                    return {
                      kind: entry.kind,
                      quality: entry.quality,
                      price: entry.price,
                      result: results
                    };
                  }

                  const output = {};
                  for (const entry of data) {
                    if ([153, 154].includes(entry.kind) && entry.datetimeDecayUpdated) {
                      if (!output[entry.kind]) output[entry.kind] = {};
                      if (!output[entry.kind][entry.quality]) output[entry.kind][entry.quality] = {};
                      if (!output[entry.kind][entry.quality][entry.price]) {
                        output[entry.kind][entry.quality][entry.price] = calculate(entry);
                      }
                    }
                  }

                  self.postMessage({ companyId, output });
                };
              `;
          const blob = new Blob([workerCode], { type: "application/javascript" });
          const worker = new Worker(URL.createObjectURL(blob));
          worker.onmessage = function(e) {
            const { companyId, output } = e.data;
            const key = `marketOrders-${companyId}`;
            localStorage.setItem(key, JSON.stringify(output));
            window.dispatchEvent(new Event("marketOrders-updated"));
          };
          worker.postMessage({ data: data2, now, companyId: SRC.companyId });
        } catch (e) {
          console.error("[\u5E02\u573A\u6A21\u5757] \u5904\u7406\u5931\u8D25\uFF1A", e);
        }
      }
      async function calculateAll() {
        await calculateAllDecayResources();
        await calculateContractsOutgoing();
        await calculateContractsIncoming();
        await calculateMarket();
      }
      window.calculateAll = calculateAll;
    })();
    const DecayResultViewer = (() => {
      let container, header, content;
      const KIND_NAMES = {
        153: "\u5DE7\u514B\u529B\u51B0\u6DC7\u51CC",
        154: "\u82F9\u679C\u51B0\u6DC7\u51CC"
      };
      const getCurrentCompanyData = () => {
        const realmId = getRealmIdFromLink();
        const regionKey = `SimcompaniesRetailCalculation_${realmId}`;
        const SRC = JSON.parse(localStorage.getItem(regionKey));
        if (!SRC || !SRC.companyId) {
          console.warn("[\u8D44\u6E90\u6A21\u5757] \u672A\u627E\u5230 companyId\uFF0C\u65E0\u6CD5\u5C55\u793A\u8D44\u6E90\u9762\u677F");
          return { inventory: [], market: [], contract: [] };
        }
        const inventoryKey = `wareHouse-${SRC.companyId}`;
        const marketKey = `marketOrders-${SRC.companyId}`;
        const contractsOutgoingKey = `contractsOutgoing-${SRC.companyId}`;
        const contractsIncomingKey = `contractsIncoming-${SRC.companyId}`;
        const inventory = [];
        const market = [];
        let contractsOutgoing = {};
        let contractsIncoming = {};
        const rawInventory = localStorage.getItem(inventoryKey);
        if (rawInventory) {
          try {
            const obj2 = JSON.parse(rawInventory);
            for (const kind in obj2) {
              for (const quality2 in obj2[kind]) {
                inventory.push(obj2[kind][quality2]);
              }
            }
          } catch (e) {
            console.warn("\u89E3\u6790\u5E93\u5B58\u6570\u636E\u5931\u8D25", e);
          }
        }
        const rawMarket = localStorage.getItem(marketKey);
        if (rawMarket) {
          try {
            const obj2 = JSON.parse(rawMarket);
            for (const kind in obj2) {
              for (const quality2 in obj2[kind]) {
                for (const price in obj2[kind][quality2]) {
                  market.push(obj2[kind][quality2][price]);
                }
              }
            }
          } catch (e) {
            console.warn("\u89E3\u6790\u5E02\u573A\u6570\u636E\u5931\u8D25", e);
          }
        }
        const rawContractsOutgoing = localStorage.getItem(contractsOutgoingKey);
        if (rawContractsOutgoing) {
          try {
            contractsOutgoing = JSON.parse(rawContractsOutgoing);
          } catch (e) {
            console.warn("\u89E3\u6790\u51FA\u5E93\u5408\u540C\u6570\u636E\u5931\u8D25", e);
          }
        }
        const rawContractsIncoming = localStorage.getItem(contractsIncomingKey);
        if (rawContractsIncoming) {
          try {
            contractsIncoming = JSON.parse(rawContractsIncoming);
          } catch (e) {
            console.warn("\u89E3\u6790\u5165\u5E93\u5408\u540C\u6570\u636E\u5931\u8D25", e);
          }
        }
        return { inventory, market, contractsOutgoing, contractsIncoming };
      };
      const getDataFromStorage = () => {
        const data2 = getCurrentCompanyData();
        return data2;
      };
      const formatSimpleDate = (dateStr) => {
        const d = new Date(dateStr);
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };
      const createToggleSection = (title, contentElement, isOpen = true) => {
        const d12t = DM();
        const section = document.createElement("div");
        section.style.marginBottom = "8px";
        const header2 = document.createElement("div");
        header2.textContent = (isOpen ? "\u25BC " : "\u25B6 ") + title;
        header2.style.cssText = `cursor:pointer;font-weight:bold;padding:6px;background:${d12t ? "#444" : "#e8e8e8"};border-radius:4px;user-select:none;color:${d12t ? "white" : "#333"};`;
        header2.addEventListener("click", () => {
          const isHidden = contentElement.style.display === "none";
          contentElement.style.display = isHidden ? "block" : "none";
          header2.textContent = (isHidden ? "\u25BC " : "\u25B6 ") + title;
        });
        section.appendChild(header2);
        section.appendChild(contentElement);
        contentElement.style.display = isOpen ? "block" : "none";
        return section;
      };
      const renderResult = () => {
        const data2 = getDataFromStorage();
        content.innerHTML = "";
        content.appendChild(makeInventorySection("\u{1F4E6} \u5E93\u5B58\u6570\u636E", data2.inventory));
        content.appendChild(makecontractsOutgoingSection("\u{1F4E6} \u51FA\u5E93\u5408\u540C", data2.contractsOutgoing));
        content.appendChild(makeContractsIncomingSection("\u{1F4E6} \u5165\u5E93\u5408\u540C", data2.contractsIncoming));
        content.appendChild(makeMarketSection("\u{1F4E6} \u5E02\u573A\u8BA2\u5355", data2.market));
      };
      function makeInventorySection(label, items) {
        const containerDiv = document.createElement("div");
        if (items.length === 0) {
          const msg = document.createElement("div");
          msg.textContent = "\u6682\u65E0\u6570\u636E\u3002";
          msg.style.padding = "5px 10px";
          containerDiv.appendChild(msg);
          return createToggleSection(label, containerDiv, false);
        }
        const groupedByKind = {};
        items.forEach((item) => {
          if (!groupedByKind[item.kind]) groupedByKind[item.kind] = [];
          groupedByKind[item.kind].push(item);
        });
        for (const kind in groupedByKind) {
          const kindName = KIND_NAMES[kind] || `\u79CD\u7C7B ${kind}`;
          const kindContent = document.createElement("div");
          kindContent.style.paddingLeft = "12px";
          const groupedByQuality = {};
          groupedByKind[kind].forEach((item) => {
            if (!groupedByQuality[item.quality]) groupedByQuality[item.quality] = [];
            groupedByQuality[item.quality].push(item);
          });
          for (const quality2 in groupedByQuality) {
            const qualityContent = document.createElement("div");
            qualityContent.style.paddingLeft = "16px";
            const headerRow = document.createElement("div");
            headerRow.style.fontWeight = "bold";
            headerRow.style.display = "flex";
            headerRow.style.gap = "16px";
            headerRow.style.padding = "2px 0";
            headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5269\u4F59\u91CF</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u8FBE\u6210\u65F6\u95F4</div><div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5355\u4F4D\u6210\u672C</div>`;
            qualityContent.appendChild(headerRow);
            const allDecayArrays = groupedByQuality[quality2].flatMap((i) => i.futureDecayArray || i.result || []);
            if (allDecayArrays.length === 0) {
              const row = document.createElement("div");
              row.style.display = "flex";
              row.style.gap = "16px";
              row.style.padding = "1px 0";
              row.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5DF2\u5168\u90E8\u8870\u51CF</div>
                            <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u221E</div>
                        `;
              qualityContent.appendChild(row);
            } else {
              allDecayArrays.forEach(({ amount, time, unitCost }) => {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.gap = "16px";
                row.style.padding = "1px 0";
                row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                <div style="flex:0.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${unitCost === Infinity ? "\u221E" : typeof unitCost === "number" ? unitCost.toFixed(3) : "\u221E"}</div>
                            `;
                qualityContent.appendChild(row);
              });
            }
            kindContent.appendChild(createToggleSection(`\u54C1\u8D28 ${quality2}`, qualityContent, false));
          }
          containerDiv.appendChild(createToggleSection(kindName, kindContent, true));
        }
        return createToggleSection(label, containerDiv, true);
      }
      function makecontractsOutgoingSection(label, contractsData) {
        const container2 = document.createElement("div");
        if (!contractsData || Object.keys(contractsData).length === 0) {
          const msg = document.createElement("div");
          msg.textContent = "\u6682\u65E0\u6570\u636E\u3002";
          msg.style.padding = "5px 10px";
          container2.appendChild(msg);
          return createToggleSection(label, container2, false);
        }
        for (const kind in contractsData) {
          const kindName = KIND_NAMES[kind] || `\u79CD\u7C7B ${kind}`;
          const kindContent = document.createElement("div");
          kindContent.style.paddingLeft = "12px";
          for (const buyer in contractsData[kind]) {
            const buyerContent = document.createElement("div");
            buyerContent.style.paddingLeft = "16px";
            const sortedContracts = contractsData[kind][buyer].slice().sort((a, b) => {
              return Date.parse(a.datetime) - Date.parse(b.datetime);
            });
            sortedContracts.forEach((contract, idx) => {
              const contractContent = document.createElement("div");
              contractContent.style.paddingLeft = "16px";
              contractContent.style.marginBottom = "4px";
              const headerRow = document.createElement("div");
              headerRow.style.fontWeight = "bold";
              headerRow.style.display = "flex";
              headerRow.style.gap = "12px";
              headerRow.style.padding = "2px 0";
              headerRow.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5269\u4F59\u91CF</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u8FBE\u6210\u65F6\u95F4</div>
                        `;
              contractContent.appendChild(headerRow);
              if (!contract.result || contract.result.length === 0) {
                const row = document.createElement("div");
                row.textContent = "\u5DF2\u5168\u90E8\u8870\u51CF";
                row.style.padding = "2px 0 2px 10px";
                contractContent.appendChild(row);
              } else {
                contract.result.forEach(({ amount, time }) => {
                  const row = document.createElement("div");
                  row.style.display = "flex";
                  row.style.gap = "12px";
                  row.style.padding = "1px 0";
                  row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                  contractContent.appendChild(row);
                });
              }
              buyerContent.appendChild(createToggleSection(
                `\u54C1\u8D28 Q${contract.quality}\uFF5C\u6570\u91CF ${contract.quantity}\uFF5C\u5355\u4EF7 $${contract.price}\uFF5C\u53D1\u51FA ${new Date(contract.datetime).toLocaleString(void 0, {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                })}`,
                contractContent,
                false
              ));
            });
            kindContent.appendChild(createToggleSection(`\u4E70\u65B9\u516C\u53F8 ${buyer}`, buyerContent, true));
          }
          container2.appendChild(createToggleSection(kindName, kindContent, true));
        }
        return createToggleSection(label, container2, true);
      }
      function makeContractsIncomingSection(label, contractsData) {
        const container2 = document.createElement("div");
        if (!contractsData || Object.keys(contractsData).length === 0) {
          const msg = document.createElement("div");
          msg.textContent = "\u6682\u65E0\u6570\u636E\u3002";
          msg.style.padding = "5px 10px";
          container2.appendChild(msg);
          return createToggleSection(label, container2, false);
        }
        for (const kind in contractsData) {
          const kindName = KIND_NAMES[kind] || `\u79CD\u7C7B ${kind}`;
          const kindContent = document.createElement("div");
          kindContent.style.paddingLeft = "12px";
          for (const seller in contractsData[kind]) {
            const sellerContent = document.createElement("div");
            sellerContent.style.paddingLeft = "16px";
            const sortedContracts = contractsData[kind][seller].slice().sort((a, b) => {
              return Date.parse(a.datetime) - Date.parse(b.datetime);
            });
            sortedContracts.forEach((contract, idx) => {
              const contractContent = document.createElement("div");
              contractContent.style.paddingLeft = "16px";
              contractContent.style.marginBottom = "4px";
              const headerRow = document.createElement("div");
              headerRow.style.fontWeight = "bold";
              headerRow.style.display = "flex";
              headerRow.style.gap = "12px";
              headerRow.style.padding = "2px 0";
              headerRow.innerHTML = `
                            <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5269\u4F59\u91CF</div>
                            <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u8FBE\u6210\u65F6\u95F4</div>
                        `;
              contractContent.appendChild(headerRow);
              if (!contract.result || contract.result.length === 0) {
                const row = document.createElement("div");
                row.textContent = "\u5DF2\u5168\u90E8\u8870\u51CF";
                row.style.padding = "2px 0 2px 10px";
                contractContent.appendChild(row);
              } else {
                contract.result.forEach(({ amount, time }) => {
                  const row = document.createElement("div");
                  row.style.display = "flex";
                  row.style.gap = "12px";
                  row.style.padding = "1px 0";
                  row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.5; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                  contractContent.appendChild(row);
                });
              }
              sellerContent.appendChild(createToggleSection(
                `\u54C1\u8D28 Q${contract.quality}\uFF5C\u6570\u91CF ${contract.quantity}\uFF5C\u5355\u4EF7 $${contract.price}\uFF5C\u53D1\u51FA ${new Date(contract.datetime).toLocaleString(void 0, {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                })}`,
                contractContent,
                false
              ));
            });
            kindContent.appendChild(createToggleSection(`\u5356\u65B9\u516C\u53F8 ${seller}`, sellerContent, true));
          }
          container2.appendChild(createToggleSection(kindName, kindContent, true));
        }
        return createToggleSection(label, container2, true);
      }
      function makeMarketSection(label, items) {
        const containerDiv = document.createElement("div");
        if (items.length === 0) {
          const msg = document.createElement("div");
          msg.textContent = "\u6682\u65E0\u6570\u636E\u3002";
          msg.style.padding = "5px 10px";
          containerDiv.appendChild(msg);
          return createToggleSection(label, containerDiv, false);
        }
        const groupedByKind = {};
        items.forEach((item) => {
          if (!groupedByKind[item.kind]) groupedByKind[item.kind] = [];
          groupedByKind[item.kind].push(item);
        });
        for (const kind in groupedByKind) {
          const kindName = KIND_NAMES[kind] || `\u79CD\u7C7B ${kind}`;
          const kindContent = document.createElement("div");
          kindContent.style.paddingLeft = "12px";
          const groupedByQuality = {};
          groupedByKind[kind].forEach((item) => {
            if (!groupedByQuality[item.quality]) groupedByQuality[item.quality] = [];
            groupedByQuality[item.quality].push(item);
          });
          for (const quality2 in groupedByQuality) {
            const qualityContent = document.createElement("div");
            qualityContent.style.paddingLeft = "16px";
            const groupedByPrice = {};
            groupedByQuality[quality2].forEach((item) => {
              if (!groupedByPrice[item.price]) groupedByPrice[item.price] = [];
              groupedByPrice[item.price].push(item);
            });
            for (const price in groupedByPrice) {
              const priceContent = document.createElement("div");
              priceContent.style.paddingLeft = "16px";
              const headerRow = document.createElement("div");
              headerRow.style.fontWeight = "bold";
              headerRow.style.display = "flex";
              headerRow.style.gap = "16px";
              headerRow.style.padding = "2px 0";
              headerRow.innerHTML = `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5269\u4F59\u91CF</div><div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u8FBE\u6210\u65F6\u95F4</div>`;
              priceContent.appendChild(headerRow);
              const allDecayArrays = groupedByPrice[price].flatMap((i) => i.result || []);
              if (allDecayArrays.length === 0) {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.gap = "16px";
                row.style.padding = "1px 0";
                row.innerHTML = `
                                <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">\u5DF2\u5168\u90E8\u8870\u51CF</div>
                                <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">-</div>
                            `;
                priceContent.appendChild(row);
              } else {
                allDecayArrays.forEach(({ amount, time }) => {
                  const row = document.createElement("div");
                  row.style.display = "flex";
                  row.style.gap = "16px";
                  row.style.padding = "1px 0";
                  row.innerHTML = `
                                    <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${amount}</div>
                                    <div style="flex:1.3; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${time}</div>
                                `;
                  priceContent.appendChild(row);
                });
              }
              qualityContent.appendChild(createToggleSection(`\u5355\u4EF7 $${price}`, priceContent, false));
            }
            kindContent.appendChild(createToggleSection(`\u54C1\u8D28 ${quality2}`, qualityContent, false));
          }
          containerDiv.appendChild(createToggleSection(kindName, kindContent, true));
        }
        return createToggleSection(label, containerDiv, true);
      }
      const init2 = () => {
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        let resizer;
        const d12 = DM();
        container = document.createElement("div");
        container.id = "decayDataPanel";
        container.style.cssText = `
                position: fixed;
                left: ${isMobile ? "5vw" : "calc(100% - 510px)"};
                top: ${isMobile ? "20px" : "calc(100vh - 60px - 300px)"};
                width: ${isMobile ? "80vw" : "500px"};
                height: ${isMobile ? "50vh" : "350px"};
                max-height: 80%;
                overflow: hidden;
                background: ${d12 ? "#222" : "#fff"};
                color: ${d12 ? "white" : "#333"};
                padding: 10px;
                z-index: 9998;
                border-radius: 6px;
                font-size: clamp(12px, 1.5vw, 16px);
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                user-select: none;
                display: flex;
                flex-direction: column;
            `;
        header = document.createElement("div");
        const headerTitle = document.createElement("span");
        headerTitle.textContent = "\u672A\u6765\u8870\u51CF\u91CF \u25BE";
        header.appendChild(headerTitle);
        let isCollapsed = false;
        let lastKnownHeight = isMobile ? "50vh" : "350px";
        header.addEventListener("click", (e) => {
          if (e.target === calcBtn || e.target === closeBtn) return;
          isCollapsed = !isCollapsed;
          if (isCollapsed) {
            content.style.display = "none";
            container.style.height = `${header.offsetHeight + 2}px`;
            if (resizer) resizer.style.display = "none";
          } else {
            content.style.display = "block";
            container.style.height = lastKnownHeight;
            if (resizer) resizer.style.display = "block";
            content.style.height = `calc(100% - ${header.offsetHeight}px)`;
          }
          headerTitle.textContent = isCollapsed ? "\u672A\u6765\u8870\u51CF\u91CF \u25B8" : "\u672A\u6765\u8870\u51CF\u91CF \u25BE";
        });
        header.style.cssText = `
                background: ${d12 ? "#444" : "#e0e0e0"};
                padding: 8px 10px;
                font-weight: bold;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                flex-shrink: 0;
                position: relative;
                color: ${d12 ? "white" : "#333"};
                ${isMobile ? "" : "cursor: move;"}
            `;
        const calcBtn = document.createElement("button");
        calcBtn.textContent = "\u{1F504}";
        calcBtn.title = "\u91CD\u65B0\u8BA1\u7B97\u8D44\u6E90\u5269\u4F59\u91CF";
        calcBtn.style.cssText = `
                float: right;
                margin-right: 6px;
                background: transparent;
                border: none;
                color: ${d12 ? "white" : "#333"};
                font-size: 16px;
                cursor: pointer;
                user-select: none;
            `;
        calcBtn.onclick = async () => {
          calcBtn.disabled = true;
          calcBtn.textContent = "\u23F3";
          try {
            await window.calculateAll();
            DecayResultViewer.show();
          } catch (e) {
            console.error("\u8D44\u6E90\u8BA1\u7B97\u5931\u8D25", e);
          } finally {
            calcBtn.disabled = false;
            calcBtn.textContent = "\u{1F504}";
          }
        };
        header.appendChild(calcBtn);
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "\xD7";
        closeBtn.title = "\u5173\u95ED\u9762\u677F";
        closeBtn.style.cssText = `
                position: absolute;
                right: 8px;
                top: 6px;
                background: transparent;
                border: none;
                color: ${d12 ? "white" : "#333"};
                font-size: 16px;
                cursor: pointer;
                user-select: none;
            `;
        closeBtn.onclick = () => {
          container.style.display = "none";
        };
        header.appendChild(closeBtn);
        content = document.createElement("div");
        content.style.cssText = `
                flex: 1 1 auto;
                overflow: auto;
                padding: 10px;
            `;
        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);
        renderResult();
        if (!isMobile) {
          let isDragging = false, startX, startY, startLeft, startTop;
          header.addEventListener("mousedown", (e) => {
            if (e.target === closeBtn) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
          });
          window.addEventListener("mouseup", () => {
            isDragging = false;
          });
          window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            let newLeft = startLeft + (e.clientX - startX);
            let newTop = startTop + (e.clientY - startY);
            newLeft = Math.min(Math.max(newLeft, 0), window.innerWidth - container.offsetWidth);
            newTop = Math.min(Math.max(newTop, 0), window.innerHeight - container.offsetHeight);
            container.style.left = newLeft + "px";
            container.style.top = newTop + "px";
            container.style.bottom = "auto";
          });
          resizer = document.createElement("div");
          resizer.style.cssText = `
                    width: 14px;
                    height: 14px;
                    background: transparent;
                    position: absolute;
                    right: 2px;
                    bottom: 2px;
                    cursor: se-resize;
                    user-select: none;
                    z-index: 9998;
                `;
          container.appendChild(resizer);
          let isResizing = false;
          let startWidth, startHeight, startPageX, startPageY;
          resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            startPageX = e.pageX;
            startPageY = e.pageY;
            e.preventDefault();
            e.stopPropagation();
          });
          window.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            let newWidth = startWidth + (e.pageX - startPageX);
            let newHeight = startHeight + (e.pageY - startPageY);
            newWidth = Math.max(newWidth, 250);
            newHeight = Math.max(newHeight, 150);
            newWidth = Math.min(newWidth, window.innerWidth - container.getBoundingClientRect().left);
            newHeight = Math.min(newHeight, window.innerHeight - container.getBoundingClientRect().top);
            container.style.width = newWidth + "px";
            container.style.height = newHeight + "px";
            content.style.height = `calc(100% - ${header.offsetHeight}px)`;
          });
          window.addEventListener("mouseup", () => {
            if (isResizing) {
              lastKnownHeight = container.style.height;
              isResizing = false;
            }
          });
        }
        if (isMobile) {
          let isDragging = false, startX, startY, startLeft, startTop;
          header.addEventListener("touchstart", (e) => {
            if (e.target === closeBtn) return;
            const touch = e.touches[0];
            isDragging = true;
            startX = touch.clientX;
            startY = touch.clientY;
            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
          }, { passive: true });
          window.addEventListener("touchend", () => {
            isDragging = false;
          });
          window.addEventListener("touchmove", (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            let newLeft = startLeft + (touch.clientX - startX);
            let newTop = startTop + (touch.clientY - startY);
            newLeft = Math.min(Math.max(newLeft, 0), window.innerWidth - container.offsetWidth);
            newTop = Math.min(Math.max(newTop, 0), window.innerHeight - container.offsetHeight);
            container.style.left = newLeft + "px";
            container.style.top = newTop + "px";
            container.style.bottom = "auto";
          }, { passive: true });
        }
      };
      window.addEventListener("warehouse-updated", () => {
        if (container && container.style.display !== "none") {
          renderResult();
        }
      });
      window.addEventListener("marketOrders-updated", () => {
        if (container && container.style.display !== "none") {
          renderResult();
        }
      });
      window.addEventListener("contractsOutgoing-updated", () => {
        if (container && container.style.display !== "none") {
          renderResult();
        }
      });
      window.addEventListener("contractsIncoming-updated", () => {
        if (container && container.style.display !== "none") {
          renderResult();
        }
      });
      return {
        show() {
          if (!container) init2();
          else container.style.display = "flex";
          renderResult();
        },
        hide() {
          if (container) container.style.display = "none";
        },
        toggle() {
          if (!container || container.style.display === "none") this.show();
          else this.hide();
        }
      };
    })();
    (function() {
      const BASE_WAGES = {
        "0": 759,
        "1": 448.5,
        "2": 379.5,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 241.5,
        "7": 586.5,
        "8": 724.5,
        "9": 759,
        "A": 345,
        "a": 552,
        "b": 414,
        "B": 586.5,
        "C": 172.5,
        "c": 414,
        "D": 621,
        "d": 172.5,
        "E": 414,
        "e": 414,
        "F": 138,
        "f": 448.5,
        "G": 138,
        "g": 345,
        "H": 310.5,
        "h": 586.5,
        "I": 241.5,
        "i": 379.5,
        "j": 448.5,
        "k": 379.5,
        "L": 379.5,
        "l": 517.5,
        "M": 276,
        "m": 655.5,
        "n": 0,
        "O": 517.5,
        "o": 379.5,
        "P": 103.5,
        "p": 448.5,
        "q": 517.5,
        "Q": 276,
        "R": 483,
        "r": 586.5,
        "S": 310.5,
        "s": 586.5,
        "T": 138,
        "t": 207,
        "u": 241.5,
        "v": 79.35,
        "W": 345,
        "x": 483,
        "Y": 414,
        "y": 0,
        "z": 241.5
      };
      function getBuildingsData() {
        const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
        if (realmId === null) return [];
        const key = `SimcompaniesRetailCalculation_${realmId}`;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return [];
          const data2 = JSON.parse(raw);
          return data2.buildings || [];
        } catch (e) {
          return [];
        }
      }
      function getSRCData() {
        const realmId = typeof getRealmIdFromLink === "function" ? getRealmIdFromLink() : null;
        if (realmId === null) return null;
        const key = `SimcompaniesRetailCalculation_${realmId}`;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }
      function calcTotalAdminFee(buildings, SRC) {
        if (!buildings || buildings.length === 0 || !SRC) return 0;
        const adminOverhead = SRC.administration || 1;
        if (adminOverhead <= 1) return 0;
        let total = 0;
        for (const b of buildings) {
          if (String(b.position) === "P") continue;
          const baseWage = BASE_WAGES[b.kind];
          if (baseWage === void 0 || baseWage === 0) continue;
          const robotMultiplier = typeof b.robotsSpecialization === "number" ? 0.97 : 1;
          total += baseWage * b.size * 24 * robotMultiplier * (adminOverhead - 1);
        }
        return total;
      }
      function showCOOCalcModal() {
        const existing = document.getElementById("sc-coo-calc-overlay");
        if (existing) existing.remove();
        const buildings = getBuildingsData();
        const SRC = getSRCData();
        if (!buildings || buildings.length === 0) {
          alert("\u672A\u627E\u5230\u5EFA\u7B51\u6570\u636E\uFF0C\u8BF7\u5148\u5728\u6E38\u620F\u4E2D\u6253\u5F00\u4EFB\u610F\u9875\u9762\u4EE5\u89E6\u53D1\u5EFA\u7B51\u6570\u636E\u6355\u83B7\uFF0C\u6216\u624B\u52A8\u66F4\u65B0\u9886\u57DF\u6570\u636E\u3002");
          return;
        }
        if (!SRC) {
          alert("\u672A\u627E\u5230\u9886\u57DF\u6570\u636E\uFF0C\u8BF7\u5148\u66F4\u65B0\u9886\u57DF\u6570\u636E\uFF08\u5DE6\u4E0B\u89D2\u6309\u94AE\uFF09\u3002");
          return;
        }
        const totalFee = calcTotalAdminFee(buildings, SRC);
        const defaultCOO = SRC.adminBonus || 0;
        const d17 = DM();
        const bg = d17 ? "#1e1e1e" : "#fff";
        const fg = d17 ? "#efefef" : "#333";
        const fg2 = d17 ? "#ccc" : "#555";
        const border = d17 ? "#555" : "#ccc";
        const inputBg = d17 ? "#333" : "#f5f5f5";
        const inputFg = d17 ? "#efefef" : "#333";
        const accentBg = d17 ? "#1a3a5c" : "#e3f2fd";
        const accentBorder = d17 ? "#2a5a8c" : "#bbdefb";
        const resultBg = d17 ? "#1a3a1a" : "#e8f5e9";
        const resultBorder = d17 ? "#2a5a2a" : "#c8e6c9";
        const origOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const overlay = document.createElement("div");
        overlay.id = "sc-coo-calc-overlay";
        overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.5); z-index: 99999;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; transition: opacity 0.2s;
            `;
        const modal = document.createElement("div");
        modal.style.cssText = `
                background: ${bg}; color: ${fg}; border-radius: 12px;
                width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
                padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                font-family: sans-serif; transform: scale(0.95);
                transition: transform 0.2s;
            `;
        modal.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${border}; padding-bottom:12px; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:18px;">\u{1F4B0}COO\u6536\u76CA\u8BA1\u7B97</h3>
                    <button id="sc-coo-close" style="background:none; border:none; font-size:24px; cursor:pointer; color:${d17 ? "#aaa" : "#999"}; line-height:1;">&times;</button>
                </div>

                <div style="background:${accentBg}; border:1px solid ${accentBorder}; border-radius:8px; padding:12px; margin-bottom:16px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">\u5F53\u524D\u5730\u56FE\u4E0A\u6240\u6709\u5EFA\u7B51\u8FD0\u884C24\u5C0F\u65F6\u7684\u7BA1\u7406\u8D39</div>
                    <div id="sc-coo-total-fee" style="font-size:24px; font-weight:bold; color:#2196F3;">$${totalFee.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style="font-size:11px; color:${d17 ? "#888" : "#999"}; margin-top:4px;">\u7BA1\u7406\u8D39\u7528: ${(((SRC.administration || 1) - 1) * 100).toFixed(1)}% | \u5EFA\u7B51\u6570: ${buildings.length}</div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:14px; font-weight:bold; display:block; margin-bottom:6px;">COO\u6709\u6548\u70B9\u6570</label>
                    <input id="sc-coo-input" type="number" min="0" step="1" value="${defaultCOO}"
                        style="width:100%; padding:10px; border:1px solid ${border}; border-radius:6px;
                        background:${inputBg}; color:${inputFg}; font-size:16px; box-sizing:border-box;">
                </div>

                <div style="background:${resultBg}; border:1px solid ${resultBorder}; border-radius:8px; padding:12px;">
                    <div style="font-size:13px; color:${fg2}; margin-bottom:4px;">COO\u8282\u7701\u7684\u7BA1\u7406\u8D39</div>
                    <div id="sc-coo-saved-fee" style="font-size:24px; font-weight:bold; color:#4CAF50;">$0.00</div>
                    <div style="font-size:13px; color:${fg2}; margin-top:8px; margin-bottom:4px;">\u6BCF\u65E5\u5B9E\u9645\u7BA1\u7406\u8D39</div>
                    <div id="sc-coo-remain-fee" style="font-size:24px; font-weight:bold; color:#FF9800;">$0.00</div>
                </div>

                <div style="margin-top:16px; font-size:11px; color:${d17 ? "#888" : "#999"}; text-align:center;">
                    \u8BA1\u7B97\u516C\u5F0F\uFF1A\u67D0\u5EFA\u7B51\u7BA1\u7406\u8D39 = \u4E00\u7EA7\u57FA\u672C\u5DE5\u8D44*\u7B49\u7EA7*24h*\u673A\u5668\u4EBA*\u7BA1\u7406\u8D39\u7528 | COO\u8282\u7701\u7684\u7BA1\u7406\u8D39 = \u5EFA\u7B51\u7BA1\u7406\u8D39\u603B\u548C * COO\u6709\u6548\u70B9\u6570%
                </div>
            `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
          overlay.style.opacity = "1";
          modal.style.transform = "scale(1)";
        });
        const updateResult = () => {
          const cooPoints = parseFloat(document.getElementById("sc-coo-input")?.value) || 0;
          const savedFee = totalFee * (cooPoints / 100);
          const remainFee = totalFee - savedFee;
          const savedEl = document.getElementById("sc-coo-saved-fee");
          const remainEl = document.getElementById("sc-coo-remain-fee");
          if (savedEl) savedEl.textContent = "$" + savedFee.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          if (remainEl) remainEl.textContent = "$" + remainFee.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        document.getElementById("sc-coo-input").addEventListener("input", updateResult);
        updateResult();
        const closeModal = () => {
          overlay.style.opacity = "0";
          modal.style.transform = "scale(0.95)";
          setTimeout(() => {
            overlay.remove();
            document.body.style.overflow = origOverflow;
            document.removeEventListener("keydown", handleEsc);
          }, 200);
        };
        overlay.onclick = (e) => {
          if (e.target === overlay) closeModal();
        };
        document.getElementById("sc-coo-close").onclick = closeModal;
        const handleEsc = (e) => {
          if (e.key === "Escape") closeModal();
        };
        document.addEventListener("keydown", handleEsc);
      }
      function injectCOOButton() {
        const h3 = document.querySelector(".css-6zujxw h3");
        if (!h3) return;
        if (document.getElementById("sc-coo-calc-btn")) return;
        const btn = document.createElement("button");
        btn.id = "sc-coo-calc-btn";
        btn.textContent = "COO\u6536\u76CA\u8BA1\u7B97";
        btn.style.cssText = `
                margin-left: 12px; padding: 4px 12px; background: #2196F3; color: white;
                border: none; border-radius: 4px; cursor: pointer; font-size: 12px;
                font-weight: bold; vertical-align: middle; transition: all 0.2s;
            `;
        btn.onmouseenter = () => btn.style.backgroundColor = "#1976d2";
        btn.onmouseleave = () => btn.style.backgroundColor = "#2196F3";
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          showCOOCalcModal();
        };
        h3.appendChild(btn);
      }
      function isExecPage() {
        return /\/headquarters\/executives\/?$/.test(location.href);
      }
      const observer = new MutationObserver(() => {
        if (isExecPage()) injectCOOButton();
      });
      function init2() {
        if (typeof window.isPageModuleEnabled === "function" && !window.isPageModuleEnabled("cooProfit")) return;
        observer.observe(document.body, { childList: true, subtree: true });
        if (isExecPage()) injectCOOButton();
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init2);
      } else {
        init2();
      }
    })();
    (function() {
      "use strict";
      var MODULE_KEY = "snipboardPreview";
      function isEnabled() {
        return window.isPageModuleEnabled ? window.isPageModuleEnabled(MODULE_KEY) : true;
      }
      function injectStyles() {
        var styleId = "sc-snipboard-preview-style";
        var existingStyle = document.getElementById(styleId);
        var isDark = typeof DM === "function" ? DM() : false;
        var styleText = `
                .sc-snipboard-preview-img {
                    display: block !important;
                    max-width: 180px !important;
                    max-height: 180px !important;
                    width: 100% !important;
                    height: auto !important;
                    object-fit: cover !important;
                    box-sizing: border-box !important;
                    border-radius: 4px;
                    border: 1px solid ${isDark ? "#444" : "#ddd"} !important;
                    box-shadow: ${isDark ? "0 2px 8px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.15)"} !important;
                    margin-top: 8px !important;
                }
            `;
        if (existingStyle) {
          existingStyle.textContent = styleText;
        } else {
          var style = document.createElement("style");
          style.id = styleId;
          style.textContent = styleText;
          document.head.appendChild(style);
        }
      }
      function findChatContainers() {
        var byClass = document.querySelectorAll("div.css-xo2rg1.e1llepen2");
        if (byClass.length > 0) return byClass;
        return document.querySelectorAll('div[style*="column-reverse"][style*="overflow"]');
      }
      function isImageUrl(href) {
        return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(href);
      }
      function processLink(link) {
        var href = link.getAttribute("href");
        if (!href) return;
        if (!href.includes("snipboard.io")) return;
        if (link.getAttribute("data-snipboard-processed") === "1") return;
        var imgUrl = href;
        if (imgUrl.indexOf("http://") === 0) {
          imgUrl = imgUrl.replace("http://", "https://");
        }
        if (!isImageUrl(imgUrl)) {
          imgUrl = imgUrl.replace(/\/?$/, ".jpg");
        }
        link.setAttribute("data-snipboard-processed", "1");
        var img = document.createElement("img");
        img.src = imgUrl;
        img.className = "sc-snipboard-preview-img";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        img.style.height = "auto";
        img.setAttribute("data-sc-original-src", imgUrl);
        img.addEventListener("click", function(e) {
          e.stopPropagation();
          showLightbox(imgUrl);
        });
        link.parentNode.insertBefore(img, link.nextSibling);
      }
      function showLightbox(url) {
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:99999;display:flex;justify-content:center;align-items:center;cursor:pointer;overflow:hidden;";
        var closeBtn = document.createElement("span");
        closeBtn.textContent = "\xD7";
        closeBtn.style.cssText = "position:fixed;top:16px;right:24px;font-size:36px;color:#fff;cursor:pointer;z-index:100000;line-height:1;font-family:sans-serif;user-select:none;";
        closeBtn.addEventListener("click", function(e) {
          e.stopPropagation();
          closeLightbox();
        });
        function closeLightbox() {
          overlay.style.opacity = "0";
          setTimeout(function() {
            overlay.remove();
          }, 200);
          document.removeEventListener("keydown", onKeyDown);
        }
        function onKeyDown(e) {
          if (e.key === "Escape") closeLightbox();
        }
        overlay.addEventListener("click", closeLightbox);
        document.addEventListener("keydown", onKeyDown);
        var viewport = document.createElement("div");
        viewport.style.cssText = "width:90vw;height:90vh;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:default;";
        var img = document.createElement("img");
        img.src = url;
        img.style.cssText = "max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);cursor:zoom-in;touch-action:none;transition:opacity 0.2s,transform 0.12s ease-out;user-select:none;-webkit-user-drag:none;";
        img.style.opacity = "0";
        img.addEventListener("load", function() {
          img.style.opacity = "1";
        });
        var scale = 1;
        var offsetX = 0;
        var offsetY = 0;
        var dragStart = null;
        var activePointers = /* @__PURE__ */ new Map();
        var pinchStart = null;
        var lastTouchTap = null;
        function clampOffsets() {
          var maxX = Math.max(0, (img.clientWidth * scale - viewport.clientWidth) / 2);
          var maxY = Math.max(0, (img.clientHeight * scale - viewport.clientHeight) / 2);
          offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
          offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
        }
        function updateTransform() {
          if (scale === 1) {
            offsetX = 0;
            offsetY = 0;
          } else {
            clampOffsets();
          }
          img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
          img.style.cursor = scale > 1 ? dragStart ? "grabbing" : "grab" : "zoom-in";
        }
        function setScale(nextScale) {
          scale = Math.max(1, Math.min(3, nextScale));
          updateTransform();
        }
        viewport.addEventListener("wheel", function(e) {
          if (e.target !== img) return;
          e.preventDefault();
          setScale(scale + (e.deltaY < 0 ? 0.25 : -0.25));
        }, { passive: false });
        viewport.addEventListener("pointerdown", function(e) {
          activePointers.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            startedOnImage: e.target === img
          });
          viewport.setPointerCapture(e.pointerId);
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (activePointers.size === 2) {
            var points = Array.from(activePointers.values());
            lastTouchTap = null;
            pinchStart = {
              distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
              scale
            };
            if (!points[0].startedOnImage || !points[1].startedOnImage) {
              pinchStart = null;
            }
            dragStart = null;
            updateTransform();
            return;
          }
          if (scale <= 1 || !e.target || e.target !== img) return;
          dragStart = { x: e.clientX, y: e.clientY, offsetX, offsetY };
          updateTransform();
        });
        viewport.addEventListener("pointermove", function(e) {
          var pointer = activePointers.get(e.pointerId);
          if (!pointer) return;
          activePointers.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            startedOnImage: pointer.startedOnImage
          });
          if (pinchStart && activePointers.size === 2) {
            var points = Array.from(activePointers.values());
            var distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (pinchStart.distance > 0) {
              setScale(pinchStart.scale * distance / pinchStart.distance);
            }
            return;
          }
          if (!dragStart) return;
          offsetX = dragStart.offsetX + e.clientX - dragStart.x;
          offsetY = dragStart.offsetY + e.clientY - dragStart.y;
          updateTransform();
        });
        viewport.addEventListener("pointerup", function(e) {
          var wasDragging = dragStart && (Math.abs(e.clientX - dragStart.x) > 8 || Math.abs(e.clientY - dragStart.y) > 8);
          var wasPinching = pinchStart !== null;
          var pointer = activePointers.get(e.pointerId);
          var startedOnImage = pointer && pointer.startedOnImage;
          dragStart = null;
          activePointers.delete(e.pointerId);
          if (activePointers.size < 2) pinchStart = null;
          updateTransform();
          if (e.pointerType === "mouse" && e.button !== 0) return;
          if (wasDragging || wasPinching) {
            lastTouchTap = null;
            return;
          }
          if (!startedOnImage) {
            closeLightbox();
            return;
          }
          if (e.pointerType === "mouse") {
            setScale(scale > 1 ? 1 : 2);
          } else if (e.pointerType === "touch") {
            var now = Date.now();
            if (lastTouchTap && now - lastTouchTap < 300) {
              setScale(scale > 1 ? 1 : 2);
              lastTouchTap = null;
            } else {
              lastTouchTap = now;
            }
          }
        });
        viewport.addEventListener("pointercancel", function(e) {
          dragStart = null;
          activePointers.delete(e.pointerId);
          if (activePointers.size < 2) pinchStart = null;
          lastTouchTap = null;
          updateTransform();
        });
        viewport.addEventListener("click", function(e) {
          e.stopPropagation();
        });
        overlay.appendChild(closeBtn);
        viewport.appendChild(img);
        overlay.appendChild(viewport);
        document.body.appendChild(overlay);
        overlay.style.opacity = "0";
        overlay.style.transition = "opacity 0.2s";
        requestAnimationFrame(function() {
          overlay.style.opacity = "1";
        });
      }
      function scanContainer(container) {
        if (!isEnabled()) return;
        var links = container.querySelectorAll('a[href*="snipboard.io"]');
        for (var i = 0; i < links.length; i++) {
          processLink(links[i]);
        }
      }
      function scanAll() {
        if (!isEnabled()) return;
        var containers = findChatContainers();
        for (var i = 0; i < containers.length; i++) {
          scanContainer(containers[i]);
        }
      }
      var observer = null;
      var initAttempted = false;
      function init2() {
        if (initAttempted) return;
        initAttempted = true;
        if (!isEnabled()) return;
        injectStyles();
        scanAll();
        if (observer) observer.disconnect();
        observer = new MutationObserver(function(mutations) {
          if (!isEnabled()) return;
          for (var mi = 0; mi < mutations.length; mi++) {
            var m = mutations[mi];
            for (var ni = 0; ni < m.addedNodes.length; ni++) {
              var n = m.addedNodes[ni];
              if (n.nodeType === 1) {
                var links = n.querySelectorAll ? n.querySelectorAll('a[href*="snipboard.io"]') : [];
                for (var li = 0; li < links.length; li++) {
                  processLink(links[li]);
                }
                if (n.tagName === "A" && n.href && n.href.indexOf("snipboard.io") !== -1) {
                  processLink(n);
                }
              }
            }
          }
        });
        var containers = findChatContainers();
        for (var i = 0; i < containers.length; i++) {
          observer.observe(containers[i], { childList: true, subtree: true });
        }
      }
      var lastUrl = location.href;
      new MutationObserver(function() {
        if (lastUrl !== location.href) {
          lastUrl = location.href;
          initAttempted = false;
          if (observer) {
            observer.disconnect();
            observer = null;
          }
          setTimeout(init2, 300);
        }
      }).observe(document, { subtree: true, childList: true });
      setTimeout(init2, 500);
      return { init: init2 };
    })();
    (function() {
      "use strict";
      var MODULE_KEY = "chatInputExpander";
      function isEnabled() {
        return typeof window.isPageModuleEnabled === "function" ? window.isPageModuleEnabled(MODULE_KEY) : true;
      }
      function injectStyles() {
        var styleId = "sc-chat-input-expander-style";
        var existingStyle = document.getElementById(styleId);
        var isDark = typeof DM === "function" ? DM() : false;
        var desktopHeight = readCustomHeight("chatInputExpanderHeight", 130);
        var mobileHeight = readCustomHeight("chatInputExpanderHeightMobile", 90);
        var shadowColor = isDark ? "rgba(33, 150, 243, 0.5)" : "rgba(33, 150, 243, 0.3)";
        var styleText = `
                /* \u9ED8\u8BA4\u8FC7\u6E21\u52A8\u753B\uFF0C\u5B9E\u73B0\u5E73\u6ED1\u7684\u9AD8\u5EA6\u4F38\u7F29\u548C\u53D1\u5149\u6548\u679C */
                .sc-chat-textarea-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, border-color 0.2s !important;
                }
                .sc-chat-container-transition {
                    transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }

                /* \u7126\u70B9\u5728\u8F93\u5165\u6846\u5185\u65F6\u7684\u6269\u5927\u72B6\u6001\uFF08\u9ED8\u8BA4\u684C\u9762\u7AEF/\u5E73\u677F\uFF09 */
                .sc-chat-textarea-focused {
                    height: ${desktopHeight}px !important;
                    top: 0px !important;
                    bottom: 0px !important;
                    border-color: #2196F3 !important;
                    box-shadow: 0 0 10px ${shadowColor} !important;
                }
                /* \u4F7F\u8F93\u5165\u6846\u7D27\u90BB\u7684\u524D\u7F6E\u9AD8\u4EAE\u6E32\u67D3 div \u7684\u9AD8\u5EA6\u540C\u6B65\u62C9\u4F38\uFF0C\u9632\u6B62\u6587\u672C\u8F93\u5165\u5C42\u7EA7\u9519\u4F4D\u5BFC\u81F4\u8F93\u5165\u6CD5\u5B9A\u4F4D\u5931\u7075\u88AB\u8986\u76D6 */
                .sc-chat-wrap-focused > div {
                    height: ${desktopHeight}px !important;
                    min-height: ${desktopHeight}px !important;
                }
                .sc-chat-input-group-focused {
                    height: ${desktopHeight}px !important;
                }
                /* \u53D1\u9001\u6309\u94AE\u5BB9\u5668\u9AD8\u5EA6\u6269\u5927\uFF0C\u5E76\u5229\u7528 vertical-align \u9760\u5E95\u5BF9\u9F50\uFF0C\u4FDD\u6301\u539F\u6709 table-cell \u5E03\u5C40\u4E0D\u88AB\u7834\u574F */
                .sc-chat-btn-focused {
                    height: ${desktopHeight}px !important;
                    vertical-align: bottom !important;
                }
                .sc-chat-outer-focused {
                    height: ${desktopHeight + 8}px !important;
                }

                /* \u79FB\u52A8\u7AEF/\u5C0F\u5C4F\u5E55\u9002\u914D\uFF1A\u9632\u6B62\u5F39\u51FA\u7684\u865A\u62DF\u952E\u76D8\u548C\u8FC7\u5927\u8F93\u5165\u6846\u906E\u6321\u5168\u90E8\u5C4F\u5E55 */
                @media (max-width: 767px) {
                    .sc-chat-textarea-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-wrap-focused > div {
                        height: ${mobileHeight}px !important;
                        min-height: ${mobileHeight}px !important;
                    }
                    .sc-chat-input-group-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-btn-focused {
                        height: ${mobileHeight}px !important;
                    }
                    .sc-chat-outer-focused {
                        height: ${mobileHeight + 8}px !important;
                    }
                }
            `;
        if (existingStyle) {
          existingStyle.textContent = styleText;
        } else {
          var style = document.createElement("style");
          style.id = styleId;
          style.textContent = styleText;
          document.head.appendChild(style);
        }
      }
      function readCustomHeight(key, fallback) {
        try {
          var cfg = JSON.parse(localStorage.getItem("SC_PageActions_Settings") || "{}");
          var value = parseInt(cfg[key], 10);
          if (!isFinite(value)) return fallback;
          return Math.max(40, value);
        } catch (e) {
          return fallback;
        }
      }
      function isChatInput(el) {
        if (!el || el.tagName !== "TEXTAREA") return false;
        var inputGroup = el.closest(".input-group");
        if (!inputGroup) return false;
        var isInsideChat = false;
        var cur = el.parentElement;
        while (cur && cur !== document.body) {
          if (cur.classList.contains("e1llepen1") || cur.querySelector(".e1llepen2") || cur.querySelector('div[style*="column-reverse"]')) {
            isInsideChat = true;
            break;
          }
          cur = cur.parentElement;
        }
        return isInsideChat;
      }
      function findContainers(textarea) {
        var inputGroup = textarea.closest(".input-group");
        var btnContainer = inputGroup ? inputGroup.querySelector(".input-group-btn") : null;
        var outerContainer = null;
        var chatRoom = textarea.closest(".e1llepen1");
        if (!chatRoom) {
          var cur = textarea.parentElement;
          while (cur && cur !== document.body) {
            if (cur.querySelector(".e1llepen2") || cur.querySelector('div[style*="column-reverse"]')) {
              chatRoom = cur;
              break;
            }
            cur = cur.parentElement;
          }
        }
        if (chatRoom) {
          var cur = textarea.parentElement;
          while (cur && cur !== chatRoom) {
            if (cur.parentElement === chatRoom) {
              outerContainer = cur;
              break;
            }
            cur = cur.parentElement;
          }
        }
        if (!outerContainer && inputGroup) {
          outerContainer = inputGroup.parentElement;
          if (outerContainer && outerContainer.style.width === "100%") {
            outerContainer = outerContainer.parentElement;
          }
        }
        return {
          inputGroup,
          btnContainer,
          outerContainer
        };
      }
      function init2() {
        if (!isEnabled()) return;
        injectStyles();
      }
      var isClickingInside = false;
      function collapseContainers(textarea) {
        var containers = findContainers(textarea);
        textarea.classList.remove("sc-chat-textarea-focused");
        var parent = textarea.parentElement;
        if (parent) {
          parent.classList.remove("sc-chat-wrap-focused");
        }
        if (containers.inputGroup) {
          containers.inputGroup.classList.remove("sc-chat-input-group-focused");
        }
        if (containers.btnContainer) {
          containers.btnContainer.classList.remove("sc-chat-btn-focused");
        }
        if (containers.outerContainer) {
          containers.outerContainer.classList.remove("sc-chat-outer-focused");
        }
      }
      function collapseAll() {
        var expanded = document.querySelectorAll(".sc-chat-textarea-focused");
        for (var i = 0; i < expanded.length; i++) {
          collapseContainers(expanded[i]);
        }
      }
      document.addEventListener("mousedown", function(e) {
        if (!isEnabled()) return;
        var target = e.target;
        if (target) {
          var inputGroup = target.closest(".input-group");
          var outerFocused = target.closest(".sc-chat-outer-focused");
          if (inputGroup || outerFocused) {
            isClickingInside = true;
            return;
          }
        }
        isClickingInside = false;
      });
      document.addEventListener("mouseup", function() {
        if (!isEnabled()) return;
        setTimeout(function() {
          isClickingInside = false;
          var activeEl = document.activeElement;
          if (!isChatInput(activeEl)) {
            collapseAll();
          }
        }, 150);
      });
      document.addEventListener("focusin", function(e) {
        if (!isEnabled()) return;
        var target = e.target;
        if (isChatInput(target)) {
          var containers = findContainers(target);
          target.classList.add("sc-chat-textarea-transition");
          target.classList.add("sc-chat-textarea-focused");
          var parent = target.parentElement;
          if (parent) {
            parent.classList.add("sc-chat-container-transition");
            parent.classList.add("sc-chat-wrap-focused");
          }
          if (containers.inputGroup) {
            containers.inputGroup.classList.add("sc-chat-container-transition");
            containers.inputGroup.classList.add("sc-chat-input-group-focused");
          }
          if (containers.btnContainer) {
            containers.btnContainer.classList.add("sc-chat-container-transition");
            containers.btnContainer.classList.add("sc-chat-btn-focused");
          }
          if (containers.outerContainer) {
            containers.outerContainer.classList.add("sc-chat-container-transition");
            containers.outerContainer.classList.add("sc-chat-outer-focused");
          }
          setTimeout(function() {
            if (document.activeElement === target) {
              if (typeof target.scrollIntoViewIfNeeded === "function") {
                target.scrollIntoViewIfNeeded(false);
              } else {
                target.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }
            }
          }, 300);
        }
      });
      document.addEventListener("focusout", function(e) {
        var target = e.target;
        if (isChatInput(target)) {
          if (isClickingInside) return;
          collapseContainers(target);
        }
      });
      init2();
      window.scChatInputExpanderApplyStyles = injectStyles;
    })();
    const UPDATE_IGNORE_KEY = "sc_autoMaxPPHPL_ignored_version";
    function compareVersions(v1, v2) {
      const a = v1.split(".").map(Number);
      const b = v2.split(".").map(Number);
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const num1 = a[i] || 0;
        const num2 = b[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
      }
      return 0;
    }
    function showUpdateToast(version, changelog, downloadUrl) {
      const dUp = DM();
      const style = document.createElement("style");
      style.textContent = `
            .sc-update-toast {
                position: fixed; top: -80px; left: 50%; transform: translateX(-50%);
                z-index: 10001; background: #2196F3; color: white;
                padding: 10px 20px; border-radius: 50px; cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                max-width: 90vw; width: max-content;
                font-family: sans-serif; box-sizing: border-box;
            }
            .sc-update-toast.show { top: 20px; }

            /* \u591A\u4E2A\u811A\u672C\u540C\u65F6\u63D0\u793A\u65F6\uFF0C\u540E\u51FA\u73B0\u7684\u5F39\u7A97\u5411\u4E0B\u9519\u5F00\uFF0C\u907F\u514D\u53E0\u5728\u4E00\u8D77 */
            .sc-update-toast-autoMaxPPHPL.show ~ .sc-update-toast.show,
            .sc-update-toast.show ~ .sc-update-toast-autoMaxPPHPL.show { top: 80px; }

            /* \u5C55\u5F00\u540E\u7684\u5361\u7247\u6837\u5F0F */
            .sc-update-toast.expanded {
                border-radius: 12px; padding: 20px; width: 400px;
                background: ${dUp ? "#1e1e1e" : "#ffffff"}; color: ${dUp ? "#efefef" : "#333"}; cursor: default;
                border-top: 5px solid #2196F3;
            }

            .sc-update-header {
                margin: 0; font-size: 14px; font-weight: bold;
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .sc-update-toast.expanded .sc-update-header {
                color: #2196F3; font-size: 18px; justify-content: flex-start;
            }

            /* \u53F3\u4E0A\u89D2\u5173\u95ED\u6309\u94AE */
            .sc-update-close {
                position: absolute; top: 10px; right: 12px;
                display: none; cursor: pointer; font-size: 20px; color: ${dUp ? "#aaa" : "#999"};
                line-height: 1; padding: 5px;
            }
            .sc-update-toast.expanded .sc-update-close { display: block; }
            .sc-update-close:hover { color: ${dUp ? "#ccc" : "#333"}; }

            /* \u5185\u5BB9\u533A\u57DF */
            .sc-update-body {
                max-height: 0; opacity: 0; transition: all 0.3s ease; overflow: hidden;
            }
            .sc-update-toast.expanded .sc-update-body {
                max-height: 400px; opacity: 1; margin-top: 15px;
            }

            .sc-changelog-box {
                background: ${dUp ? "#2a2a2a" : "#f5f7f9"}; padding: 12px; border-radius: 6px;
                margin: 10px 0; color: ${dUp ? "#ccc" : "#555"}; font-size: 13px;
                border-left: 3px solid ${dUp ? "#555" : "#ddd"}; max-height: 150px; overflow-y: auto;
            }

            /* \u5E95\u90E8\u6309\u94AE\u533A\u57DF */
            .sc-update-actions {
                display: flex; justify-content: space-between; align-items: center; margin-top: 20px;
            }
            .sc-btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: bold; }
            .sc-btn-primary { background: #2196F3; color: white; }
            .sc-btn-link { background: transparent; color: ${dUp ? "#aaa" : "#999"}; text-decoration: underline; padding: 8px 0; }
            .sc-btn-link:hover { color: ${dUp ? "#ccc" : "#666"}; }
        `;
      document.head.appendChild(style);
      const toast = document.createElement("div");
      toast.className = "sc-update-toast sc-update-toast-autoMaxPPHPL";
      toast.innerHTML = `
            <div class="sc-update-close" id="sc-autoMax-close" title="\u6682\u65F6\u5173\u95ED">&times;</div>
            <div class="sc-update-header" id="sc-autoMax-title">\u81EA\u52A8\u8BA1\u7B97\u6700\u5927\u65F6\u5229\u6DA6\u63D2\u4EF6 \u53D1\u73B0\u65B0\u7248\u672C v${version} (\u70B9\u51FB\u67E5\u770B)</div>
            <div class="sc-update-body">
                <p style="margin:0; font-weight:bold;">\u66F4\u65B0\u65E5\u5FD7\uFF1A</p>
                <div class="sc-changelog-box">${changelog.replace(/\n/g, "<br>") || "\u4FEE\u590D\u5DF2\u77E5\u95EE\u9898\uFF0C\u4F18\u5316\u6027\u80FD\u3002"}</div>
                <p style="font-size: 11px; color: ${dUp ? "#aaa" : "#999"}; margin: 10px 0;">
                    \u63D0\u793A\uFF1A\u5FFD\u7565\u540E\u5C06\u4E0D\u518D\u63D0\u793A\u6B64\u7248\u672C\u3002
                </p>
                <div class="sc-update-actions">
                    <button class="sc-btn sc-btn-link" id="sc-autoMax-ignore-forever">\u5FFD\u7565\u6B64\u6B21\u66F4\u65B0</button>
                    <button class="sc-btn sc-btn-primary" id="sc-autoMax-confirm">\u524D\u5F80\u66F4\u65B0</button>
                </div>
            </div>
        `;
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add("show"), 100);
      toast.onclick = (e) => {
        if (!toast.classList.contains("expanded")) {
          toast.classList.add("expanded");
          toast.querySelector("#sc-autoMax-title").innerHTML = `\u81EA\u52A8\u8BA1\u7B97\u6700\u5927\u65F6\u5229\u6DA6\u63D2\u4EF6 \u65B0\u7248\u672C\uFF1Av${version}`;
        }
      };
      toast.querySelector("#sc-autoMax-close").onclick = (e) => {
        e.stopPropagation();
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      };
      toast.querySelector("#sc-autoMax-ignore-forever").onclick = (e) => {
        e.stopPropagation();
        localStorage.setItem(UPDATE_IGNORE_KEY, version);
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      };
      toast.querySelector("#sc-autoMax-confirm").onclick = (e) => {
        e.stopPropagation();
        window.open(downloadUrl, "_blank");
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
      };
    }
    function checkUpdate() {
      const scriptUrl = "https://sc.22-7.top/scripts/autoMaxPPHPL.user.js?t=" + Date.now();
      const downloadUrl = "https://sc.22-7.top/scripts/autoMaxPPHPL.user.js";
      fetch(scriptUrl).then((res) => res.text()).then((remoteText) => {
        const matchVersion = remoteText.match(/^\s*\/\/\s*@version\s+([0-9.]+)/m);
        const matchChange = remoteText.match(/^\s*\/\/\s*@changelog\s+(.+)/m);
        if (!matchVersion) return;
        latestVersion = matchVersion[1];
        const changeLog = matchChange ? matchChange[1] : "";
        const isNewer = compareVersions(latestVersion, localVersion) > 0;
        if (isNewer) {
          hasNewVersion = true;
          console.log(`\u{1F4E2} \u53D1\u73B0\u65B0\u7248\u672C v${latestVersion}`);
          const ignoredVersion = localStorage.getItem(UPDATE_IGNORE_KEY);
          if (ignoredVersion && compareVersions(ignoredVersion, latestVersion) >= 0) {
            console.log(`[Update] \u7528\u6237\u5DF2\u5FFD\u7565\u6B64\u7248\u672C\uFF0C\u4E0D\u5F39\u51FA UI \u63D0\u793A`);
            return;
          }
          showUpdateToast(latestVersion, changeLog, downloadUrl);
        } else {
          hasNewVersion = false;
          console.log("\u2705 \u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C");
        }
      }).catch((err) => {
        console.error("\u68C0\u67E5\u66F4\u65B0\u5931\u8D25", err);
        hasNewVersion = false;
      });
    }
    setTimeout(checkUpdate, 3e3);
  })();
})();

// @changelog 餐馆备货提醒新增详细设置（品质范围、预警天数、目标天数）与品质明细视图，差量一键复制。
