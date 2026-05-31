/**
 * MOSH Journal Enhancer - Editor Toolbar
 * Adds scoped formatting controls to Foundry ProseMirror journal editors.
 */

import { MODULE_ID } from "./config.js";
import { localize, escapeHtml, isMonksEnhancedJournalActive, log, logError } from "./utils.js";
import { MoshBlockPanel, MoshFigureDialog } from "./dialogs-v2.js";

let toolbarHooksRegistered = false;
let figureHandlersRegistered = false;
let toolbarObserverRegistered = false;
let currentFigureToolbar = null;
let currentTargetFigure = null;
let lastActiveEditor = null;
let lastSelectionRange = null;

const EDITOR_SELECTORS = [
    ".editor-content.ProseMirror[contenteditable='true']",
    ".ProseMirror.editor-content[contenteditable='true']",
    ".ProseMirror[contenteditable='true']"
].join(",");

const TOOLBAR_SELECTORS = [
    ".editor-menu",
    ".ProseMirror-menubar",
    ".editor-toolbar",
    ".prosemirror-menu",
    "[role='menubar']",
    "menu.editor-menu",
    "menu.ProseMirror-menu",
    "menu[role='menubar']",
    "[data-application-part='editor-menu']"
].join(",");

/**
 * Export openBlockPanel for macro/API use.
 */
export { openBlockPanel };

/**
 * Register Foundry render hooks once.
 */
export function registerToolbarHook() {
    if (toolbarHooksRegistered) return;
    toolbarHooksRegistered = true;

    Hooks.on("renderProseMirrorEditor", (app, html, options) => {
        handleEditorRender(app, html, options);
    });

    Hooks.on("renderApplicationV2", (app, html, context, options) => {
        handleApplicationRender(app, html, options);
    });

    Hooks.on("renderJournalEntrySheet", (app, html, options) => {
        handleSheetRender(app, html, options);
    });

    Hooks.on("renderJournalEntryPageSheet", (app, html, options) => {
        handleSheetRender(app, html, options);
    });

    registerFigureHandlers();
    registerToolbarObserver();
    document.addEventListener("selectionchange", rememberCurrentSelection);
    log("Toolbar hooks registered");
}

function handleEditorRender(app, html, options = {}) {
    const root = normalizeElement(html) || normalizeElement(app?.element);
    const editor = findScopedEditor(root, app);
    if (!editor) return;

    lastActiveEditor = editor;
    addToolbarToEditor(editor, root);
}

function handleApplicationRender(app, html, options = {}) {
    const root = normalizeElement(html) || normalizeElement(app?.element);
    if (!root) return;
    if (!isJournalLikeApp(app, root) && !root.querySelector?.(EDITOR_SELECTORS)) return;

    scanForEditors(root, app);
    queueEditorScan(root, app);
}

function handleSheetRender(app, html, options = {}) {
    const root = normalizeElement(html) || normalizeElement(app?.element);
    if (!root || !isJournalLikeApp(app, root)) return;

    scanForEditors(root, app);
    queueEditorScan(root, app);
}

function isJournalLikeApp(app, root) {
    const name = app?.constructor?.name || "";
    if (/Journal|ProseMirror/i.test(name)) return true;
    if (root.closest?.(".journal-sheet, .journal-entry, .journal-entry-page")) return true;
    return isMonksEnhancedJournalActive() && !!root.closest?.(".monks-enhanced-journal");
}

function normalizeElement(value) {
    if (!value) return null;
    if (value instanceof HTMLElement) return value;
    if (value instanceof DocumentFragment) return value.firstElementChild;
    if (value.jquery) return value[0] ?? null;
    if (value.element instanceof HTMLElement) return value.element;
    if (value[0] instanceof HTMLElement) return value[0];
    return null;
}

function findScopedEditor(root, app) {
    if (root?.matches?.(EDITOR_SELECTORS)) return root;
    const appElement = normalizeElement(app?.element);
    const candidates = [];

    if (root) candidates.push(...root.querySelectorAll(EDITOR_SELECTORS));
    if (appElement && appElement !== root) candidates.push(...appElement.querySelectorAll(EDITOR_SELECTORS));

    return candidates.find(editor => editor.isConnected) || null;
}

