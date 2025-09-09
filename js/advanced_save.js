const ROOT_FOLDER_NAME = "ComfyUI-CustomizableSave";

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

async function populateDirectoryOptions(directoryWidget, node) {
    const refreshButton = node.widgets.find(w => w.name === "🔄 Refresh" || w.name === "🔄 Loading...");
    if (refreshButton) {
        refreshButton.name = "🔄 Loading...";
        refreshButton.disabled = true;
        node.setDirtyCanvas(true, true);
    }

    try {
        const resp = await api.fetchApi(`/${ROOT_FOLDER_NAME}/get_output_dirs`);
        if (resp.status === 200) {
            const dirs = await resp.json();
            
            // --- 💡 표시 텍스트 수정 로직 변경 💡 ---

            // 1. 실제 값과 표시될 이름을 매핑하는 객체를 만듭니다.
            const valueMap = { "": "output" }; // { 실제 값: 표시 이름 }
            dirs.forEach(dir => {
                valueMap[dir] = `output/${dir}`;
            });

            // 2. 화면에 보여줄 이름들의 목록을 생성합니다.
            const displayNames = Object.values(valueMap);
            directoryWidget.options.values = displayNames;

            const currentValue = directoryWidget.value;
            
            // 3. 현재 실제 값(currentValue)에 해당하는 표시 이름(display name)을 찾아 위젯에 설정합니다.
            // 위젯의 'value'는 이제 화면에 표시되는 텍스트가 됩니다.
            directoryWidget.value = valueMap[currentValue] || "output";

            // 4. callback 함수: 사용자가 표시 이름을 선택하면, 실제 값으로 변환하여 노드에 저장합니다.
            // 이 부분이 핵심입니다. ComfyUI는 여기에 저장된 값을 백엔드로 전달합니다.
            directoryWidget.callback = function(v) {
                const realValue = Object.keys(valueMap).find(key => valueMap[key] === v);
                this.value = realValue; // 위젯의 실제 값을 내부적으로 변경
            };
            
            // 콜백을 수동으로 한번 호출하여 초기값을 실제 값으로 설정합니다.
            directoryWidget.callback(directoryWidget.value);

        } else {
            console.error("Failed to fetch output directories:", await resp.text());
        }
    } catch (error) {
        console.error("Error fetching output directories:", error);
    } finally {
        if (refreshButton) {
            refreshButton.name = "🔄 Refresh";
            refreshButton.disabled = false;
        }
        node.computeSize();
        node.setDirtyCanvas(true, true);
    }
}

