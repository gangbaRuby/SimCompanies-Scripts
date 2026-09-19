const MODULE_KEY = 'buildingUpgradeMaterialCopy';
const BUTTON_ATTRIBUTE = 'data-sc-building-upgrade-copy';
const COPY_BUTTON_LABEL = '复制';
const MP_BUTTON_LABEL = 'MP-4%';

const RESOURCE_CODES = {
    'reinforced-concrete': 're-101',
    bricks: 're-102',
    planks: 're-108',
    'construction-units': 're-111'
};

let observer = null;
let timer = null;

function isEnabled() {
    return typeof window.isPageModuleEnabled !== 'function' || window.isPageModuleEnabled(MODULE_KEY);
}

function getResourceCode(row) {
    const image = row.querySelector('td:first-child img[src*="/static/images/resources/"]');
    if (!image) return null;

    const match = image.src.match(/\/resources\/([^./]+)(?:\.[^./]+)?\.[^./]+$/);
    return match ? RESOURCE_CODES[match[1]] ?? null : null;
}

function getMaterials(dialog) {
    return [...dialog.querySelectorAll('table tbody tr')]
        .map(row => {
            const code = getResourceCode(row);
            const requiredText = row.querySelector('td:nth-child(2) b')?.textContent.trim();
            const warehouseText = row.querySelector('td:nth-child(3)')?.textContent.trim();
            const required = Number.parseInt(requiredText?.replace(/[^\d-]/g, ''), 10);
            const warehouse = Number.parseInt(warehouseText?.replace(/[^\d-]/g, ''), 10);
            const missing = Math.max(0, required - warehouse);
            return code && Number.isFinite(missing) && missing > 0 ? `:${code}: x${missing.toLocaleString('en-US')}` : null;
        })
        .filter(Boolean);
}

function findBuyMissingButton(dialog) {
    return [...dialog.querySelectorAll('button')]
        .find(button => button.querySelector('svg[data-icon="right-left"]'));
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (error) {
        // Ignore unsupported document.execCommand environments.
    }
    textarea.remove();
    return copied;
}

function copyText(text) {
    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
}

function copyMaterials(button, dialog, prefix) {
    const materials = getMaterials(dialog);
    if (materials.length === 0) return;

    const text = `${prefix}\n${materials.join('\n')}`;
    copyText(text).then(copied => {
        if (!copied) throw new Error('Copy failed');
        const originalText = button.textContent;
        button.textContent = '已复制';
        setTimeout(() => {
            if (button.isConnected) button.textContent = originalText;
        }, 1200);
    }).catch(() => {
        button.textContent = '复制失败';
        setTimeout(() => {
            if (button.isConnected) button.textContent = button.dataset.label;
        }, 1200);
    });
}

function removeButtons() {
    document.querySelectorAll(`[${BUTTON_ATTRIBUTE}]`).forEach(button => button.remove());
}

function inject(dialog) {
    if (!isEnabled()) {
        removeButtons();
        return;
    }

    if (dialog.querySelector(`[${BUTTON_ATTRIBUTE}]`)) return;
    if (getMaterials(dialog).length === 0) return;

    const buyMissingButton = findBuyMissingButton(dialog);
    if (!buyMissingButton?.parentElement) return;

    const createCopyButton = (label, prefix) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = buyMissingButton.className;
        button.setAttribute(BUTTON_ATTRIBUTE, 'true');
        button.dataset.label = label;
        button.textContent = label;
        button.style.padding = '6px 10px';
        button.style.marginRight = '4px';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            copyMaterials(button, dialog, prefix);
        });
        return button;
    };

    const buttonContainer = buyMissingButton.parentElement;
    buttonContainer.insertBefore(createCopyButton(COPY_BUTTON_LABEL, 'BUYING'), buyMissingButton);
    buttonContainer.insertBefore(createCopyButton(MP_BUTTON_LABEL, 'BUYING MP-4%'), buyMissingButton);
}

function init() {
    const scan = () => {
        timer = null;
        if (!isEnabled()) {
            removeButtons();
            return;
        }
        document.querySelectorAll('[role="dialog"]').forEach(inject);
    };
    if (observer) {
        scan();
        return;
    }
    observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(scan, 100);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    scan();
}

function destroy() {
    observer?.disconnect();
    observer = null;
    clearTimeout(timer);
    timer = null;
    removeButtons();
}

window.SC_Modules = window.SC_Modules || {};
window.SC_Modules.buildingUpgradeMaterialCopy = { init, destroy };