function scanForEditors(root = document, app = null) {
    const normalizedRoot = normalizeElement(root) || document;
    const editors = normalizedRoot.matches?.(EDITOR_SELECTORS)
        ? [normalizedRoot]
        : Array.from(normalizedRoot.querySelectorAll?.(EDITOR_SELECTORS) || []);

    for (const editor of editors) {
        addToolbarToEditor(editor, normalizedRoot);
    }

    const appElement = normalizeElement(app?.element);
    if (appElement && appElement !== normalizedRoot) {
        const appEditors = appElement.matches?.(EDITOR_SELECTORS)
            ? [appElement]
            : Array.from(appElement.querySelectorAll?.(EDITOR_SELECTORS) || []);
        for (const editor of appEditors) addToolbarToEditor(editor, appElement);
    }
}

function queueEditorScan(root = document, app = null) {
    const scan = () => scanForEditors(root, app);
    requestAnimationFrame(scan);
    window.setTimeout(scan, 100);
    window.setTimeout(scan, 350);
}

function addToolbarToEditor(editorElement, root = null) {
    if (!editorElement?.isConnected) return;

    const container = editorElement.closest(".editor, .journal-entry-page, .journal-sheet, .monks-enhanced-journal")
        || root
        || editorElement.parentElement;
    if (!container) return;

    if (isMonksEnhancedJournalActive() && isMonksNavigationContainer(container)) return;

    const toolbar = findToolbarForEditor(editorElement, container);
    if (!toolbar || toolbar.querySelector(".mosh-toolbar-group")) return;

    addMoshToolbarButton(toolbar, editorElement);
}

function findToolbarForEditor(editorElement, container) {
    const localToolbar = editorElement.closest(".editor")?.querySelector(TOOLBAR_SELECTORS);
    if (localToolbar) return localToolbar;

    const previousToolbar = findPreviousSiblingToolbar(editorElement);
    if (previousToolbar) return previousToolbar;

    const adjacentToolbar = findAdjacentToolbar(editorElement);
    if (adjacentToolbar) return adjacentToolbar;

    const toolbars = Array.from(container.querySelectorAll(TOOLBAR_SELECTORS))
        .filter(toolbar => !isMonksNavigationContainer(toolbar));

    if (toolbars.length === 1) return toolbars[0];

    return toolbars.find(toolbar => toolbar.closest(".editor") === editorElement.closest(".editor")) || toolbars[0] || null;
}

function findPreviousSiblingToolbar(editorElement) {
    let node = editorElement.previousElementSibling;
    while (node) {
        if (node.matches?.(TOOLBAR_SELECTORS)) return node;
        const nested = node.querySelector?.(TOOLBAR_SELECTORS);
        if (nested) return nested;
        node = node.previousElementSibling;
    }
    return null;
}

function findAdjacentToolbar(editorElement) {
    let node = editorElement.nextElementSibling;
    while (node) {
        if (node.matches?.(TOOLBAR_SELECTORS)) return node;
        const nested = node.querySelector?.(TOOLBAR_SELECTORS);
        if (nested) return nested;
        node = node.nextElementSibling;
    }
    return null;
}

function isMonksNavigationContainer(element) {
    return !!element.closest?.(".directory, .journal-sidebar, .journal-list, .pages-list, .tab-bar, .tabs");
}

function addMoshToolbarButton(toolbar, editorElement) {
    const group = document.createElement("span");
    group.className = "mosh-toolbar-group";
    group.innerHTML = `<span class="mosh-toolbar-separator"></span>`;

    const blocksBtn = createToolbarButton("fas fa-cube", "MOSH.Toolbar.Blocks", "MOSH.Toolbar.BlocksTitle");
    blocksBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    blocksBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openBlockPanel({ editor: editorElement, range: lastSelectionRange });
    });

    const imageBtn = createToolbarButton("fas fa-image", "MOSH.Toolbar.Image", "MOSH.Toolbar.ImageTitle");
    imageBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    imageBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openFigureDialog({ editor: editorElement, range: lastSelectionRange });
    });

    group.append(blocksBtn, imageBtn);
    toolbar.append(group);
    log("Toolbar buttons added");
}

function createToolbarButton(icon, labelKey, titleKey) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mosh-toolbar-btn";
    button.title = localize(titleKey);
    button.innerHTML = `<i class="${icon}"></i><span class="btn-text">${escapeHtml(localize(labelKey))}</span>`;
    return button;
}

function saveEditorSelection(editorElement) {
    return () => {
        lastActiveEditor = editorElement;
        const range = getSelectionRangeInEditor(editorElement);
        if (range) lastSelectionRange = range.cloneRange();
    };
}