app.registerExtension({
    name: "MilleN2ium.AdvancedSave",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "AdvancedSave") {

            const onAdded = nodeType.prototype.onAdded;
            nodeType.prototype.onAdded = function () {
                onAdded?.apply(this, arguments);

                if (this.widgets.find(w => w.name === "dnd_filename_pattern")) return;

                const widgetIndex = this.widgets.findIndex(w => w.name === "directory");
                if (widgetIndex === -1) {
                    console.error("Could not find 'directory' widget.");
                    return;
                }
                const originalWidget = this.widgets[widgetIndex];
                const originalValue = originalWidget.value;

                const newComboWidget = this.addWidget("combo", "directory", originalValue, () => {}, {
                    values: ["(Loading...)"]
                });
                
                this.widgets.pop();
                this.widgets.splice(widgetIndex, 1, newComboWidget);

                const directoryWidget = newComboWidget;
                populateDirectoryOptions(directoryWidget, this);
                
                const refreshButton = this.addWidget("button", "🔄 Refresh", null, () => populateDirectoryOptions(directoryWidget, this));
                refreshButton.serialize = false;

                const openFolderButton = this.addWidget("button", "📂 Open Folder", null, async () => {
                    if (directoryWidget.value === null || directoryWidget.value === undefined) return;
                    try {
                        await api.fetchApi(`/${ROOT_FOLDER_NAME}/open_folder`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ directory: directoryWidget.value }),
                        });
                    } catch (err) {
                        console.error("[AdvancedSave] Failed to request open_folder:", err);
                    }
                });
                openFolderButton.serialize = false;
                
                // (filename_pattern 및 DnD 관련 코드는 기존과 동일하게 유지됩니다)
                const patternWidget = this.widgets.find(w => w.name === "filename_pattern");
                patternWidget.inputEl.readOnly = true;
                Object.assign(patternWidget.inputEl.style, {
                    opacity: "0.6",
                    cursor: "not-allowed",
                    marginTop: "4px"
                });

                const widgetWrapper = document.createElement("div");
                const availableContainer = document.createElement("div");
                availableContainer.className = "advsave-container advsave-item-picker";
                const dropArea = document.createElement("div");
                dropArea.className = "advsave-container advsave-drop-area";

                const AVAILABLE_ITEMS = {
                    "[prefix]": "Prefix", "[seed]": "Seed", "[counter]": "Counter (Session)", "[date]": "Date",
                    "[time]": "Time", "[width]": "Width", "[height]": "Height"
                };
                
                const createToken = (id, text) => {
                    const token = document.createElement("div");
                    token.className = "advsave-token";
                    token.textContent = text;
                    token.dataset.id = id;
                    token.draggable = true;
                    if (id.startsWith('_custom_')) {
                        token.classList.add("custom-text");
                    }
                    
                    const removeBtn = document.createElement("div");
                    removeBtn.className = "advsave-remove-btn";
                    removeBtn.textContent = "x";
                    removeBtn.onclick = (e) => {
                        e.stopPropagation();
                        token.remove();
                        updatePatternWidgetFromTokens();
                    };
                    token.appendChild(removeBtn);

                    token.addEventListener("dragstart", (e) => {
                        e.dataTransfer.setData('text/plain', id);
                        setTimeout(() => token.classList.add("dragging"), 0);
                    });
                    token.addEventListener("dragend", () => {
                        token.classList.remove("dragging");
                    });
                    return token;
                };

                const updatePatternWidgetFromTokens = () => {
                    const tokens = Array.from(dropArea.querySelectorAll(".advsave-token"));
                    const patternArray = tokens.map(t => {
                        const id = t.dataset.id;
                        return id.startsWith('_custom_') ? id.substring(8) : id;
                    });
                    const newValue = JSON.stringify(patternArray, null, 2);
                    if(patternWidget.value !== newValue) {
                        patternWidget.value = newValue;
                    }
                };
                
                Object.entries({ ...AVAILABLE_ITEMS, "_text": "Text" }).forEach(([id, text]) => {
                    const item = document.createElement("button");
                    item.className = "advsave-item";
                    item.textContent = text;

                    item.addEventListener("mousedown", (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        let newToken;
                        if (id === '_text') {
                            const invalidChars = '\\/:*?"<>|';
                            const invalidCharsMsg = '사용 불가: ' + invalidChars.split('').join(' ');
                            const customText = prompt(`텍스트를 입력하세요 (예: '_', '-', 'portrait'):\n\n${invalidCharsMsg}`, "_");

                            if (customText) {
                                const hasInvalidChars = customText.split('').some(char => invalidChars.includes(char));
                                if (hasInvalidChars) {
                                    alert(`파일 이름에 사용할 수 없는 문자가 포함되어 있습니다. 다음 문자는 사용하지 마세요: ${invalidChars.split('').join(' ')}`);
                                } else {
                                    newToken = createToken(`_custom_${customText}`, customText);
                                }
                            }
                        } else {
                            newToken = createToken(id, text);
                        }

                        if (newToken) {
                            dropArea.appendChild(newToken);
                            updatePatternWidgetFromTokens();
                        }
                    });
                    availableContainer.appendChild(item);
                });

                const getDropTarget = (container, clientY) => {
                    const children = [...container.children].filter(child => !child.classList.contains("dragging"));
                    for (const child of children) {
                        const box = child.getBoundingClientRect();
                        if (clientY < box.top + box.height / 2) return child;
                    }
                    return null;
                };

                dropArea.addEventListener("dragover", (e) => { 
                    e.preventDefault();
                    dropArea.classList.add("drag-over");
                });
                dropArea.addEventListener("dragleave", () => {
                    dropArea.classList.remove("drag-over");
                });

                dropArea.addEventListener("drop", (e) => {
                    e.preventDefault();
                    dropArea.classList.remove("drag-over");

                    const draggingToken = dropArea.querySelector('.dragging');
                    if (!draggingToken) return;

                    const dropTarget = getDropTarget(dropArea, e.clientY);
                    if (dropTarget) {
                        dropArea.insertBefore(draggingToken, dropTarget);
                    } else {
                        dropArea.appendChild(draggingToken);
                    }
                    updatePatternWidgetFromTokens();
                });
                
                const availableWidget = document.createElement("div");
                availableWidget.className = "advsave-widget";
                availableWidget.innerHTML = `<label class="advsave-label">Available Items (click to add)</label>`;
                availableWidget.appendChild(availableContainer);
                widgetWrapper.appendChild(availableWidget);
                
                const dropAreaWidget = document.createElement("div");
                dropAreaWidget.className = "advsave-widget";
                dropAreaWidget.innerHTML = `<label class="advsave-label">Filename Structure (drag to reorder)</label>`;
                dropAreaWidget.appendChild(dropArea);
                widgetWrapper.appendChild(dropAreaWidget);
                
                const domWidget = this.addDOMWidget("dnd_filename_pattern", "dnd", widgetWrapper, {
                    getValue() {
                        return patternWidget.value;
                    },
                    setValue(v) {
                        if (patternWidget.value !== v) {
                           patternWidget.value = v;
                        }
                        dropArea.innerHTML = "";
                        try {
                            const pattern = JSON.parse(v || '[]');
                            pattern.forEach(id => {
                                let text = AVAILABLE_ITEMS[id];
                                let tokenId = id;
                                if (!text) { text = id; tokenId = `_custom_${id}`; }
                                dropArea.appendChild(createToken(tokenId, text));
                            });
                        } catch (e) { console.error("Failed to parse pattern:", v, e); }
                    }
                });
                
                domWidget.value = patternWidget.value;
            };
            
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);

                if (info.widgets_values) {
                    const directoryIndex = this.widgets.findIndex(w => w.name === "directory");
                    if (directoryIndex > -1 && info.widgets_values.length > directoryIndex) {
                        const directoryWidget = this.widgets[directoryIndex];
                        directoryWidget.value = info.widgets_values[directoryIndex];
                    }
                }

                const domWidget = this.widgets.find(w => w.name === "dnd_filename_pattern");
                if (!domWidget) return;

                let valueToRestore = null;
                const patternIndex = this.widgets.findIndex(w => w.name === "filename_pattern");
                
                if (info.widgets_values && patternIndex !== -1 && info.widgets_values.length > patternIndex) {
                    valueToRestore = info.widgets_values[patternIndex];
                }
                
                if (valueToRestore !== null) {
                    domWidget.value = valueToRestore;
                }
            };
            
            if (!document.getElementById("my-nodes-advanced-save-style")) {
                const styleSheet = document.createElement("style");
                styleSheet.id = "my-nodes-advanced-save-style";
                styleSheet.innerText = `
                    .advsave-widget { margin: 5px 0; }
                    .advsave-label { font-size: 0.8em; color: var(--input-text); margin-bottom: 2px; display: block; }
                    .advsave-container { display: flex; flex-wrap: wrap; gap: 5px; padding: 5px; border: 1px solid var(--input-border); border-radius: 4px; background-color: var(--comfy-input-bg); min-width: 0; }
                    .advsave-item { cursor: pointer; }
                    .advsave-item, .advsave-token { padding: 4px 8px; border-radius: 12px; font-size: 0.9em; background-color: var(--s-toolbar-bg); color: var(--s-toolbar-text); border: 1px solid var(--s-toolbar-border-color); user-select: none; white-space: nowrap; }
                    button.advsave-item { border: 1px solid var(--s-toolbar-border-color); background: var(--s-toolbar-bg); font-family: inherit; text-align: inherit; }
                    button.advsave-item:hover { filter: brightness(1.2); }
                    .advsave-token { cursor: grab; position: relative; background-color: #3a5775; }
                    .advsave-token.custom-text { background-color: #4a75a1; }
                    .advsave-token.dragging { opacity: 0.5; }
                    .advsave-token .advsave-remove-btn { position: absolute; top: -5px; right: -5px; width: 16px; height: 16px; border-radius: 50%; background-color: #ff4444; color: white; border: 1px solid white; font-size: 10px; text-align: center; line-height: 14px; cursor: pointer; font-family: monospace; }
                    .advsave-drop-area { min-height: 32px; flex-basis: 100%; }
                    .drag-over { background-color: var(--descrip-text); }
                `;
                document.head.appendChild(styleSheet);
            }
        }
    },
});
