// ==UserScript==
// @name         显示高管培训记录
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  在高管详情页和公司主页的高管详情页展示公司高管培训记录
// @author       Rabbit House
// @match        *://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
  
    //console.log('[培训补全脚本] 脚本已加载');
  
    let capturedData = null;
  
    // Hook XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
  
    XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalOpen.apply(this, arguments);
    };
  
    XMLHttpRequest.prototype.send = function() {
      if (this._url && this._url.includes('/api/v4/executives/')) {
        //console.log(`[培训补全脚本] 捕获XHR executive数据请求：${this._url}`);
        this.addEventListener('load', function() {
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
      try {
        if (!capturedData) {
          //console.warn('[培训补全脚本] 未捕获executive数据，无法渲染培训记录');
          return;
        }
  
        const trainings = capturedData.trainings;
        const progressBlock = document.querySelector('.progress.css-g21kl4.ewwt81t1');
        if (!progressBlock) {
          //console.warn('[培训补全脚本] 找不到进度条块');
          return;
        }
  
        const container = progressBlock.closest('div[class*="css-1x8nqp7"]')?.parentElement;
        if (!container) {
          //console.warn('[培训补全脚本] 找不到培训记录容器');
          return;
        }
  
        //console.log(`[培训补全脚本] 已获取 ${trainings.length} 条培训记录，开始渲染`);
  
        // 删除旧培训记录块
        let nextNode = progressBlock.closest('div[class*="css-1x8nqp7"]').nextElementSibling;
        while (nextNode && nextNode.classList.contains('css-1x8nqp7') && !nextNode.querySelector('.progress')) {
          const toRemove = nextNode;
          nextNode = nextNode.nextElementSibling;
          toRemove.remove();
        }
  
        // 插入新培训记录
        let insertAfter = progressBlock.closest('div[class*="css-1x8nqp7"]');
        trainings.forEach(item => {
          try {
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
            div.className = 'css-1x8nqp7';
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
  
          } catch (err) {
            //console.error('[培训补全脚本] 渲染单条培训记录异常：', item, err);
          }
        });
  
        //console.log('[培训补全脚本] 所有培训记录渲染完成');
  
      } catch (err) {
        //console.error('[培训补全脚本] 渲染培训记录过程异常：', err);
      }
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
  
  })();
  