function rememberCurrentSelection() {
    const editor = getActiveEditor();
    if (!editor) return;

    const range = getSelectionRangeInEditor(editor);
    if (!range) return;

    lastActiveEditor = editor;
    lastSelectionRange = range.cloneRange();
}

function getSelectionRangeInEditor(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range;
}

function getActiveEditor(preferredEditor = null) {
    if (preferredEditor?.isConnected) return preferredEditor;

    const selection = window.getSelection();
    if (selection?.rangeCount) {
        const container = selection.getRangeAt(0).commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
        const editor = element?.closest?.(EDITOR_SELECTORS);
        if (editor) return editor;
    }

    if (lastActiveEditor?.isConnected) return lastActiveEditor;
    return document.activeElement?.closest?.(EDITOR_SELECTORS) || document.querySelector(EDITOR_SELECTORS);
}

/**
 * Open block panel with previews.
 */
function openBlockPanel(options = {}) {
    if (options.editor) {
        lastActiveEditor = options.editor;
        lastSelectionRange = options.range || lastSelectionRange;
    }

    new MoshBlockPanel({
        onSelect: ({ className, label }) => {
            insertBlock(className, label, {
                editor: options.editor || lastActiveEditor,
                range: options.range || lastSelectionRange
            });
        }
    }).render(true);
}

function openFigureDialog(options = {}) {
    const editor = options.editor || getActiveEditor();
    const range = options.range || getSelectionRangeInEditor(editor) || lastSelectionRange;

    lastActiveEditor = editor;
    if (range) lastSelectionRange = range.cloneRange();

    new MoshFigureDialog(range, null, null, {
        editor,
        onInsert: (settings, insertOptions = {}) => insertFigure(settings, {
            editor: insertOptions.editor || editor,
            range: insertOptions.range || range
        })
    }).render(true);
}

/**
 * Insert a MOSH block around selected content.
 */
export function insertBlock(className, label, options = {}) {
    const editor = getActiveEditor(options.editor);
    if (!editor) {
        ui.notifications.warn(localize("MOSH.Dialog.NoEditor"));
        return false;
    }

    const range = options.range || getSelectionRangeInEditor(editor);
    if (!range) {
        ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
        return false;
    }

    const expandedRange = expandRangeToSmartBlocks(range, editor);
    const content = selectedRangeHTML(expandedRange) || `<p>${escapeHtml(localize("MOSH.Blocks.Placeholder"))}</p>`;
    const blockHTML = `<div class="${escapeHtml(className)}">${content}</div>`;

    const inserted = insertHTMLIntoActiveEditor(blockHTML, { editor, range: expandedRange });
    if (inserted) ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
    return inserted;
}

/**
 * Insert a MOSH figure using the shared editor insertion path.
 */
export function insertFigure(settings = {}, options = {}) {
    const path = settings.path || "";
    if (!path) {
        ui.notifications.warn(localize("MOSH.Figure.SelectImage"));
        return false;
    }

    const classes = ["mosh-figure"];
    if (settings.position) classes.push(`float-${settings.position}`);
    if (settings.size) classes.push(`size-${settings.size}`);
    if (settings.style) classes.push(`style-${settings.style}`);

    let figureHTML = `<figure class="${classes.map(escapeHtml).join(" ")}">`;
    figureHTML += `<img src="${escapeHtml(path)}" alt="${escapeHtml(settings.caption || "")}" loading="lazy">`;
    if (settings.caption) figureHTML += `<figcaption>${escapeHtml(settings.caption)}</figcaption>`;
    figureHTML += "</figure>";

    const editor = getActiveEditor(options.editor);
    const inserted = insertHTMLIntoActiveEditor(figureHTML, {
        editor,
        range: options.range || lastSelectionRange
    });

    if (inserted) ui.notifications.info(`${localize("MOSH.Blocks.Figure")} ${localize("MOSH.Dialog.Inserted")}`);
    return inserted;
}

/**
 * Shared HTML insertion helper for Foundry ProseMirror editors.
 */
