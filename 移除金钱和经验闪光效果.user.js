// ==UserScript==
// @name         移除金钱和经验闪光效果
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  由于获取经验后css每次不同，采取直接删除经验进度条
// @author       Rabbit House
// @match        https://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 控制日志输出的开关
    const enableLogging = false; // 将此设置为 false 可禁用日志

    // 日志函数
    function log(...args) {
        if (enableLogging) {
            console.log(...args);
        }
    }

    // 用于存储获取的原始类名
    let originalClassName = '';

    // 延迟删除子元素，确保元素完全加载
    function removeChildDiv() {
        setTimeout(() => {
            const anchorsToCheck = [
                'a[href="/zh/encyclopedia/0/levels/"]',
                'a[href="/zh/encyclopedia/1/levels/"]'
            ];

            for (const anchorSelector of anchorsToCheck) {
                const parentAnchor = document.querySelector(anchorSelector);
                if (parentAnchor) {
                    const parentDiv = parentAnchor.querySelector('div');
                    if (parentDiv) {
                        const childDiv = parentDiv.querySelector('div');
                        if (childDiv) {
                            log('要删除的子元素:', childDiv);
                            childDiv.remove();
                        } else {
                            log('未找到要删除的子元素');
                        }
                    } else {
                        log('未找到父 div');
                    }
                } else {
                    log(`未找到具有指定 href 的 a 标签: ${anchorSelector}`);
                }
            }
        }, 1000); // 延迟 1 秒
    }

    // 获取和监听类名的函数
    function monitorClassChange() {
        setTimeout(() => {
            const targetAnchor = document.querySelector('a[href="/zh/headquarters/overview/"]');

            if (targetAnchor) {
                const targetDiv = targetAnchor.querySelector('div > div');

                if (targetDiv) {
                    originalClassName = targetDiv.className;
                    log('当前类名:', originalClassName);

                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === "attributes" && mutation.target.classList.contains(originalClassName) === false) {
                                log('类名已更改，当前类名:', mutation.target.className);
                                mutation.target.className = originalClassName;
                                log('已恢复类名:', originalClassName);
                            }
                        });
                    });

                    observer.observe(targetDiv, {
                        attributes: true,
                        subtree: false,
                    });
                } else {
                    log('未找到目标 div');
                }
            } else {
                log('未找到具有指定 href 的 a 标签');
            }
        }, 1000); // 延迟 1 秒
    }

    // 页面加载时执行
    window.onload = () => {
        removeChildDiv();
        monitorClassChange();
    };
})();
