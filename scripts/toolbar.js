/**
 * MOSH Journal Enhancer - Editor Toolbar
 * Adds scoped formatting controls to Foundry ProseMirror journal editors.
 */

import { MODULE_ID } from "./config.js";
import { localize, escapeHtml, isMonksEnhancedJournalActive, log, logError } from "./utils.js";
import { MoshBlockPanel, MoshFigureDialog, MoshTextColorPanel, MoshTextEffectPanel } from "./dialogs-v2.js";

let toolbarHooksRegistered = false;
let figureHandlersRegistered = false;
let toolbarObserverRegistered = false;
let currentFigureToolbar = null;
let currentTargetFigure = null;
let lastActiveEditor = null;
let lastSelectionRange = null;
const proseMirrorViewsByEditor = new WeakMap();

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

    registerNativeProseMirrorMenuItems();

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

function registerNativeProseMirrorMenuItems() {
    Hooks.on("createProseMirrorEditor", (uuid, plugins) => {
        const Plugin = globalThis.ProseMirror?.Plugin;
        if (!Plugin || plugins.moshJournalEnhancerViewCapture) return;

        plugins.moshJournalEnhancerViewCapture = new Plugin({
            view: editorView => {
                const editor = editorView.dom;
                proseMirrorViewsByEditor.set(editor, editorView);
                log("ProseMirror view registered from plugin", {
                    uuid,
                    editorClassName: editor.className,
                    viewClass: editorView.constructor?.name || ""
                });

                return {
                    destroy() {
                        proseMirrorViewsByEditor.delete(editor);
                    }
                };
            }
        });
    });

    Hooks.on("getProseMirrorMenuItems", (menu, items) => {
        const view = menu?.view;
        const editor = view?.dom;
        if (!view || !editor) return;

        proseMirrorViewsByEditor.set(editor, view);
        log("ProseMirror view registered from menu", {
            editorClassName: editor.className,
            viewClass: view.constructor?.name || ""
        });

        if (items.some(item => item.action === "mosh-color")) return;

        const scope = menu.constructor?._MENU_ITEM_SCOPES?.TEXT || "text";
        items.push(
            {
                action: "mosh-label",
                title: "MOSH Journal Enhancer",
                icon: '<span class="mosh-native-menu-label">MOSH</span>',
                scope,
                cssClass: "mosh-native-menu-label-item",
                cmd: () => {}
            },
            {
                action: "mosh-blocks",
                title: localize("MOSH.Toolbar.BlocksTitle"),
                icon: '<i class="fas fa-cube fa-fw"></i>',
                scope,
                cssClass: "mosh-native-menu-item",
                cmd: (state, dispatch, currentView) => openBlockPanel(buildProseMirrorCommandOptions(currentView))
            },
            {
                action: "mosh-effects",
                title: localize("MOSH.Toolbar.EffectsTitle"),
                icon: '<i class="fas fa-wand-magic-sparkles fa-fw"></i>',
                scope,
                cssClass: "mosh-native-menu-item",
                cmd: (state, dispatch, currentView) => openTextEffectPanel(buildProseMirrorCommandOptions(currentView))
            },
            {
                action: "mosh-color",
                title: localize("MOSH.Toolbar.ColorTitle"),
                icon: '<i class="fas fa-palette fa-fw"></i>',
                scope,
                cssClass: "mosh-native-menu-item",
                cmd: (state, dispatch, currentView) => openTextColorPanel(buildProseMirrorCommandOptions(currentView))
            },
            {
                action: "mosh-image",
                title: localize("MOSH.Toolbar.ImageTitle"),
                icon: '<i class="fas fa-image fa-fw"></i>',
                scope,
                cssClass: "mosh-native-menu-item",
                cmd: (state, dispatch, currentView) => openFigureDialog(buildProseMirrorCommandOptions(currentView))
            }
        );
    });
}

function handleEditorRender(app, html, options = {}) {
    const root = normalizeElement(html) || normalizeElement(app?.element);
    const editor = findScopedEditor(root, app);
    if (!editor) return;

    lastActiveEditor = editor;
    rememberProseMirrorView(editor, app);
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

function rememberProseMirrorView(editor, app) {
    const view = findProseMirrorView(app) || findProseMirrorView(editor);
    if (!view) {
        log("ProseMirror view not found for editor", {
            appClass: app?.constructor?.name || "",
            appKeys: app ? Object.keys(app).slice(0, 40) : [],
            editorKeys: editor ? Object.keys(editor).slice(0, 40) : []
        });
        return;
    }

    proseMirrorViewsByEditor.set(editor, view);
    log("ProseMirror view registered", {
        appClass: app?.constructor?.name || "",
        editorClassName: editor.className,
        viewClass: view.constructor?.name || ""
    });
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
        rememberProseMirrorView(editor, app);
        addToolbarToEditor(editor, normalizedRoot);
    }

    const appElement = normalizeElement(app?.element);
    if (appElement && appElement !== normalizedRoot) {
        const appEditors = appElement.matches?.(EDITOR_SELECTORS)
            ? [appElement]
            : Array.from(appElement.querySelectorAll?.(EDITOR_SELECTORS) || []);
        for (const editor of appEditors) {
            rememberProseMirrorView(editor, app);
            addToolbarToEditor(editor, appElement);
        }
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
    if (!toolbar || toolbar.querySelector(".mosh-toolbar-group, [data-action='mosh-color']")) return;

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
    group.dataset.moshToolbar = "true";
    group.innerHTML = `
        <span class="mosh-toolbar-separator" aria-hidden="true"></span>
        <span class="mosh-toolbar-label" title="MOSH Journal Enhancer">MOSH</span>
    `;

    const blocksBtn = createToolbarButton("mosh-blocks", "fas fa-cube", "MOSH.Toolbar.Blocks", "MOSH.Toolbar.BlocksTitle");
    blocksBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    blocksBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openBlockPanel({ editor: editorElement, range: lastSelectionRange });
    });

    const effectsBtn = createToolbarButton("mosh-effects", "fas fa-wand-magic-sparkles", "MOSH.Toolbar.Effects", "MOSH.Toolbar.EffectsTitle");
    effectsBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    effectsBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openTextEffectPanel({ editor: editorElement, range: lastSelectionRange });
    });

    const colorBtn = createToolbarButton("mosh-color", "fas fa-palette", "MOSH.Toolbar.Color", "MOSH.Toolbar.ColorTitle");
    colorBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    colorBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openTextColorPanel({ editor: editorElement, range: lastSelectionRange });
    });

    const imageBtn = createToolbarButton("mosh-image", "fas fa-image", "MOSH.Toolbar.Image", "MOSH.Toolbar.ImageTitle");
    imageBtn.addEventListener("mousedown", saveEditorSelection(editorElement));
    imageBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        openFigureDialog({ editor: editorElement, range: lastSelectionRange });
    });

    group.append(blocksBtn, effectsBtn, colorBtn, imageBtn);
    toolbar.append(group);
    log("Toolbar buttons added");
}