export function insertHTMLIntoActiveEditor(html, { range = null, editor = null } = {}) {
    const targetEditor = getActiveEditor(editor);
    if (!targetEditor) {
        ui.notifications.error(localize("MOSH.Dialog.NoEditor"));
        return false;
    }

    targetEditor.focus();
    restoreRange(range, targetEditor);

    try {
        if (document.queryCommandSupported?.("insertHTML")) {
            const success = document.execCommand("insertHTML", false, html);
            if (success) {
                notifyEditorChanged(targetEditor);
                return true;
            }
        }
    } catch (error) {
        logError("execCommand insertHTML failed, using Range fallback", error);
    }

    try {
        const activeRange = getSelectionRangeInEditor(targetEditor) || range;
        if (!activeRange) throw new Error("No selection available");

        const fragment = activeRange.createContextualFragment(html);
        activeRange.deleteContents();
        activeRange.insertNode(fragment);
        notifyEditorChanged(targetEditor);
        return true;
    } catch (error) {
        logError("HTML insertion failed", error);
        ui.notifications.error(`${localize("MOSH.Dialog.InsertError")}: ${error.message}`);
        return false;
    }
}

function restoreRange(range, editor) {
    if (!range) return;

    try {
        const container = range.commonAncestorContainer;
        if (!document.contains(container) || !editor.contains(container)) return;

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    } catch (error) {
        logError("Could not restore editor selection", error);
    }
}

function notifyEditorChanged(editor) {
    editor.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    lastActiveEditor = editor;
    const range = getSelectionRangeInEditor(editor);
    if (range) lastSelectionRange = range.cloneRange();
}

function selectedRangeHTML(range) {
    const temp = document.createElement("div");
    temp.append(range.cloneContents());
    return temp.innerHTML.trim();
}

function expandRangeToSmartBlocks(range, editor) {
    const validTags = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SECTION", "UL", "OL", "PRE", "LI"];
    const startBlock = getBlockParent(range.startContainer, editor, validTags);
    const endBlock = getBlockParent(range.endContainer, editor, validTags);

    if (!startBlock || !endBlock) return range;

    const expanded = document.createRange();
    expanded.setStartBefore(startBlock.tagName === "LI" ? startBlock.closest("ul, ol") || startBlock : startBlock);
    expanded.setEndAfter(endBlock.tagName === "LI" ? endBlock.closest("ul, ol") || endBlock : endBlock);
    return expanded;
}

function getBlockParent(node, editor, validTags) {
    let current = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (current && current !== editor) {
        if (current.nodeType === Node.ELEMENT_NODE && validTags.includes(current.tagName)) return current;
        current = current.parentElement;
    }
    return null;
}

function registerFigureHandlers() {
    if (figureHandlersRegistered) return;
    figureHandlersRegistered = true;

    document.addEventListener("click", event => {
        if (event.target.closest(".mosh-figure-toolbar")) return;

        const figure = event.target.closest("figure.mosh-figure");
        if (figure && figure.closest(EDITOR_SELECTORS)) {
            event.preventDefault();
            event.stopPropagation();
            showFigureToolbar(figure);
        } else {
            hideFigureToolbar();
        }
    });

    const updateToolbarPosition = () => {
        if (currentTargetFigure && currentFigureToolbar) {
            positionFigureToolbar(currentTargetFigure, currentFigureToolbar);
        }
    };

    window.addEventListener("scroll", updateToolbarPosition, { passive: true });
    window.addEventListener("resize", updateToolbarPosition, { passive: true });
}

