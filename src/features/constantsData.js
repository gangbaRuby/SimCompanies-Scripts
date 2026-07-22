

export const constantsData = (() => {
    // 私有变量存储处理后的内容
    let _processedData = null;

    // 获取并处理数据的逻辑
    const init = async () => {
        const Network = window.__SC_Network;
        try {
            const scriptTag = document.querySelector(
                'script[type="module"][crossorigin][src^="https://www.simcompanies.com/static/bundle/assets/index-"][src$=".js"]'
            );
            if (!scriptTag) throw new Error('未找到基本数据文件');

            // 获取原始内容
            const rawContent = await Network.requestRaw(scriptTag.src);

            // 空数据
            const data = {};

            // 需要提取core的数据键列表
            const targetKeys = [
                'AVERAGE_SALARY',
                'SALES',
                'RETAIL_MODELING_QUALITY_WEIGHT'
            ];

            // 提取变量值（支持数字 / 布尔 / 对象）
            const extractValue = (variableName) => {
                const escapedVar = variableName.replace('$', '\\$');
                const varRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*([^,;\\n\\r]+)`);
                const match = rawContent.match(varRegex);
                if (!match) {
                    console.warn(`变量未找到: ${variableName}`);
                    return null;
                }

                try {
                    const value = match[1].trim();
                    if (value.startsWith('{')) {
                        const objectRegex = new RegExp(`[,{\\s]${escapedVar}\\s*=\\s*(\\{[^}]*\\})`);
                        const matchAgain = rawContent.match(objectRegex);
                        if (matchAgain) {
                            return JSON.parse(matchAgain[1]
                                .replace(/([{,]\s*|\{\s*)([^\s":,{}]+)(?=\s*:)/g, '$1"$2"')
                                .replace(/:(\s*)\.(\d+)/g, ':$10.$2')
                            );
                        }
                    }
                    return JSON.parse(value.replace(/^\.(\d+)/, '0.$1'));
                } catch {
                    return match[1].trim();
                }
            };


            // 遍历 targetKeys，从 rawContent 中提取变量名并解析值
            targetKeys.forEach(key => {
                const keyMatch = rawContent.match(
                    new RegExp(`\\b${key}\\s*:\\s*([\\w$]+)`, 'm')
                );

                if (keyMatch) {
                    const varName = keyMatch[1];
                    data[key] = extractValue(varName);

                    // 如果是 SALES，删掉 B 和 r 即删除大楼和餐馆此类非传统零售
                    if (key === 'SALES' && data[key]) {
                        delete data[key]['B'];
                        delete data[key]['r'];
                    }
                } else {
                    console.warn(`${key} 未找到`);
                }
            });

            // 提取建筑工资系数
            function extractSalaryModifiers(str) {
                const result = {};

                // ✅ 处理第一种格式：多个变量赋值
                const varAssignRegex = /(\w+)\s*=\s*{/g;
                let match;

                while ((match = varAssignRegex.exec(str)) !== null) {
                    const startIndex = varAssignRegex.lastIndex - 1;
                    let braceCount = 1;
                    let currentIndex = startIndex + 1;

                    while (braceCount > 0 && currentIndex < str.length) {
                        if (str[currentIndex] === '{') braceCount++;
                        else if (str[currentIndex] === '}') braceCount--;
                        currentIndex++;
                    }

                    if (braceCount === 0) {
                        const objText = str.slice(startIndex, currentIndex);
                        const dbLetterMatch = objText.match(/dbLetter\s*:\s*"(\w+)"/);
                        const salaryMatch = objText.match(/salaryModifier\s*:\s*([.\d]+)/);

                        if (dbLetterMatch && salaryMatch) {
                            const dbLetter = dbLetterMatch[1];
                            const salary = parseFloat(salaryMatch[1]);
                            result[dbLetter] = salary;
                        }
                    }
                }

                // ✅ 处理第二种格式：对象字面量内部嵌套对象（带数字键）
                const objectEntryRegex = /\d+\s*:\s*{[\s\S]*?}/g;
                const entries = str.match(objectEntryRegex) || [];

                for (const entry of entries) {
                    const dbLetterMatch = entry.match(/dbLetter\s*:\s*"(\w+)"/);
                    const salaryMatch = entry.match(/salaryModifier\s*:\s*([.\d]+)/);

                    if (dbLetterMatch && salaryMatch) {
                        const dbLetter = dbLetterMatch[1];
                        const salary = parseFloat(salaryMatch[1]);
                        result[dbLetter] = salary;
                    }
                }

                return result;
            }
            const buildingsSalaryModifier = extractSalaryModifiers(rawContent);


            // 提取物品不同周期的基本参数
            const extractJSONData = (str) => {
                // 匹配形如 "0: JSON.parse('...')" 或者 "0: JSON.parse(...)" 形式
                const regex = /(\d+):\s*JSON\.parse\((['"])(.*?)\2\)/g;
                const retailInfo = {};

                // 使用 matchAll 进行全局匹配
                for (const match of str.matchAll(regex)) {
                    const index = match[1];          // 捕获数字索引（0、1、2）
                    const jsonData = match[3];       // 获取 JSON.parse() 中的内容
                    // console.log('周期：' + index + '， 内容：' + jsonData);

                    try {
                        // 直接解析 JSON 内容
                        const parsedData = JSON.parse(jsonData);
                        // 将解析结果存入 retailInfo
                        retailInfo[index] = parsedData;
                    } catch (error) {
                        console.error("JSON 解析错误：", error, "数据：", jsonData);
                    }
                }

                return retailInfo;
            }
            const retailInfo = extractJSONData(rawContent);

            //提取物品基本数据
            const extractMntFromRaw = (str) => {
                const assignPattern = /(\w+)\s*=\s*{/g;
                let match;

                while ((match = assignPattern.exec(rawContent)) !== null) {
                    const startIndex = match.index + match[0].indexOf('{');
                    let braceCount = 1;
                    let endIndex = startIndex + 1;

                    while (braceCount > 0 && endIndex < rawContent.length) {
                        const char = rawContent[endIndex];
                        if (char === '{') braceCount++;
                        else if (char === '}') braceCount--;
                        endIndex++;
                    }

                    if (braceCount === 0) {
                        const objectString = rawContent.slice(startIndex, endIndex);
                        try {
                            const obj = eval('(' + objectString + ')');
                            if (
                                obj[1] && obj[1].dbLetter !== undefined &&
                                obj[150] && obj[150].producedFrom &&
                                obj[150].image?.includes("tree.png")
                            ) {
                                return obj;
                            }
                        } catch (e) { }
                    }
                }

                return null;
            }
            const constantsResources = JSON.parse(JSON.stringify(extractMntFromRaw(rawContent)));

            return {
                data: data,
                buildingsSalaryModifier: buildingsSalaryModifier,
                retailInfo: retailInfo,
                constantsResources: constantsResources,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('初始化失败:', error);
            throw error;
        }
    };

    // 返回可访问处理结果的接口
    return {
        initialize: init,
        getData: () => _processedData
    };
})();
