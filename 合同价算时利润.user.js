// ==UserScript==
// @name         合同价算时利润
// @namespace    http://tampermonkey.net/
// @version      2024-08-31
// @description  Calculate profit based on contract prices in Sim Companies.
// @author       You
// @match        https://www.simcompanies.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=simcompanies.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const mapping = {
        '苹果': 3,
        '橘子': 4,
        '葡萄': 5,
        '牛排': 7,
        '香肠': 8,
        '鸡蛋': 9,
        '汽油': 11,
        '柴油': 12,
        '智能手机': 24,
        '平板电脑': 25,
        '笔记本电脑': 26,
        '显示器': 27,
        '电视机': 28,
        '经济电动车': 53,
        '豪华电动车': 54,
        '经济燃油车': 55,
        '豪华燃油车': 56,
        '卡车': 57,
        '内衣': 60,
        '手套': 61,
        '裙子': 62,
        '高跟鞋': 63,
        '手袋': 64,
        '运动鞋': 65,
        '圣诞爆竹': 67,
        '名牌手表': 70,
        '项链': 71,
        '无人机': 98,
        '砖块': 102,
        '水泥': 103,
        '木板': 108,
        '窗户': 109,
        '工具': 110,
        '咖啡粉': 119,
        '蔬菜': 120,
        '面包': 121,
        '芝士': 122,
        '苹果派': 123,
        '橙汁': 124,
        '苹果汁': 125,
        '姜汁汽水': 126,
        '披萨': 127,
        '面条': 128,
        '巧克力': 140,
        '圣诞装饰品': 144
    };

    const building_wages_mapping = {
        102: 172.5,
        103: 172.5,
        108: 172.5,
        109: 172.5,
        110: 172.5,
        11:	345,
        12: 345,
        60: 310.5,
        61: 310.5,
        62: 310.5,
        63: 310.5,
        64: 310.5,
        65: 310.5,
        70: 310.5,
        71: 310.5,
        3: 138,
        4: 138,
        5: 138,
        7: 138,
        8: 138,
        9: 138,
        119: 138,
        122: 138,
        123: 138,
        124: 138,
        125: 138,
        126: 138,
        127: 138,
        140: 138,
        24: 172.5,
        25: 172.5,
        26: 172.5,
        27: 172.5,
        28: 172.5,
        98: 172.5,
        53: 379.5,
        54: 379.5,
        55: 379.5,
        56: 379.5,
        57: 379.5,
        146: 207,
        147: 207,
        148: 207

    };


    // 检查URL变化的函数
    function checkURLChange() {
        const currentURL = window.location.href;
        if (currentURL === 'https://www.simcompanies.com/zh/headquarters/warehouse/incoming-contracts/') {
            executeLogic();
        }
    }

    // 你需要执行的逻辑
    function executeLogic() {
        const existingSelectElement = document.getElementById('leisure-facility-select');
        const existingButtonElement = document.querySelector('button[text="计算最大时利润"]');
        const incomingContractsHeader = document.querySelector('div.css-1baztp6');

        // 选择所有符合条件的元素
        const contractElements = document.querySelectorAll('[aria-label^="incoming contract"]');

        // 创建一个数组存储所有合同的数组
        const allContracts = [];

        // 用于存储创建的元素
        const createdElements = [];

        // 遍历每个合同元素
        contractElements.forEach(element => {
            const ariaLabel = element.getAttribute('aria-label');

            // 使用正则表达式提取质量，物品名称，单价
            const regex = /(\d+) quality (\d+) (.*?) at \$(\d+(\.\d+)?)/;
            const match = ariaLabel.match(regex);

            if (match) {
                // const contractQuantity = parseInt(match[1]);
                const contractQuality = parseInt(match[2]);
                const contractItemName = match[3];
                const contractUnitPrice = parseFloat(match[4]); // 确保单价为浮点数

                // 获取物品对应的 ID
                const contractItemId = mapping[contractItemName];

                // 如果物品不在 mapping 中，则跳过
                if (contractItemId === undefined) {
                    return; // 跳过当前物品，继续下一个
                }

                // 将物品ID、质量、单价转成数组并存储
                const contractArray = {
                    contractItemId: contractItemId,
                    contractQuality: contractQuality,
                    contractUnitPrice: contractUnitPrice,
                    element: element // 需要在之后插入数据的 DOM 元素
                };



                allContracts.push(contractArray);
            }
        });

        // 输出所有合同数组
        // console.log(`所有合同数组: ${JSON.stringify(allContracts)}`);

        if ((!existingSelectElement || !existingButtonElement) && allContracts.length != 0) {

            // 创建文本标签元素
            var labelElement = document.createElement('span');
            labelElement.textContent = '    已运行休闲建筑的总等级：';
            labelElement.style.marginRight = '8px'; // 添加一些空格以使其与选择框保持距离

            // 创建一个选择框元素
            var selectElement = document.createElement('select');
            selectElement.id = 'leisure-facility-select';

            // 添加选项到选择框
            for (let i = 0; i <= 9; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = i;
                selectElement.appendChild(option);
            }

            // 创建一个按钮元素
            var buttonElement = document.createElement('button');
            buttonElement.textContent = '计算最大时利润';
            buttonElement.style.marginLeft = '8px'; // 添加一些空格以使其与选择框保持距离

            // 创建错误提示元素
            var errorMessageElement = document.createElement('span');
            errorMessageElement.id = 'error-message';
            errorMessageElement.style.color = 'red';
            errorMessageElement.style.marginLeft = '8px'; // 添加一些空格以使其与按钮保持距离

            // 添加文本标签、选择框、按钮和错误提示到 "待处理入库件" 后面
            if (incomingContractsHeader) {
                incomingContractsHeader.appendChild(labelElement);
                incomingContractsHeader.appendChild(selectElement);
                incomingContractsHeader.appendChild(buttonElement);
                incomingContractsHeader.appendChild(errorMessageElement);
            }
        }


        // 监听按钮点击事件，触发 calculateMaxProfit 函数
        buttonElement.addEventListener('click', function() {
            // 删除之前创建的元素
            createdElements.forEach(element => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element); // 移除元素
                }
            });
            createdElements.length = 0; // 清空数组

            const leisureFacilityValue = parseInt(document.getElementById('leisure-facility-select').value, 10); // 获取选择框的值
            console.log(`选择的休闲建筑值: ${leisureFacilityValue}`);

            // 禁用按钮和选择框
            //buttonElement.disabled = true;
            //selectElement.disabled = true;
            errorMessageElement.textContent = ''; // 清除旧的错误信息

            // 调用 calculateMaxProfit 并处理结果
            calculateMaxProfit(leisureFacilityValue)

        });


        // 将 calculateMaxProfit 函数声明为 async，并接收多个返回值
        async function calculateMaxProfit(leisureFacilityValue) {
            if (allContracts.length === 0) {
                errorMessageElement.textContent = '没有可零售合同';
                return;
            }

            let result=[];

            console.log('计算最大时利润函数被触发');


            // 等待 getExecutives 返回数据
            const {
                totalManagementCost,
                totalSalesSpeed,
                realmId,
                acceleration_multiplier,
                economyState
            } = await getExecutives(leisureFacilityValue);

            // 等待 getSaturation 返回数据
            const {
                saturationArray
            } = await getSaturation(realmId);

            // 等待 getModelData 返回数据
            const {
                PROFIT_PER_BUILDING_LEVEL,
                RETAIL_MODELING_QUALITY_WEIGHT,
                modelJson
            } = await getModelData(economyState);
            // console.log(saturationArray)

            allContracts.forEach(contract => {
                const id = contract.contractItemId;
                const quality = contract.contractQuality;
                const cost = contract.contractUnitPrice;

                let maxProfitPerHour = 0; // 最大时利润
                let maxSalesPerUnitPerHour = 0; // 最大时销售速度
                let optimalSellPrice = 0; // 售价
                let averagePrice = 0;
                let saturation = 0;


                for (let j = 0; j < saturationArray.length; j++) {
                    if (saturationArray[j][0] == id){
                        averagePrice = saturationArray[j][1]
                        saturation = saturationArray[j][2]
                        break;
                    }
                }

                let buildingLevelsNeededPerHour = 0;
                let modeledProductionCostPerUnit = 0;
                let modeledStoreWages = 0;
                let modeledUnitsSoldAnHour = 0;


                buildingLevelsNeededPerHour = modelJson[economyState][id].buildingLevelsNeededPerHour
                modeledProductionCostPerUnit = modelJson[economyState][id].modeledProductionCostPerUnit
                modeledStoreWages = modelJson[economyState][id].modeledStoreWages
                modeledUnitsSoldAnHour = modelJson[economyState][id].modeledUnitsSoldAnHour


                const building_wages = building_wages_mapping[id]
                const n = building_wages * totalManagementCost / 100
                // console.log(n)
                let sellPrice = cost;
                let w=0;
                let s=0;
                /*
                console.log('物品id：' + id
                            + '\n品质：' + quality
                            + '\n成本：' + cost
                            + '\n均价：' + averagePrice
                            + '\n饱和度：' + saturation
                            + '\nbuildingLevelsNeededPerHour：' + buildingLevelsNeededPerHour
                            + '\nmodeledProductionCostPerUnit：' + modeledProductionCostPerUnit
                            + '\nmodeledStoreWages：' + modeledStoreWages
                            + '\nmodeledUnitsSoldAnHour：' + modeledUnitsSoldAnHour)

                            */
                while (sellPrice < 3 * averagePrice) {
                    // 在这里进行你的计算
                    // 计算p的值 物品成本

                    let vNr_a = Math.min(Math.max(2 - saturation, 0), 2)
                    let vNr_s = vNr_a / 2 + 0.5
                    let vNr_l = quality / 12
                    let vNr_d = PROFIT_PER_BUILDING_LEVEL * (buildingLevelsNeededPerHour + 1) * (vNr_a / 2 * (1 + vNr_l * RETAIL_MODELING_QUALITY_WEIGHT)) + (modeledStoreWages || 0)
                    let vNr_u = modeledUnitsSoldAnHour * vNr_s

                    // bNr函数 bNr(d, be.modeledProductionCostPerUnit, u, (f = be.modeledStoreWages) != null ? f : 0)
                    let vNr_h = modeledProductionCostPerUnit + (vNr_d + (modeledStoreWages || 0)) / vNr_u;

                    // xNr函数 xNr(d, h, G.averageRetailPrice, (y = be.modeledStoreWages) != null ? y : 0, be.modeledProductionCostPerUnit)
                    let xNr_a = ((modeledStoreWages || 0) + vNr_d) / ((vNr_h - modeledProductionCostPerUnit) * (vNr_h - modeledProductionCostPerUnit));
                    let vNr_p = vNr_d - (sellPrice - vNr_h) * (sellPrice - vNr_h) * xNr_a;

                    // wNr函数 wNr(p, be.modeledProductionCostPerUnit, (w = be.modeledStoreWages) != null ? w : 0, G.averageRetailPrice, 100)
                    let sj_f = 100 * ((sellPrice - modeledProductionCostPerUnit) * 3600) / (vNr_p + (modeledStoreWages || 0))

                    if (sj_f <= 0 && sellPrice > averagePrice) {
                        break;
                    }
                    let sj_w = sj_f / acceleration_multiplier / 1;
                    let Jq_d = sj_w - sj_w * totalSalesSpeed / 100


                    // Jq函数 Jq(A, ie, be, h, G.averageRetailPrice, n, G.marketSaturation, $, 1)
                    s = 100 * 3600 / Jq_d

                    // 计算公式y
                    let y = s * sellPrice;



                    // // 计算公式_
                    let underscore = cost * s + building_wages + n;

                    // // 计算公式w 每级每小时利润
                    w = y - underscore;
                    //console.log(optimalSellPrice, w, s)
                    // 更新最大值及对应的sellPrice
                    if (w - maxProfitPerHour > 0) {
                        maxProfitPerHour = w;
                        maxSalesPerUnitPerHour = s;
                        optimalSellPrice = sellPrice;
                    }
                    // 如果最大利润相同，则比较每单位每小时销售额
                    else if (w === maxProfitPerHour && s - maxSalesPerUnitPerHour > 0) {
                        maxSalesPerUnitPerHour = s;
                        optimalSellPrice = sellPrice;
                    }

                    // 将 sellPrice 步进
                    if (sellPrice - 8 < 0) {
                        sellPrice = parseFloat((sellPrice + 0.01).toFixed(2));
                    } else if (sellPrice - 2001 < 0) {
                        sellPrice = parseFloat((sellPrice + 0.1).toFixed(1));
                    } else {
                        sellPrice = parseFloat((sellPrice + 1).toFixed(0));
                    }
                }
                result.push([optimalSellPrice, maxProfitPerHour, maxSalesPerUnitPerHour]);
            })


            allContracts.forEach((contract, index) => {
                // 根据索引从 result 中获取对应的项
                const correspondingResult = result[index]; // 假设 result 和 allContracts 数组顺序一致

                if (correspondingResult) {
                    // 创建一个新的元素来显示数据
                    const infoDiv = document.createElement('div');
                    infoDiv.innerHTML = `售价: ${correspondingResult[0]}, 时利润: ${correspondingResult[1].toFixed(2)}, 销售数量: ${correspondingResult[2].toFixed(2)}`;

                    // 将信息插入到对应的合同元素后面
                    contract.element.insertAdjacentElement('afterend', infoDiv);

                    createdElements.push(infoDiv);
                }
            });



            return result;


            // getExecutives 返回多个数据
            async function getExecutives(leisureFacilityValue) {
                try {
                    // 同时发起所有的 GET 请求
                    const [executivesData, companyData, adminOverheadData] = await Promise.all([
                        fetch('https://www.simcompanies.com/api/v2/companies/me/executives/').then(response => response.json()),
                        fetch('https://www.simcompanies.com/api/v2/companies/me/').then(response => response.json()),
                        fetch('https://www.simcompanies.com/api/v2/companies/me/administration-overhead/').then(response => response.json())
                    ]);

                    let cooSkill = 0, cfoCooSkill = 0, cmoCooSkill = 0, ctoCooSkill = 0;
                    let cmoSkill = 0, cooCmoSkill = 0, cfoCmoSkill = 0, ctoCmoSkill = 0;

                    // 处理 executivesData
                    executivesData.forEach(executive => {
                        if (["coo", "cfo", "cmo", "cto"].includes(executive.position)) {
                            if (executive.currentTraining && executive.currentTraining.description) {
                                executive.skills = {
                                    coo: 0,
                                    cfo: 0,
                                    cmo: 0,
                                    cto: 0
                                };
                            }

                            if (executive.position === 'coo') {
                                cooSkill = executive.skills?.coo;
                                cooCmoSkill = executive.skills?.cmo;
                            } else if (executive.position === 'cfo') {
                                cfoCooSkill = executive.skills?.coo;
                                cfoCmoSkill = executive.skills?.cmo;
                            } else if (executive.position === 'cmo') {
                                cmoSkill = executive.skills?.cmo;
                                cmoCooSkill = executive.skills?.coo;
                            } else if (executive.position === 'cto') {
                                ctoCooSkill = executive.skills?.coo;
                                ctoCmoSkill = executive.skills?.cmo;
                            }
                        }
                    });

                    // 计算管理费用
                    const managementCost = cooSkill + Math.floor((cfoCooSkill + cmoCooSkill + ctoCooSkill) / 4);
                    console.log(`管理费用: ${managementCost}`);

                    // 计算销售速度
                    const salesSpeed = Math.floor((cmoSkill + Math.floor((cooCmoSkill + cfoCmoSkill + ctoCmoSkill) / 4)) / 3);
                    //console.log(`销售速度: ${salesSpeed}`);

                    // 获取基本销售速度
                    const salesModifier = companyData.authCompany.salesModifier;
                    //console.log(`销售修正值: ${salesModifier}`);

                    // 获取区域ID
                    const realmId = companyData.authCompany.realmId;
                    //console.log(`区域ID: ${realmId}`)

                    // 获取周期
                    const economyState = companyData.temporals.economyState;
                    // console.log(`周期: ${economyState}`)

                    // 获取加速倍率
                    const acceleration_multiplier = companyData.levelInfo.acceleration.multiplier;
                    //console.log(`加速倍率: ${acceleration_multiplier}`)

                    // 获取管理费用减去1后的值
                    const adjustedAdminOverhead = adminOverheadData - 1;
                    //console.log(`调整后的管理费用: ${adjustedAdminOverhead}`);

                    // 计算最终的管理费用和销售速度
                    const totalManagementCost = Math.floor((adjustedAdminOverhead * (1 - managementCost / 100)) * 10000) / 100;
                    const totalSalesSpeed = salesModifier + leisureFacilityValue + salesSpeed;



                    console.log(`最终管理费用: ${totalManagementCost}`);
                    console.log(`最终销售速度: ${totalSalesSpeed}`);

                    // 返回所有相关数据作为对象
                    return {
                        totalManagementCost,
                        totalSalesSpeed,
                        realmId,
                        acceleration_multiplier,
                        economyState
                    };

                } catch (error) {
                    errorMessageElement.textContent = '获取数据失败';
                    return null; // 如果发生错误，返回 null
                }
            }

            async function getSaturation(realmId) {
                try {
                    // 同时发起所有的 GET 请求
                    const [saturationData] = await Promise.all([
                        fetch('https://www.simcompanies.com/api/v4/' + realmId + '/resources-retail-info/').then(response => response.text())
                    ]);
                    // console.log(saturationData)
                    // 处理 saturationData
                    let saturationArray = []
                    let saturationData_dbLetter,saturationData_averagePrice,saturationData_saturation
                    JSON.parse(saturationData).forEach(data => {
                        const saturationData_dbLetter = data.dbLetter;
                        const saturationData_averagePrice = parseFloat(data.averagePrice.toString()); // 保留原始数字
                        const saturationData_saturation = parseFloat(data.saturation.toString()); // 保留原始数字
                        saturationArray.push([saturationData_dbLetter, saturationData_averagePrice, saturationData_saturation]);
                    });



                    // 返回所有相关数据作为对象
                    return {
                        saturationArray
                    };

                } catch (error) {
                    errorMessageElement.textContent = '获取数据失败';
                    return null; // 如果发生错误，返回 null
                }
            }

            async function getModelData(economyState) {
                try {
                    // 发起获取网页的 GET 请求
                    const html = await fetch('https://www.simcompanies.com').then(response => response.text());

                    // 使用正则表达式匹配脚本的 src 链接
                    const srcMatch = html.match(/crossorigin src="([^"]+)"/);

                    const srcUrl = srcMatch[1];
                    //console.log(srcUrl)
                    // 获取 index.js 内容
                    const indexjs = await fetch(srcUrl).then(response => response.text());
                    //console.log(indexjs)


                    // 提取PROFIT_PER_BUILDING_LEVEL, RETAIL_MODELING_QUALITY_WEIGHT
                    const PROFIT_PER_BUILDING_LEVEL = indexjs.match(new RegExp(indexjs.match(new RegExp('PROFIT_PER_BUILDING_LEVEL\\s*:\\s*(\\w+),'))[1] + '\\s*=\\s*([^,]+),'))[1]
                    const RETAIL_MODELING_QUALITY_WEIGHT = indexjs.match(new RegExp(indexjs.match(new RegExp('RETAIL_MODELING_QUALITY_WEIGHT\\s*:\\s*(\\w+),'))[1] + '\\s*=\\s*([^,]+),'))[1]
                    // console.log(PROFIT_PER_BUILDING_LEVEL)
                    // console.log(RETAIL_MODELING_QUALITY_WEIGHT)

                    // 提取新模型数据
                    const modelJsonString = indexjs.match(/\{0:\{1:\{buildingLevelsNeededPerHour:[\s\S]*?\}\}\}/)[0]
                    const modelJson = JSON.parse(modelJsonString.replace(/([{,])(\s*)(\w+)(\s*):/g, '$1"$3":').replace(/:\s*\.(\d+)/g, ': 0.$1'));



                    //console.log(modelJson)

                    return {
                        PROFIT_PER_BUILDING_LEVEL,
                        RETAIL_MODELING_QUALITY_WEIGHT,
                        modelJson
                    };
                } catch (error) {
                    errorMessageElement.textContent = '获取数据失败';
                    return null; // 如果发生错误，返回 null
                }
            }
        }

    }
    // 监听URL变化
    let lastURL = window.location.href;
    setInterval(() => {
        const currentURL = window.location.href;
        if (currentURL !== lastURL) {
            lastURL = currentURL;


            // 删除先前创建的元素（如果它们存在）
            const existingLabelElement = Array.from(document.querySelectorAll('span')).find(el => el.textContent.includes('已运行休闲建筑的总等级：'));
            const existingSelectElement = document.getElementById('leisure-facility-select');
            const existingButtonElement = Array.from(document.querySelectorAll('button')).find(el => el.textContent === '计算最大时利润');
            const existingErrorMessageElement = document.getElementById('error-message');

            // 检查并移除每个元素
            if (existingLabelElement) {
                existingLabelElement.remove();
            }
            if (existingSelectElement) {
                existingSelectElement.remove();
            }
            if (existingButtonElement) {
                existingButtonElement.remove();
            }
            if (existingErrorMessageElement) {
                existingErrorMessageElement.remove();
            }
            checkURLChange();
        }
    }, 100); // 每秒检测一次URL变化
})();
