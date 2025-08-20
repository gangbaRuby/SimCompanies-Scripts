// ==UserScript==
// @name         显示高管培训记录
// @namespace    https://github.com/gangbaRuby
// @version      1.1.0
// @license      AGPL-3.0
// @description  在高管详情页和公司主页的高管详情页展示高管在所有公司的培训记录
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @updateURL    https://simcompanies-scripts.pages.dev/showExecTrainingLogs.user.js
// @downloadURL  https://simcompanies-scripts.pages.dev/showExecTrainingLogs.user.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @grant        GM_info
// ==/UserScript==

(function () {
  'use strict';

  //console.log('[培训补全脚本] 脚本已加载');

  let capturedData = null;

  // Hook XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this._url && this._url.includes('/api/v4/executives/')) {
      //console.log(`[培训补全脚本] 捕获XHR executive数据请求：${this._url}`);
      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          //console.log('[培训补全脚本] 成功捕获executive数据：', data);
          capturedData = data;
          // 同时尝试渲染培训记录和补全文字块
          if (document.querySelector('.progress.css-g21kl4.ewwt81t1')) {
            renderTrainings();
          } else {
            waitForElement('.progress.css-g21kl4.ewwt81t1', renderTrainings);
          }
          // 观察并补全所有文字培训块
          observeAndPatchTrainingBlocks();
        } catch (err) {
          //console.error('[培训补全脚本] 解析executive XHR数据失败：', err);
        }
      });
    }
    return originalSend.apply(this, arguments);
  };

  // 等待元素
  function waitForElement(selector, callback) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        callback(el);
        return;
      }
      const observer = new MutationObserver(() => {
        const target = document.querySelector(selector);
        if (target) {
          observer.disconnect();
          callback(target);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (err) {
      //console.error('[培训补全脚本] waitForElement异常：', err);
    }
  }

  // 渲染培训记录（原进度条旁）
  function renderTrainings() {
    if (!capturedData) return;

    const trainings = capturedData.trainings;
    const progressBlock = document.querySelector('.progress.css-g21kl4.ewwt81t1');
    if (!progressBlock) return;

    const container = progressBlock.closest('div[class*="css-1x8nqp7"]')?.parentElement;
    if (!container) return;

    // 如果已经渲染过，就不再重复
    if (container.querySelector('.custom-training-block')) {
      // console.log('[培训补全脚本] 自定义培训块已存在，跳过渲染');
      return;
    }

    let insertAfter = progressBlock.closest('div[class*="css-1x8nqp7"]');
    trainings.forEach(item => {
      if (!item.reflected) return;

      let skillsText = '';
      if (item.skillCoo) skillsText += `<div>管理 +${item.skillCoo}</div>`;
      if (item.skillCfo) skillsText += `<div>会计 +${item.skillCfo}</div>`;
      if (item.skillCmo) skillsText += `<div>沟通 +${item.skillCmo}</div>`;
      if (item.skillCto) skillsText += `<div>科学 +${item.skillCto}</div>`;

      let trainingName = '';
      if (item.training === 'o') trainingName = '管理培训';
      if (item.training === 'f') trainingName = '会计课程';
      if (item.training === 'm') trainingName = '沟通工作室';
      if (item.training === 't') trainingName = '科学界研讨会';
      if (item.training === 'g') trainingName = '各领域课程';

      const companyNameSlug = item.employer.company.replace(/\s+/g, '-');

      const div = document.createElement('div');
      div.className = 'css-1x8nqp7 custom-training-block';
      div.innerHTML = `
        <div class="pull-right text-right">${skillsText}</div>
        <b class="text-uppercase">${trainingName}</b><br>
        在<a href="/zh-cn/company/0/${companyNameSlug}/">
          <img alt="" width="22" height="22" src="${item.employer.logo}"> ${item.employer.company}
        </a>
        <div class="cb"></div>
      `;
      insertAfter.after(div);
      insertAfter = div;
    });

    // console.log('[培训补全脚本] 培训记录渲染完成，确保监控启动');
    keepTrainingRendered();
  }

  function keepTrainingRendered() {
    const target = document.querySelector('.progress.css-g21kl4.ewwt81t1')?.closest('div[class*="css-1x8nqp7"]')?.parentElement;
    if (!target) {
      // console.log('[培训补全脚本] 暂未找到容器，稍后重试');
      return;
    }

    const observer = new MutationObserver((mutations) => {
      // console.log('[培训补全脚本] MutationObserver 触发：', mutations.length, '条');

      const container = document.querySelector('.progress.css-g21kl4.ewwt81t1')?.closest('div[class*="css-1x8nqp7"]')?.parentElement;
      if (!container) {
        // console.log('[培训补全脚本] 容器消失，等待重建');
        return;
      }

      if (!container.querySelector('.custom-training-block')) {
        // console.log('[培训补全脚本] 检测到培训记录丢失，重新渲染');
        renderTrainings();
      }
    });
    observer.observe(target, { childList: true, subtree: true });
    // console.log('[培训补全脚本] 已启动 MutationObserver');
  }


  // 观察并补全文字培训块（多个）
  function observeAndPatchTrainingBlocks() {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.css-1r0yqr6.e5jvmy50').forEach(block => {
        if (!block.dataset.patched && block.innerText.includes('培训:')) {
          block.dataset.patched = '1';
          patchTextBlock(block);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 初始时先执行一次
    document.querySelectorAll('.css-1r0yqr6.e5jvmy50').forEach(block => {
      if (!block.dataset.patched && block.innerText.includes('培训:')) {
        block.dataset.patched = '1';
        patchTextBlock(block);
      }
    });
  }

  // 在文字块内补全技能点
  function patchTextBlock(block) {
    try {
      if (!capturedData) {
        //console.warn('[培训补全脚本] 未捕获executive数据，无法补全文字块');
        return;
      }
      const trainings = capturedData.trainings; // 不过滤，保留全部
      //console.log(`[培训补全脚本] 找到 ${trainings.length} 条记录`);

      const rows = [...block.querySelectorAll('div')].filter(div => div.innerText.includes('在'));
      //console.log(`[培训补全脚本] 找到 ${rows.length} 行文字记录`);

      let idx = 0;
      rows.forEach(row => {
        if (row.querySelector('.text-muted')) return;

        const item = trainings[idx++];
        if (!item) return;

        let skillsText = '';
        if (item.reflected === false) {
          skillsText = '正在培训中';
        } else {
          if (item.skillCoo) skillsText += `管理+${item.skillCoo} `;
          if (item.skillCfo) skillsText += `会计+${item.skillCfo} `;
          if (item.skillCmo) skillsText += `沟通+${item.skillCmo} `;
          if (item.skillCto) skillsText += `科学+${item.skillCto} `;
        }

        const div = document.createElement('div');
        div.className = 'text-muted';
        div.style.marginTop = '3px';
        div.textContent = skillsText.trim();

        row.appendChild(div);
      });

      //console.log('[培训补全脚本] 文字块技能补全完成');
    } catch (err) {
      //console.error('[培训补全脚本] 文字块补全异常：', err);
    }
  }

  // 检测更新
  const localVersion = GM_info.script.version;
  const scriptUrl = 'https://simcompanies-scripts.pages.dev/showExecTrainingLogs.user.js?t=' + Date.now();
  const downloadUrl = 'https://simcompanies-scripts.pages.dev/showExecTrainingLogs.user.js';

  function compareVersions(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const n1 = a[i] || 0;
      const n2 = b[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  function checkUpdate() {
    fetch(scriptUrl)
      .then(r => r.text())
      .then(text => {
        const match = text.match(/@version\s+([0-9.]+)/);
        if (!match) return;

        const remoteVersion = match[1];
        if (compareVersions(remoteVersion, localVersion) > 0) {
          if (confirm(`显示高管培训记录插件发现新版本 v${remoteVersion}，是否前往更新？`)) {
            window.open(downloadUrl, '_blank');
          }
        }
      })
      .catch(err => {
        console.warn('检查更新失败：', err);
      });
  }

  setTimeout(checkUpdate, 3000);

})();
