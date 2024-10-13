// ==UserScript==
// @name         关闭交易所背景图片
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  通过判断css名字删除
// @author       Rabbit House
// @match        https://www.simcompanies.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Add a style tag to the document head to hide the images with the specified class
    const style = document.createElement('style');
    style.innerHTML = 'img.css-8ugz72 { display: none !important; }';
    document.head.appendChild(style);
})();