function createToolbarButton(action, icon, labelKey, titleKey) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mosh-toolbar-btn mosh-toolbar-${action}`;
    button.dataset.action = action;
    button.title = localize(titleKey);
    button.setAttribute("aria-label", localize(titleKey));
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

function buildProseMirrorCommandOptions(view) {
    const editor = view?.dom || getActiveEditor();
    if (editor && view) proseMirrorViewsByEditor.set(editor, view);
    const range = getDOMRangeFromProseMirrorSelection(view) || getSelectionRangeInEditor(editor) || lastSelectionRange;
    if (editor) lastActiveEditor = editor;
    if (range) lastSelectionRange = range.cloneRange();

    return {
        editor,
        range,
        pmView: view
    };
}

function getDOMRangeFromProseMirrorSelection(view) {
    if (!view?.state?.selection || typeof view.domAtPos !== "function") return null;
    const { from, to, empty } = view.state.selection;
    if (empty) return null;

    try {
        const start = view.domAtPos(from);
        const end = view.domAtPos(to);
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
    } catch (error) {
        logError("Could not convert ProseMirror selection to DOM range", error);
        return null;
    }
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
        if (options.pmView) proseMirrorViewsByEditor.set(options.editor, options.pmView);
        lastSelectionRange = options.range || lastSelectionRange;
    }

    new MoshBlockPanel({
        onSelect: ({ className, label, modifier }) => {
            insertBlock(className, label, {
                editor: options.editor || lastActiveEditor,
                range: options.range || lastSelectionRange,
                modifier: modifier
            });
        }
    }).render(true);
}

function openTextEffectPanel(options = {}) {
    if (options.editor) {
        lastActiveEditor = options.editor;
        if (options.pmView) proseMirrorViewsByEditor.set(options.editor, options.pmView);
        lastSelectionRange = options.range || lastSelectionRange;
    }

    new MoshTextEffectPanel({
        redactedPalette: buildThemeColorPalette(options.editor || lastActiveEditor, { includeDark: true }),
        onApply: ({ className, label, intensity, redactedColor }) => {
            insertInlineEffect(className, label, {
                editor: options.editor || lastActiveEditor,
                range: options.range || lastSelectionRange,
                intensity,
                redactedColor
            });
        }
    }).render(true);
}

function openTextColorPanel(options = {}) {
    const editor = options.editor || lastActiveEditor;
    const preservedRange = (options.range || lastSelectionRange)?.cloneRange?.() || null;
    if (editor) {
        lastActiveEditor = editor;
        if (options.pmView) proseMirrorViewsByEditor.set(editor, options.pmView);
        lastSelectionRange = preservedRange || lastSelectionRange;
    }

    new MoshTextColorPanel({
        palette: buildThemeColorPalette(editor),
        onApply: ({ color, label }) => {
            insertTextColor(color, label, {
                editor: options.editor || lastActiveEditor,
                range: preservedRange || lastSelectionRange,
                pmView: options.pmView
            });
        }
    }).render(true);
}

function openFigureDialog(options = {}) {
    const editor = options.editor || getActiveEditor();
    const range = options.range || getSelectionRangeInEditor(editor) || lastSelectionRange;

    lastActiveEditor = editor;
    if (editor && options.pmView) proseMirrorViewsByEditor.set(editor, options.pmView);
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

    const expandedRange = normalizeBlockInsertionRange(expandRangeToSmartBlocks(range, editor), editor);
    const content = selectedRangeHTML(expandedRange) || `<p>${escapeHtml(localize("MOSH.Blocks.Placeholder"))}</p>`;
    
    let classes = className;
    if (options.modifier) {
        classes += ' ' + options.modifier;
    }
    
    const blockHTML = `<div class="${escapeHtml(classes)}">${content}</div>`;

    const inserted = insertHTMLIntoActiveEditor(blockHTML, { editor, range: expandedRange, preferRange: true });
    if (inserted) ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
    return inserted;
}

/**
 * Insert an inline text effect wrapping the selected content.
 */
export function insertInlineEffect(className, label, options = {}) {
    const editor = getActiveEditor(options.editor);
    if (editor && options.pmView) proseMirrorViewsByEditor.set(editor, options.pmView);
    if (!editor) {
        ui.notifications.warn(localize("MOSH.Dialog.NoEditor"));
        return false;
    }

    const range = options.range || getSelectionRangeInEditor(editor);
    logInlineSelectionDiagnostics("effect:start", range, editor, { className, label });
    if (!range || range.collapsed) {
        ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
        return false;
    }

    const existingEffects = getSelectedEffectRoots(range, editor);
    logInlineSelectionDiagnostics("effect:roots", range, editor, {
        className,
        roots: existingEffects.map(describeInlineElement)
    });

    const selectedHTML = selectedRangeHTML(range);
    const text = selectedRangeText(range) || stripHtml(selectedHTML);
    const intensity = Number(options.intensity) || 2;
    const styles = [`--mosh-fx-intensity: ${String(intensity)}`];
    if (className === "mosh-fx-redacted" && options.redactedColor) {
        styles.push(`--mosh-redacted-color: ${normalizeHexColor(options.redactedColor) || "#111111"}`);
    }

    if (existingEffects.length) {
        const pmView = options.pmView || getProseMirrorView(editor);
        if (updateExistingEffectMarks(pmView, className, {
            intensity,
            styleText: styles.join("; "),
            text
        })) {
            logInlineSelectionDiagnostics("effect:update-marks", range, editor, {
                className,
                roots: existingEffects.map(describeInlineElement)
            });
            if (className === "mosh-fx-corrupt") {
                window.dispatchEvent(new CustomEvent("mosh-journal-enhancer:apply-corruption", { detail: { root: editor } }));
            }
            ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
            return true;
        }

        const updated = existingEffects.every(effect => updateExistingInlineEffect(effect, className, {
            intensity,
            redactedColor: options.redactedColor
        }, editor, { notify: false }));
        notifyEditorChanged(editor);
        logInlineSelectionDiagnostics("effect:update-existing", range, editor, {
            className,
            updated,
            roots: existingEffects.map(describeInlineElement)
        });
        if (updated && className === "mosh-fx-corrupt") {
            window.dispatchEvent(new CustomEvent("mosh-journal-enhancer:apply-corruption", { detail: { root: editor } }));
        }
        if (updated) ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
        return updated;
    }

    const pmView = options.pmView || getProseMirrorView(editor);
    if (applyInlineEffectMark(pmView, className, {
        intensity,
        styleText: styles.join("; "),
        text
    })) {
        logInlineSelectionDiagnostics("effect:mark", range, editor, { className, inserted: true });
        if (className === "mosh-fx-corrupt") {
            window.dispatchEvent(new CustomEvent("mosh-journal-enhancer:apply-corruption", { detail: { root: editor } }));
        }
        ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
        return true;
    }

    const inserted = wrapRangeInInlineSpan(range, editor, {
        className,
        dataset: {
            moshEffectIntensity: String(intensity),
            moshText: text
        },
        styleText: styles.join("; "),
        fallbackText: text
    });
    logInlineSelectionDiagnostics("effect:wrap", range, editor, { className, inserted });
    if (inserted && className === "mosh-fx-corrupt") {
        window.dispatchEvent(new CustomEvent("mosh-journal-enhancer:apply-corruption", { detail: { root: editor } }));
    }
    if (inserted) ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
    return inserted;
}

/**
 * Apply an inline text color to the selected content.
 */
export function insertTextColor(color, label, options = {}) {
    const editor = getActiveEditor(options.editor);
    if (editor && options.pmView) proseMirrorViewsByEditor.set(editor, options.pmView);
    if (!editor) {
        ui.notifications.warn(localize("MOSH.Dialog.NoEditor"));
        return false;
    }

    const range = options.range || getSelectionRangeInEditor(editor);
    logInlineSelectionDiagnostics("color:start", range, editor, { color, label });
    if (!range || range.collapsed) {
        ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
        return false;
    }

    const normalizedColor = normalizeHexColor(color);
    if (!normalizedColor) {
        ui.notifications.warn(localize("MOSH.Color.InvalidColor"));
        return false;
    }

    const existingEffects = getSelectedEffectRoots(range, editor);
    logInlineSelectionDiagnostics("color:roots", range, editor, {
        color: normalizedColor,
        roots: existingEffects.map(describeInlineElement)
    });

    if (existingEffects.length) {
        const pmView = options.pmView || getProseMirrorView(editor);
        const pmUpdated = applyColorToExistingEffectMarks(pmView, normalizedColor);
        if (pmUpdated) {
            logInlineSelectionDiagnostics("color:update-effect-marks", range, editor, {
                color: normalizedColor,
                roots: existingEffects.map(describeInlineElement)
            });
            ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
            return true;
        }

        if (pmView) {
            logInlineSelectionDiagnostics("color:update-effect-marks-failed", range, editor, {
                color: normalizedColor,
                roots: existingEffects.map(describeInlineElement)
            });
            ui.notifications.warn(localize("MOSH.Color.InvalidSelection") || localize("MOSH.Blocks.SelectText"));
            return false;
        }

        const updated = replaceSelectedInlineEffectsWithColor(existingEffects, editor, normalizedColor);
        logInlineSelectionDiagnostics("color:update-effects", range, editor, {
            color: normalizedColor,
            updated,
            roots: existingEffects.map(describeInlineElement)
        });
        if (!updated) return false;

        ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
        return true;
    }

    const html = selectedRangeHTML(range) || escapeHtml(selectedRangeText(range));
    if (!html) {
        ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
        return false;
    }

    const pmColorInserted = applyTextColorMark(options.pmView || getProseMirrorView(editor), normalizedColor);
    if (pmColorInserted) {
        logInlineSelectionDiagnostics("color:mark", range, editor, { color: normalizedColor, inserted: true });
        ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
        return true;
    }

    const inserted = insertHTMLIntoActiveEditor(`<span class="mosh-text-color" style="color: ${normalizedColor}">${html}</span>`, {
        editor,
        range,
        preferRange: false
    });
    logInlineSelectionDiagnostics("color:wrap", range, editor, { color: normalizedColor, inserted });
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
    if (editor && options.pmView) proseMirrorViewsByEditor.set(editor, options.pmView);
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
export function insertHTMLIntoActiveEditor(html, { range = null, editor = null, preferRange = false } = {}) {
    const targetEditor = getActiveEditor(editor);
    if (!targetEditor) {
        ui.notifications.error(localize("MOSH.Dialog.NoEditor"));
        return false;
    }

    targetEditor.focus();
    restoreRange(range, targetEditor);

    try {
        const pmInserted = insertHTMLThroughProseMirror(html, targetEditor, range);
        if (pmInserted) return true;
    } catch (error) {
        logError("ProseMirror transaction insertHTML failed, trying editor fallbacks", error);
    }

    try {
        if (!preferRange) {
            // Try to use native ProseMirror API if available
            const pmView = getProseMirrorView(targetEditor);
            if (pmView && typeof pmView.pasteHTML === 'function') {
                pmView.pasteHTML(html);
                notifyEditorChanged(targetEditor);
                return true;
            }
        }
    } catch (e) {
        logError("ProseMirror pasteHTML failed, falling back to execCommand", e);
    }

    try {
        if (!preferRange && document.queryCommandSupported?.("insertHTML")) {
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

function insertHTMLThroughProseMirror(html, editor, range = null) {
    const pmView = getProseMirrorView(editor);
    const parser = globalThis.ProseMirror?.dom?.parseString;
    if (!pmView?.state?.schema || typeof parser !== "function") return false;

    const parsed = parser(html, pmView.state.schema);
    if (!parsed?.type) {
        log("ProseMirror transaction insertHTML skipped non-node parse result", {
            html,
            parsedType: parsed?.constructor?.name || typeof parsed
        });
        return false;
    }

    const tr = pmView.state.tr;
    const positions = getProseMirrorPositionsFromRange(pmView, range);
    if (positions) {
        tr.replaceWith(positions.from, positions.to, parsed);
    } else {
        tr.replaceSelectionWith(parsed);
    }

    pmView.dispatch(tr.scrollIntoView());
    window.setTimeout(pmView.focus.bind(pmView), 0);
    notifyEditorChanged(editor);
    log("ProseMirror transaction insertHTML", {
        nodeType: parsed.type.name,
        from: positions?.from,
        to: positions?.to,
        html
    });
    return true;
}

function getProseMirrorPositionsFromRange(pmView, range) {
    if (!range || typeof pmView?.posAtDOM !== "function") return null;

    try {
        const from = pmView.posAtDOM(range.startContainer, range.startOffset);
        const to = pmView.posAtDOM(range.endContainer, range.endOffset);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
        return { from, to };
    } catch (error) {
        logError("Could not map DOM range to ProseMirror positions", error);
        return null;
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

function selectedRangeText(range) {
    return range.cloneContents().textContent?.trim() || "";
}

function stripHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent?.trim() || "";
}

function wrapRangeInInlineSpan(range, editor, { className = "", dataset = {}, styleText = "", fallbackText = "" } = {}) {
    if (!range || !editor?.contains(range.commonAncestorContainer)) return false;

    try {
        const span = document.createElement("span");
        span.className = className;
        if (styleText) span.setAttribute("style", styleText);
        for (const [key, value] of Object.entries(dataset)) {
            span.dataset[key] = value;
        }

        const fragment = range.extractContents();
        if (fragment.textContent || fragment.childNodes.length) {
            span.appendChild(fragment);
        } else {
            span.textContent = fallbackText || "";
        }

        if (!span.textContent?.trim()) {
            ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
            return false;
        }

        range.insertNode(span);

        const selection = window.getSelection();
        selection.removeAllRanges();
        const after = document.createRange();
        after.setStartAfter(span);
        after.collapse(true);
        selection.addRange(after);

        notifyEditorChanged(editor);
        return true;
    } catch (error) {
        logError("Inline span wrapping failed", error);
        ui.notifications.error(`${localize("MOSH.Dialog.InsertError")}: ${error.message}`);
        return false;
    }
}

function applyInlineEffectMark(pmView, className, { intensity = 2, styleText = "", text = "" } = {}) {
    const spanMark = pmView?.state?.schema?.marks?.span;
    if (!pmView?.state?.selection || !spanMark) {
        log("ProseMirror effect mark insert skipped", {
            hasView: !!pmView,
            hasSelection: !!pmView?.state?.selection,
            hasSpanMark: !!spanMark,
            className
        });
        return false;
    }

    const { state } = pmView;
    const { from, to, empty } = state.selection;
    if (empty || to <= from) {
        log("ProseMirror effect mark insert skipped empty selection", { className, from, to, empty });
        return false;
    }

    const preserve = {
        class: className,
        style: styleText,
        "data-mosh-effect-intensity": String(intensity),
        "data-mosh-text": text || state.doc.textBetween(from, to, " ")
    };

    const mark = spanMark.create({ _preserve: preserve });
    const tr = state.tr.addMark(from, to, mark).scrollIntoView();
    pmView.dispatch(tr);
    window.setTimeout(pmView.focus.bind(pmView), 0);
    log("ProseMirror effect mark inserted", {
        className,
        from,
        to,
        preserve
    });
    return true;
}

function updateExistingEffectMarks(pmView, className, { intensity = 2, styleText = "", text = "" } = {}) {
    const spanMark = pmView?.state?.schema?.marks?.span;
    if (!pmView?.state?.selection || !spanMark) return false;

    const { state } = pmView;
    const { from, to, empty } = state.selection;
    if (empty || to <= from) return false;

    const tr = state.tr;
    let changed = false;

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return true;

        for (const mark of node.marks) {
            if (mark.type !== spanMark || !isMoshEffectMark(mark)) continue;

            const start = Math.max(from, pos);
            const end = Math.min(to, pos + node.nodeSize);
            if (end <= start) continue;

            const attrs = foundry.utils.deepClone(mark.attrs || {});
            const preserve = attrs._preserve || {};
            preserve.class = replaceMoshEffectClass(preserve.class || "", className);
            preserve.style = mergePreservedStyle(preserve, styleText).style;
            preserve["data-mosh-effect-intensity"] = String(intensity);
            preserve["data-mosh-text"] = text || state.doc.textBetween(start, end, " ");
            attrs._preserve = preserve;

            tr.removeMark(start, end, mark);
            tr.addMark(start, end, spanMark.create(attrs));
            changed = true;
        }

        return true;
    });

    if (!changed) return false;

    pmView.dispatch(tr.scrollIntoView());
    window.setTimeout(pmView.focus.bind(pmView), 0);
    log("ProseMirror effect mark updated", { className, from, to });
    return true;
}

function applyTextColorMark(pmView, color) {
    const spanMark = pmView?.state?.schema?.marks?.span;
    if (!pmView?.state?.selection || !spanMark) return false;

    const { state } = pmView;
    const { from, to, empty } = state.selection;
    if (empty || to <= from) return false;

    const mark = spanMark.create({
        _preserve: {
            class: "mosh-text-color",
            style: `color: ${color}`
        }
    });

    pmView.dispatch(state.tr.addMark(from, to, mark).scrollIntoView());
    window.setTimeout(pmView.focus.bind(pmView), 0);
    log("ProseMirror text color mark inserted", { color, from, to });
    return true;
}

function applyColorToExistingEffectMarks(pmView, color) {
    const spanMark = pmView?.state?.schema?.marks?.span;
    if (!pmView?.state?.selection || !spanMark) return false;

    const { state } = pmView;
    const { from, to, empty } = state.selection;
    if (empty || to <= from) return false;

    const tr = state.tr;
    let changed = false;

    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return true;

        for (const mark of node.marks) {
            if (mark.type !== spanMark || !isMoshEffectMark(mark)) continue;

            const start = Math.max(from, pos);
            const end = Math.min(to, pos + node.nodeSize);
            if (end <= start) continue;

            const attrs = foundry.utils.deepClone(mark.attrs || {});
            attrs._preserve = mergePreservedStyle(attrs._preserve || {}, `color: ${color}`);
            tr.removeMark(start, end, mark);
            tr.addMark(start, end, spanMark.create(attrs));
            changed = true;
        }

        return true;
    });

    if (!changed) {
        log("ProseMirror effect mark color update found no effect marks", {
            color,
            from,
            to,
            marks: collectSelectionMarkDiagnostics(state, from, to)
        });
        return false;
    }

    pmView.dispatch(tr.scrollIntoView());
    window.setTimeout(pmView.focus.bind(pmView), 0);
    log("ProseMirror effect mark color updated", { color, from, to });
    return true;
}

function isMoshEffectMark(mark) {
    const className = mark.attrs?._preserve?.class || "";
    return /\bmosh-fx-(corrupt|redacted|glitch|typewriter|scramble|flicker)\b/.test(className);
}

function replaceMoshEffectClass(className, replacement) {
    const classes = String(className || "")
        .split(/\s+/)
        .filter(Boolean)
        .filter(cls => !/^mosh-fx-(corrupt|redacted|glitch|typewriter|scramble|flicker)$/.test(cls));
    classes.push(replacement);
    return [...new Set(classes)].join(" ");
}

function collectSelectionMarkDiagnostics(state, from, to) {
    const marks = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isText) return true;
        for (const mark of node.marks) {
            marks.push({
                pos,
                text: node.text?.slice(0, 80) || "",
                type: mark.type?.name || "",
                attrs: foundry.utils.deepClone(mark.attrs || {})
            });
        }
        return true;
    });
    return marks.slice(0, 20);
}

function mergePreservedStyle(preserve, styleText) {
    const next = { ...preserve };
    const styles = parseInlineStyle(next.style || "");
    Object.assign(styles, parseInlineStyle(styleText));
    next.style = Object.entries(styles).map(([key, value]) => `${key}: ${value}`).join("; ");
    return next;
}

function parseInlineStyle(styleText = "") {
    return String(styleText).split(";").reduce((styles, declaration) => {
        const index = declaration.indexOf(":");
        if (index < 0) return styles;
        const key = declaration.slice(0, index).trim().toLowerCase();
        const value = declaration.slice(index + 1).trim();
        if (key && value) styles[key] = value;
        return styles;
    }, {});
}

function updateExistingInlineEffect(element, className, options = {}, editor, { notify = true } = {}) {
    if (!element?.isConnected || !editor?.contains(element)) return false;

    const effectClasses = ["mosh-fx-glitch", "mosh-fx-typewriter", "mosh-fx-corrupt", "mosh-fx-scramble", "mosh-fx-redacted", "mosh-fx-flicker"];
    element.classList.remove(...effectClasses);
    element.classList.remove("mosh-fx-corrupt-active", "mosh-fx-corrupt-editor");
    if (className) element.classList.add(className);

    const intensity = Number(options.intensity) || 2;
    element.dataset.moshEffectIntensity = String(intensity);
    element.style.setProperty("--mosh-fx-intensity", String(intensity));
    element.dataset.moshText = getEffectSourceText(element);

    if (className === "mosh-fx-redacted" && options.redactedColor) {
        element.style.setProperty("--mosh-redacted-color", normalizeHexColor(options.redactedColor) || "#111111");
    }

    if (notify) notifyEditorChanged(editor);
    return true;
}

function replaceSelectedInlineEffectsWithColor(effects, editor, color) {
    const orderedEffects = [...effects]
        .filter(effect => effect?.isConnected && editor?.contains(effect))
        .sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
            if (position & Node.DOCUMENT_POSITION_PRECEDING) return -1;
            return 0;
        });

    if (!orderedEffects.length) return false;

    let updated = false;
    for (const effect of orderedEffects) {
        const replacementHTML = buildColoredEffectHTML(effect, color);
        if (!replacementHTML) continue;

        if (replaceElementThroughProseMirror(effect, editor, replacementHTML)) {
            updated = true;
            continue;
        }

        const effectRange = document.createRange();
        effectRange.selectNode(effect);
        updated = insertHTMLIntoActiveEditor(replacementHTML, {
            editor,
            range: effectRange,
            preferRange: false
        }) || updated;
    }

    return updated;
}

function replaceElementThroughProseMirror(element, editor, html) {
    const pmView = getProseMirrorView(editor);
    const parser = globalThis.ProseMirror?.dom?.parseString;
    if (!pmView?.state?.schema || typeof pmView.posAtDOM !== "function" || typeof parser !== "function") {
        log("ProseMirror element replacement skipped", {
            hasView: !!pmView,
            hasSchema: !!pmView?.state?.schema,
            hasPosAtDOM: typeof pmView?.posAtDOM === "function",
            hasParser: typeof parser === "function",
            editorClassName: editor?.className || "",
            elementClassName: element?.className || ""
        });
        return false;
    }

    try {
        const from = pmView.posAtDOM(element, 0);
        const to = pmView.posAtDOM(element, element.childNodes.length);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
            log("ProseMirror element replacement invalid range", {
                from,
                to,
                childNodes: element.childNodes.length,
                html
            });
            return false;
        }

        const parsed = parser(html, pmView.state.schema);
        if (!parsed) return false;

        const tr = pmView.state.tr;
        if (parsed.type) {
            tr.replaceRangeWith(from, to, parsed);
        } else {
            tr.replaceWith(from, to, parsed);
        }

        pmView.dispatch(tr);
        window.setTimeout(pmView.focus.bind(pmView), 0);
        notifyEditorChanged(editor);
        log("ProseMirror element replacement", {
            from,
            to,
            html,
            parsedType: parsed.type?.name || parsed.constructor?.name || typeof parsed
        });
        return true;
    } catch (error) {
        logError("ProseMirror element replacement failed", error);
        return false;
    }
}

function getProseMirrorView(editor) {
    return proseMirrorViewsByEditor.get(editor)
        || editor?.pmView
        || findProseMirrorView(editor)
        || findGlobalProseMirrorView(editor);
}

function findProseMirrorView(value, seen = new Set(), depth = 0) {
    if (!value || depth > 3) return null;
    if (value.constructor?.name === "EditorView" && value.state && value.dispatch) return value;
    if (seen.has(value)) return null;
    if (typeof value !== "object" && typeof value !== "function") return null;

    seen.add(value);

    for (const key of Object.keys(value)) {
        let child;
        try {
            child = value[key];
        } catch (error) {
            continue;
        }

        if (!child || child instanceof HTMLElement || child instanceof Document || child instanceof Window) continue;
        if (child.constructor?.name === "EditorView" && child.state && child.dispatch) return child;
        if (typeof child === "object" || typeof child === "function") {
            const found = findProseMirrorView(child, seen, depth + 1);
            if (found) return found;
        }
    }

    return null;
}

function findGlobalProseMirrorView(editor) {
    const candidates = collectFoundryApplicationCandidates();
    for (const candidate of candidates) {
        const view = findMatchingProseMirrorView(candidate, editor);
        if (view) {
            proseMirrorViewsByEditor.set(editor, view);
            log("ProseMirror view found globally", {
                candidateClass: candidate?.constructor?.name || "",
                editorClassName: editor?.className || "",
                viewClass: view.constructor?.name || "",
                viewDomClassName: view.dom?.className || ""
            });
            return view;
        }
    }

    log("ProseMirror global view search failed", {
        candidateCount: candidates.length,
        editorClassName: editor?.className || "",
        editorOwnProperties: editor ? Object.getOwnPropertyNames(editor).slice(0, 40) : [],
        editorDataset: editor?.dataset ? { ...editor.dataset } : {}
    });
    return null;
}

function collectFoundryApplicationCandidates() {
    const candidates = new Set();

    for (const app of Object.values(ui?.windows || {})) candidates.add(app);

    const instances = foundry?.applications?.instances;
    if (instances instanceof Map) {
        for (const app of instances.values()) candidates.add(app);
    } else if (instances) {
        for (const app of Object.values(instances)) candidates.add(app);
    }

    for (const app of Object.values(foundry?.applications?.instances?._source || {})) candidates.add(app);

    return Array.from(candidates).filter(Boolean);
}

function findMatchingProseMirrorView(value, editor, seen = new Set(), depth = 0) {
    if (!value || !editor || depth > 5) return null;
    if (seen.has(value)) return null;
    if (typeof value !== "object" && typeof value !== "function") return null;
    if (value instanceof HTMLElement || value instanceof Document || value instanceof Window) return null;

    seen.add(value);

    if (isEditorView(value) && viewMatchesEditor(value, editor)) return value;

    for (const key of Object.keys(value)) {
        let child;
        try {
            child = value[key];
        } catch (error) {
            continue;
        }

        if (!child || child instanceof HTMLElement || child instanceof Document || child instanceof Window) continue;
        if (isEditorView(child) && viewMatchesEditor(child, editor)) return child;

        const found = findMatchingProseMirrorView(child, editor, seen, depth + 1);
        if (found) return found;
    }

    return null;
}

function isEditorView(value) {
    return value?.constructor?.name === "EditorView" && value.state && value.dispatch && value.dom;
}

function viewMatchesEditor(view, editor) {
    return view.dom === editor || editor.contains(view.dom) || view.dom.contains(editor);
}

function buildColoredEffectHTML(effect, color) {
    const clone = effect.cloneNode(true);
    clone.classList.remove("mosh-fx-corrupt-active", "mosh-fx-corrupt-editor");
    clone.removeAttribute("data-mosh-corruption-id");

    normalizeCorruptionCloneForStorage(clone);

    const colorSpan = findExistingColorSpan(clone);
    if (colorSpan) {
        if (colorSpan.tagName === "FONT") {
            colorSpan.setAttribute("color", color);
        } else {
            colorSpan.style.color = color;
        }
    } else {
        const wrapper = document.createElement("span");
        wrapper.className = "mosh-text-color";
        wrapper.style.color = color;
        wrapper.append(...Array.from(clone.childNodes));
        clone.appendChild(wrapper);
    }

    if (clone.classList.contains("mosh-fx-corrupt")) {
        clone.dataset.moshText = clone.textContent?.trim() || clone.dataset.moshText || "";
    }

    return clone.outerHTML;
}

function normalizeCorruptionCloneForStorage(clone) {
    clone.querySelectorAll(".mosh-fx-frame").forEach(frame => frame.remove());

    const source = clone.querySelector(":scope > .mosh-fx-source");
    if (source) {
        source.replaceWith(...Array.from(source.childNodes));
    }
}

function findExistingColorSpan(root) {
    return root.querySelector(".mosh-text-color, span[style*='color'], font[color]");
}

function getSelectedEffectRoots(range, editor) {
    if (!range || !editor) return [];
    const roots = Array.from(editor.querySelectorAll(".mosh-fx-corrupt, .mosh-fx-redacted, .mosh-fx-glitch, .mosh-fx-typewriter, .mosh-fx-scramble, .mosh-fx-flicker"));
    return roots.filter(root => {
        try {
            return range.intersectsNode(root);
        } catch (error) {
            return false;
        }
    });
}

function logInlineSelectionDiagnostics(stage, range, editor, data = {}) {
    try {
        const selection = window.getSelection();
        const startElement = getElementFromRangeNode(range?.startContainer);
        const endElement = getElementFromRangeNode(range?.endContainer);
        log(`Inline style ${stage}`, {
            ...data,
            hasRange: !!range,
            collapsed: !!range?.collapsed,
            selectionText: selection?.toString?.() || "",
            rangeText: range ? selectedRangeText(range) : "",
            editorFound: !!editor,
            start: describeInlineElement(startElement),
            end: describeInlineElement(endElement),
            startEffect: describeInlineElement(startElement?.closest?.(".mosh-fx-corrupt, .mosh-fx-redacted, .mosh-fx-glitch, .mosh-fx-typewriter, .mosh-fx-scramble, .mosh-fx-flicker")),
            endEffect: describeInlineElement(endElement?.closest?.(".mosh-fx-corrupt, .mosh-fx-redacted, .mosh-fx-glitch, .mosh-fx-typewriter, .mosh-fx-scramble, .mosh-fx-flicker"))
        });
    } catch (error) {
        log("Inline style diagnostics failed", { stage, error: error.message });
    }
}

function describeInlineElement(element) {
    if (!(element instanceof HTMLElement)) return null;
    return {
        tag: element.tagName.toLowerCase(),
        className: element.className,
        style: element.getAttribute("style") || "",
        text: element.textContent?.trim()?.slice(0, 80) || ""
    };
}

function getSingleSelectedEffectRoot(range, editor) {
    if (!range || !editor) return null;
    const startElement = getElementFromRangeNode(range.startContainer);
    const endElement = getElementFromRangeNode(range.endContainer);
    const startEffect = startElement?.closest?.(".mosh-fx-corrupt, .mosh-fx-redacted, .mosh-fx-glitch, .mosh-fx-typewriter, .mosh-fx-scramble, .mosh-fx-flicker");
    const endEffect = endElement?.closest?.(".mosh-fx-corrupt, .mosh-fx-redacted, .mosh-fx-glitch, .mosh-fx-typewriter, .mosh-fx-scramble, .mosh-fx-flicker");

    if (startEffect && startEffect === endEffect && editor.contains(startEffect)) return startEffect;
    return null;
}

function getEffectSourceText(element) {
    return element.querySelector(":scope > .mosh-fx-source")?.textContent?.trim()
        || element.dataset.moshText
        || element.textContent?.trim()
        || "";
}

function normalizeInlineStyleRange(range, editor, { expandCorruption = true } = {}) {
    if (!range || !editor) return range;

    const startElement = getElementFromRangeNode(range.startContainer);
    const endElement = getElementFromRangeNode(range.endContainer);
    const startCorrupt = startElement?.closest?.(".mosh-fx-corrupt");
    const endCorrupt = endElement?.closest?.(".mosh-fx-corrupt");

    if (expandCorruption && startCorrupt && startCorrupt === endCorrupt && editor.contains(startCorrupt)) {
        const normalized = document.createRange();
        normalized.selectNode(startCorrupt);
        return normalized;
    }

    return range;
}

function getElementFromRangeNode(node) {
    if (!node) return null;
    return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function buildThemeColorPalette(editor, { includeDark = false } = {}) {
    const host = editor?.closest?.(".application, .app, .window-app, .journal-sheet, .monks-enhanced-journal, .editor") || document.body;
    const style = window.getComputedStyle(host);
    const bodyStyle = window.getComputedStyle(document.body);
    const candidates = [
        { label: localize("MOSH.Color.Primary"), color: style.color },
        { label: localize("MOSH.Color.Accent"), color: cssVar(style, "--color-border-highlight") || cssVar(bodyStyle, "--color-border-highlight") },
        { label: localize("MOSH.Color.Warning"), color: cssVar(style, "--color-warm-1") || cssVar(bodyStyle, "--color-warm-1") },
        { label: localize("MOSH.Color.Terminal"), color: "#00ff66" },
        { label: localize("MOSH.Color.Signal"), color: "#f2ea79" },
        { label: localize("MOSH.Color.Critical"), color: "#ff3355" }
    ];

    if (includeDark) {
        candidates.unshift(
            { label: localize("MOSH.Color.Dark"), color: "#111111" },
            { label: localize("MOSH.Color.Slate"), color: "#3a3a3a" }
        );
    }

    const seen = new Set();
    return candidates
        .map(item => ({ ...item, color: normalizeCssColor(item.color) }))
        .filter(item => {
            if (!item.color || seen.has(item.color)) return false;
            seen.add(item.color);
            return true;
        })
        .slice(0, 6);
}

function cssVar(style, name) {
    return style.getPropertyValue(name)?.trim() || "";
}

function normalizeCssColor(value) {
    const color = String(value || "").trim();
    if (!color || color === "transparent") return null;
    const hex = normalizeHexColor(color);
    if (hex) return hex;

    const probe = document.createElement("span");
    probe.style.color = color;
    if (!probe.style.color) return null;
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe).color;
    probe.remove();
    return rgbToHex(computed);
}

function rgbToHex(value) {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return null;
    return `#${[match[1], match[2], match[3]].map(part => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHexColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return `#${color.slice(1).split("").map(char => char + char).join("")}`.toLowerCase();
    }
    return null;
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