function showFigureToolbar(figureElement) {
    if (currentTargetFigure === figureElement && currentFigureToolbar) return;

    hideFigureToolbar();
    currentTargetFigure = figureElement;
    figureElement.classList.add("mosh-figure-selected");

    const toolbar = document.createElement("div");
    toolbar.className = "mosh-figure-toolbar";
    toolbar.addEventListener("click", event => event.stopPropagation());
    toolbar.innerHTML = `
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${escapeHtml(localize("MOSH.Figure.Position"))}:</span>
            <button type="button" class="toolbar-btn" data-action="position" data-value="left" title="${escapeHtml(localize("MOSH.Figure.Left"))}"><i class="fas fa-align-left"></i></button>
            <button type="button" class="toolbar-btn" data-action="position" data-value="inline" title="${escapeHtml(localize("MOSH.Figure.Inline"))}"><i class="fas fa-align-center"></i></button>
            <button type="button" class="toolbar-btn" data-action="position" data-value="right" title="${escapeHtml(localize("MOSH.Figure.Right"))}"><i class="fas fa-align-right"></i></button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${escapeHtml(localize("MOSH.Figure.Size"))}:</span>
            <button type="button" class="toolbar-btn" data-action="size" data-value="small" title="${escapeHtml(localize("MOSH.Figure.Small"))}"><i class="fas fa-compress-alt"></i></button>
            <button type="button" class="toolbar-btn" data-action="size" data-value="medium" title="${escapeHtml(localize("MOSH.Figure.Medium"))}"><i class="fas fa-expand-alt"></i></button>
            <button type="button" class="toolbar-btn" data-action="size" data-value="large" title="${escapeHtml(localize("MOSH.Figure.Large"))}"><i class="fas fa-arrows-alt"></i></button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${escapeHtml(localize("MOSH.Figure.Style"))}:</span>
            <button type="button" class="toolbar-btn" data-action="style" data-value="default" title="${escapeHtml(localize("MOSH.Figure.Default"))}"><i class="fas fa-square"></i></button>
            <button type="button" class="toolbar-btn" data-action="style" data-value="polaroid" title="${escapeHtml(localize("MOSH.Figure.Polaroid"))}"><i class="fas fa-camera"></i></button>
            <button type="button" class="toolbar-btn" data-action="style" data-value="screen" title="${escapeHtml(localize("MOSH.Figure.Screen"))}"><i class="fas fa-tv"></i></button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <button type="button" class="toolbar-btn toolbar-btn-danger" data-action="delete" title="${escapeHtml(localize("MOSH.Figure.Delete"))}"><i class="fas fa-trash"></i></button>
        </div>
    `;

    document.body.appendChild(toolbar);
    currentFigureToolbar = toolbar;

    requestAnimationFrame(() => positionFigureToolbar(figureElement, toolbar));
    updateToolbarButtons(figureElement, toolbar);

    toolbar.querySelectorAll(".toolbar-btn").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            handleToolbarAction(figureElement, button.dataset.action, button.dataset.value);
        });
    });
}

function positionFigureToolbar(figure, toolbar) {
    const rect = figure.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    let top = rect.top - toolbarRect.height - 10;
    let left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);

    if (top < 10) top = rect.bottom + 10;
    if (left < 10) left = 10;
    if (left + toolbarRect.width > window.innerWidth - 10) {
        left = window.innerWidth - toolbarRect.width - 10;
    }

    toolbar.style.top = `${top + window.scrollY}px`;
    toolbar.style.left = `${left}px`;
}

function updateToolbarButtons(figure, toolbar) {
    const currentPosition = figure.classList.contains("float-left") ? "left" :
        figure.classList.contains("float-right") ? "right" : "inline";
    toolbar.querySelectorAll("[data-action='position']").forEach(button => {
        button.classList.toggle("active", button.dataset.value === currentPosition);
    });

    const currentSize = figure.classList.contains("size-small") ? "small" :
        figure.classList.contains("size-large") ? "large" : "medium";
    toolbar.querySelectorAll("[data-action='size']").forEach(button => {
        button.classList.toggle("active", button.dataset.value === currentSize);
    });

    const currentStyle = figure.classList.contains("style-polaroid") ? "polaroid" :
        figure.classList.contains("style-screen") ? "screen" : "default";
    toolbar.querySelectorAll("[data-action='style']").forEach(button => {
        button.classList.toggle("active", button.dataset.value === currentStyle);
    });
}

function handleToolbarAction(figure, action, value) {
    const editor = figure.closest(EDITOR_SELECTORS);
    const oldClassName = figure.className;

    if (action === "delete") {
        if (confirm(localize("MOSH.Figure.DeleteConfirm") || "Delete this image?")) {
            const deleted = deleteFigureThroughEditor(figure, editor);
            hideFigureToolbar();
            log("Figure toolbar delete", { action, editorFound: !!editor, deleted, oldClassName });
            if (deleted) ui.notifications.info(localize("MOSH.Figure.Deleted"));
        }
        return;
    }

    let currentPosition = figure.classList.contains("float-left") ? "left" :
        figure.classList.contains("float-right") ? "right" : "inline";
    let currentSize = figure.classList.contains("size-small") ? "small" :
        figure.classList.contains("size-large") ? "large" : "medium";
    let currentStyle = figure.classList.contains("style-polaroid") ? "polaroid" :
        figure.classList.contains("style-screen") ? "screen" : "default";

    if (action === "position") currentPosition = value;
    if (action === "size") currentSize = value;
    if (action === "style") currentStyle = value;

    const newClasses = buildFigureClasses({
        position: currentPosition,
        size: currentSize,
        style: currentStyle
    });
    const updatedFigure = replaceFigureThroughEditor(figure, editor, newClasses);
    log("Figure toolbar action", {
        action,
        value,
        editorFound: !!editor,
        updated: !!updatedFigure,
        oldClassName,
        newClassName: newClasses.join(" ")
    });

    if (!updatedFigure) return;

    currentTargetFigure = updatedFigure;
    updatedFigure.classList.add("mosh-figure-selected");

    if (currentFigureToolbar) updateToolbarButtons(updatedFigure, currentFigureToolbar);
    requestAnimationFrame(() => {
        if (currentFigureToolbar && currentTargetFigure === updatedFigure) {
            positionFigureToolbar(updatedFigure, currentFigureToolbar);
        }
    });
}