function normalizeBlockInsertionRange(range, editor) {
    if (!range?.collapsed) return range;

    const validTags = ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SECTION", "UL", "OL", "PRE", "LI"];
    const block = getBlockParent(range.startContainer, editor, validTags);
    if (!block || block === editor) return range;

    const normalized = document.createRange();
    normalized.setStartAfter(block.tagName === "LI" ? block.closest("ul, ol") || block : block);
    normalized.collapse(true);
    return normalized;
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
            margin-left: 6px;
            gap: 4px;
            vertical-align: middle;
        }

        .mosh-toolbar-separator {
            width: 1px;
            height: 24px;
            background: color-mix(in srgb, var(--color-border-light, #666) 80%, transparent);
            margin: 0 5px 0 2px;
        }

        .mosh-toolbar-label {
            display: inline-flex;
            align-items: center;
            height: 24px;
            padding: 0 6px;
            border: 1px solid rgba(242, 234, 121, 0.35);
            border-radius: 4px;
            color: #f2ea79;
            background: rgba(242, 234, 121, 0.08);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
            line-height: 1;
            user-select: none;
        }

        .mosh-toolbar-btn {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            gap: 5px;
            min-height: 28px;
            padding: 5px 8px;
            border: 1px solid var(--color-border-light, #666);
            border-radius: 4px;
            background: color-mix(in srgb, var(--color-bg-btn, #444) 85%, #000);
            color: var(--color-text-primary, #ddd);
            cursor: pointer;
            font-size: 12px;
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

        .editor-menu .mosh-native-menu-label-item {
            margin-left: 6px;
            padding-left: 8px;
            border-left: 1px solid color-mix(in srgb, var(--color-border-light, #666) 80%, transparent);
        }

        .editor-menu .mosh-native-menu-label-item button {
            pointer-events: none;
        }

        .mosh-native-menu-label {
            display: inline-flex;
            align-items: center;
            height: 22px;
            padding: 0 6px;
            border: 1px solid rgba(242, 234, 121, 0.35);
            border-radius: 4px;
            color: #f2ea79;
            background: rgba(242, 234, 121, 0.08);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
            line-height: 1;
            user-select: none;
        }

        .editor-menu .mosh-native-menu-item button:hover {
            color: #f2ea79;
        }

        @media (max-width: 1180px) {
            .mosh-toolbar-btn .btn-text,
            .mosh-toolbar-label {
                display: none;
            }

            .mosh-toolbar-btn {
                width: 30px;
                padding-inline: 0;
            }
        }
    `;

    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
    log("Toolbar styles added");
}