function buildFigureClasses({ position = "inline", size = "medium", style = "default" } = {}) {
    const classes = ["mosh-figure"];
    if (position === "left" || position === "right") classes.push(`float-${position}`);
    classes.push(size === "small" || size === "large" ? `size-${size}` : "size-medium");
    if (style === "polaroid" || style === "screen") classes.push(`style-${style}`);
    return classes;
}

function replaceFigureThroughEditor(figure, editor, classes) {
    if (!figure?.isConnected || !editor?.contains(figure)) return null;

    const marker = `mosh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const html = buildFigureHTMLFromElement(figure, classes, marker);
    const range = document.createRange();
    range.selectNode(figure);

    const inserted = insertHTMLIntoActiveEditor(html, { editor, range });
    if (!inserted) return null;

    const newFigure = editor.querySelector(`figure.mosh-figure[data-mosh-figure-id="${marker}"]`);
    if (!newFigure) return null;

    newFigure.removeAttribute("data-mosh-figure-id");
    notifyEditorChanged(editor);
    return newFigure;
}

function deleteFigureThroughEditor(figure, editor) {
    if (!figure?.isConnected || !editor?.contains(figure)) return false;

    const range = document.createRange();
    range.selectNode(figure);
    range.deleteContents();
    notifyEditorChanged(editor);
    return true;
}

function buildFigureHTMLFromElement(figure, classes, marker = "") {
    const img = figure.querySelector("img");
    const caption = figure.querySelector("figcaption")?.textContent?.trim() || "";
    const attrs = marker ? ` data-mosh-figure-id="${escapeHtml(marker)}"` : "";

    let html = `<figure class="${classes.map(escapeHtml).join(" ")}"${attrs}>`;
    if (img) {
        html += `<img src="${escapeHtml(img.getAttribute("src") || "")}" alt="${escapeHtml(img.getAttribute("alt") || "")}" loading="${escapeHtml(img.getAttribute("loading") || "lazy")}">`;
    }
    if (caption) html += `<figcaption>${escapeHtml(caption)}</figcaption>`;
    html += "</figure>";
    return html;
}

function hideFigureToolbar() {
    if (currentTargetFigure) currentTargetFigure.classList.remove("mosh-figure-selected");
    currentFigureToolbar?.remove();
    currentFigureToolbar = null;
    currentTargetFigure = null;
}

function registerToolbarObserver() {
    if (toolbarObserverRegistered) return;
    toolbarObserverRegistered = true;

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.matches?.(EDITOR_SELECTORS) || node.querySelector?.(EDITOR_SELECTORS)) {
                    queueEditorScan(node);
                    continue;
                }
                if (node.matches?.(TOOLBAR_SELECTORS) || node.querySelector?.(TOOLBAR_SELECTORS)) {
                    queueEditorScan(document);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Add toolbar styles.
 */
export function addToolbarStyles() {
    const styleId = "mosh-toolbar-styles";
    if (document.getElementById(styleId)) return;

    const styles = `
        .mosh-toolbar-group {
            display: inline-flex !important;
            align-items: center;
            margin-left: 8px;
            gap: 4px;
        }

        .mosh-toolbar-separator {
            width: 1px;
            height: 20px;
            background: var(--color-border-light, #666);
            margin-right: 4px;
        }

        .mosh-toolbar-btn {
            display: inline-flex !important;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid var(--color-border-light, #666);
            border-radius: 4px;
            background: var(--color-bg-btn, #444);
            color: var(--color-text-primary, #ddd);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
        }

        .mosh-toolbar-btn:hover {
            background: var(--color-bg-btn-hover, #555);
            border-color: #f2ea79;
        }

        .mosh-toolbar-btn i {
            font-size: 14px;
        }

        .mosh-toolbar-btn .btn-text {
            font-weight: 500;
        }
    `;

    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
    log("Toolbar styles added");
}
