/**
 * MOSH Journal Enhancer - Editor Toolbar
 * Adds formatting toolbar to journal editors
 * Uses Range API for direct DOM insertion (like the working macro)
 */

import { MODULE_ID, BLOCK_TYPES } from "./config.js";
import { localize } from "./utils.js";
import { MoshBlockPanel } from "./dialogs-v2.js";

// Export openBlockPanel for macro use
export { openBlockPanel };

/**
 * Register the toolbar hook
 */
export function registerToolbarHook() {
    // V13 uses different rendering system - watch for ProseMirror editors
    Hooks.on("renderProseMirrorEditor", (app, html, options) => {
        console.log(`${MODULE_ID} | renderProseMirrorEditor:`, app, html);
        onRenderJournalSheet(app, html, options);
    });
    
    // Also watch for DOM changes to catch editor creation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchForEditors);
    } else {
        watchForEditors();
    }
    
    console.log(`${MODULE_ID} | Toolbar hooks registered`);
}

/**
 * Watch for ProseMirror editors appearing in the DOM
 */
function watchForEditors() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { // ELEMENT_NODE
                    // Check if this is a journal editor
                    const editor = node.querySelector?.('.editor-content.ProseMirror');
                    if (editor) {
                        console.log(`${MODULE_ID} | Found ProseMirror editor via observer:`, editor);
                        addToolbarToEditor(editor);
                    }
                    
                    // Or if the node itself is the editor
                    if (node.classList?.contains('ProseMirror') && node.classList?.contains('editor-content')) {
                        console.log(`${MODULE_ID} | Found ProseMirror editor (direct):`, node);
                        addToolbarToEditor(node);
                    }
                }
            }
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also use setInterval to periodically check and re-add button if missing
    // But not too frequently to avoid conflicts
    setInterval(() => {
        // Don't interfere if figure toolbar is active
        if (currentFigureToolbar) {
            return;
        }
        
        const toolbars = document.querySelectorAll('.editor-menu');
        toolbars.forEach(toolbar => {
            if (!toolbar.querySelector('.mosh-toolbar-group')) {
                console.log(`${MODULE_ID} | Toolbar missing button, re-adding`);
                addMoshToolbarButton($(toolbar));
            }
        });
    }, 2000); // Reduced frequency to 2 seconds
    
    // Add click handler for inline editing of existing figures
    document.addEventListener('click', (event) => {
        // Check if clicked on toolbar itself - don't close
        if (event.target.closest('.mosh-figure-toolbar')) {
            return;
        }
        
        const figure = event.target.closest('figure.mosh-figure');
        
        // If clicked inside editor
        if (figure && figure.closest('.ProseMirror')) {
            event.preventDefault();
            event.stopPropagation();
            showFigureToolbar(figure);
        } else {
            // Clicked outside - hide toolbar
            hideFigureToolbar();
        }
    });
    
    // Update toolbar position on scroll and resize
    let updateToolbarPosition = () => {
        if (currentTargetFigure && currentFigureToolbar) {
            positionFigureToolbar(currentTargetFigure, currentFigureToolbar);
        }
    };
    
    window.addEventListener('scroll', updateToolbarPosition, { passive: true });
    window.addEventListener('resize', updateToolbarPosition, { passive: true });
    
    console.log(`${MODULE_ID} | MutationObserver and interval watching for editors`);
}

/**
 * Add toolbar to a ProseMirror editor element
 */
function addToolbarToEditor(editorElement) {
    // Find the toolbar - it should be a sibling or parent element
    const container = editorElement.closest('.editor') || editorElement.parentElement;
    if (!container) {
        console.log(`${MODULE_ID} | No container found for editor`);
        return;
    }
    
    // Look for toolbar in various possible locations
    let toolbar = container.querySelector('.editor-menu');
    if (!toolbar) {
        toolbar = container.querySelector('.ProseMirror-menubar');
    }
    if (!toolbar) {
        toolbar = container.querySelector('[role="menubar"]');
    }
    if (!toolbar) {
        // Try to find any element that looks like a toolbar
        const allElements = container.querySelectorAll('*');
        for (const el of allElements) {
            if (el.classList.contains('menu') || el.classList.contains('toolbar')) {
                toolbar = el;
                break;
            }
        }
    }
    
    if (toolbar) {
        console.log(`${MODULE_ID} | Found toolbar for editor:`, toolbar);
        addMoshToolbarButton($(toolbar));
    } else {
        console.log(`${MODULE_ID} | No toolbar found, container structure:`, container);
        console.log(`${MODULE_ID} | Container HTML:`, container.outerHTML.substring(0, 500));
    }
}

/**
 * Handle journal sheet rendering
 */
function onRenderJournalSheet(app, html, data) {
    console.log(`${MODULE_ID} | onRenderJournalSheet called`, { app, html, isEditable: app.isEditable });
    
    // Only add toolbar in edit mode
    const isEditable = app.isEditable;
    if (!isEditable) {
        console.log(`${MODULE_ID} | Not editable, skipping toolbar`);
        return;
    }
    
    // Log all potential selectors
    console.log(`${MODULE_ID} | Looking for toolbar...`);
    console.log(`${MODULE_ID} | .editor-menu:`, html.find(".editor-menu").length);
    console.log(`${MODULE_ID} | .ProseMirror-menubar:`, html.find(".ProseMirror-menubar").length);
    console.log(`${MODULE_ID} | .editor-toolbar:`, html.find(".editor-toolbar").length);
    console.log(`${MODULE_ID} | .prosemirror-menu:`, html.find(".prosemirror-menu").length);
    console.log(`${MODULE_ID} | HTML element:`, html[0]);
    
    // Find editor toolbar(s)
    const toolbars = html.find(".editor-menu, .ProseMirror-menubar");
    
    if (toolbars.length === 0) {
        console.log(`${MODULE_ID} | No toolbar found immediately, retrying...`);
        setTimeout(() => {
            const retryToolbars = html.find(".editor-menu, .ProseMirror-menubar");
            console.log(`${MODULE_ID} | Retry found ${retryToolbars.length} toolbars`);
            retryToolbars.each(function() {
                addMoshToolbarButton($(this));
            });
        }, 100);
    } else {
        console.log(`${MODULE_ID} | Found ${toolbars.length} toolbars immediately`);
        toolbars.each(function() {
            addMoshToolbarButton($(this));
        });
    }
}

/**
 * Add MOSH toolbar buttons
 */
function addMoshToolbarButton(toolbar) {
    console.log(`${MODULE_ID} | addMoshToolbarButton called`, toolbar[0]);
    
    if (toolbar.find(".mosh-toolbar-group").length > 0) {
        console.log(`${MODULE_ID} | Toolbar buttons already added, skipping`);
        return;
    }
    
    const group = $(`<span class="mosh-toolbar-group"></span>`);
    group.append(`<span class="mosh-toolbar-separator"></span>`);
    
    // Blocks button
    const blocksBtn = $(`
        <button type="button" class="mosh-toolbar-btn" title="${localize("MOSH.Toolbar.BlocksTitle")}">
            <i class="fas fa-cube"></i>
            <span class="btn-text">${localize("MOSH.Toolbar.Blocks")}</span>
        </button>
    `);
    
    blocksBtn.on("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log(`${MODULE_ID} | MOSH Blocks button clicked`);
        openBlockPanel();
    });
    
    group.append(blocksBtn);
    toolbar.append(group);
    
    console.log(`${MODULE_ID} | Toolbar buttons added successfully`);
    console.log(`${MODULE_ID} | Button HTML:`, group[0].outerHTML);
    console.log(`${MODULE_ID} | Toolbar now contains:`, toolbar[0].children.length, 'children');
}

/**
 * Open block panel with previews (using ApplicationV2)
 */
function openBlockPanel() {
    console.log(`${MODULE_ID} | Opening block panel`);
    
    new MoshBlockPanel({
        onSelect: ({ className, label }) => {
            applyBlockStyle(className, label);
        }
    }).render(true);
}

/**
 * Expand selection to include full block elements (like the working macro)
 */
function expandSelectionToSmartBlocks(sel) {
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const validTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'UL', 'OL', 'PRE', 'LI'];

    const getBlockParent = (node) => {
        let current = node;
        while (current && !current.classList?.contains('ProseMirror')) {
            if (current.nodeType === 1 && validTags.includes(current.tagName)) {
                return current;
            }
            if (current.parentNode) current = current.parentNode;
            else break;
        }
        return null;
    };

    let start = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
    let end = range.endContainer.nodeType === 3 ? range.endContainer.parentNode : range.endContainer;

    let startBlock = getBlockParent(start);
    let endBlock = getBlockParent(end);

    if (startBlock && endBlock) {
        if (startBlock.tagName === 'LI') startBlock = startBlock.closest('ul, ol') || startBlock;
        if (endBlock.tagName === 'LI') endBlock = endBlock.closest('ul, ol') || endBlock;

        const newRange = document.createRange();
        newRange.setStartBefore(startBlock);
        newRange.setEndAfter(endBlock);
        sel.removeAllRanges();
        sel.addRange(newRange);
    }
}

/**
 * Apply block style using Range API (exactly like the working macro)
 */
function applyBlockStyle(className, label) {
    const sel = window.getSelection();
    if (!sel.rangeCount) {
        ui.notifications.warn(localize("MOSH.Blocks.SelectText"));
        return;
    }

    // Expand selection to full blocks
    expandSelectionToSmartBlocks(sel);

    const range = sel.getRangeAt(0);
    
    // Create wrapper div with the block class
    const wrapper = document.createElement('div');
    wrapper.className = className;

    try {
        const extracted = range.extractContents();
        
        // Check if we have content
        if (!extracted.textContent.trim() && extracted.children.length === 0) {
            const p = document.createElement('p');
            p.textContent = localize("MOSH.Blocks.Placeholder");
            wrapper.appendChild(p);
        } else {
            wrapper.appendChild(extracted);
        }
        
        range.insertNode(wrapper);
        
        // Select the inserted block
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNode(wrapper);
        sel.addRange(newRange);
        
        ui.notifications.info(`${label} ${localize("MOSH.Dialog.Inserted")}`);
    } catch (e) {
        console.error("MOSH | Insert error:", e);
        ui.notifications.error(localize("MOSH.Dialog.InsertError") + ": " + e.message);
    }
}

let currentFigureToolbar = null;
let currentTargetFigure = null;

/**
 * Show inline toolbar for figure element
 */
function showFigureToolbar(figureElement) {
    // If clicking the same figure, don't recreate toolbar
    if (currentTargetFigure === figureElement && currentFigureToolbar) {
        return;
    }
    
    // Hide existing toolbar if any
    hideFigureToolbar();
    
    currentTargetFigure = figureElement;
    
    // Add highlight to selected figure
    figureElement.classList.add('mosh-figure-selected');
    
    // Create toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'mosh-figure-toolbar';
    
    // Prevent toolbar clicks from propagating
    toolbar.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    toolbar.innerHTML = `
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${localize("MOSH.Figure.Position")}:</span>
            <button type="button" class="toolbar-btn" data-action="position" data-value="left" title="${localize("MOSH.Figure.Left")}">
                <i class="fas fa-align-left"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="position" data-value="inline" title="${localize("MOSH.Figure.Inline")}">
                <i class="fas fa-align-center"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="position" data-value="right" title="${localize("MOSH.Figure.Right")}">
                <i class="fas fa-align-right"></i>
            </button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${localize("MOSH.Figure.Size")}:</span>
            <button type="button" class="toolbar-btn" data-action="size" data-value="small" title="${localize("MOSH.Figure.Small")}">
                <i class="fas fa-compress-alt"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="size" data-value="medium" title="${localize("MOSH.Figure.Medium")}">
                <i class="fas fa-expand-alt"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="size" data-value="large" title="${localize("MOSH.Figure.Large")}">
                <i class="fas fa-arrows-alt"></i>
            </button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <span class="toolbar-label">${localize("MOSH.Figure.Style")}:</span>
            <button type="button" class="toolbar-btn" data-action="style" data-value="default" title="${localize("MOSH.Figure.Default")}">
                <i class="fas fa-square"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="style" data-value="polaroid" title="${localize("MOSH.Figure.Polaroid")}">
                <i class="fas fa-camera"></i>
            </button>
            <button type="button" class="toolbar-btn" data-action="style" data-value="screen" title="${localize("MOSH.Figure.Screen")}">
                <i class="fas fa-tv"></i>
            </button>
        </div>
        <div class="mosh-figure-toolbar-separator"></div>
        <div class="mosh-figure-toolbar-section">
            <button type="button" class="toolbar-btn toolbar-btn-danger" data-action="delete" title="${localize("MOSH.Figure.Delete")}">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    // Position toolbar above the figure
    document.body.appendChild(toolbar);
    currentFigureToolbar = toolbar;
    
    // Initial position
    requestAnimationFrame(() => {
        positionFigureToolbar(figureElement, toolbar);
    });
    
    // Highlight current settings
    updateToolbarButtons(figureElement, toolbar);
    
    // Add click handlers to buttons
    toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log('[MOSH Toolbar] Button clicked!', e.target, e.currentTarget);
            e.stopPropagation();
            e.preventDefault();
            const action = btn.dataset.action;
            const value = btn.dataset.value;
            console.log(`[MOSH Toolbar] Action: ${action}, Value: ${value}`);
            handleToolbarAction(figureElement, action, value);
        });
    });
    
    console.log(`[MOSH Toolbar] Added click handlers to ${toolbar.querySelectorAll('.toolbar-btn').length} buttons`);
}

/**
 * Position toolbar relative to figure
 */
function positionFigureToolbar(figure, toolbar) {
    const rect = figure.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    
    // Position above the figure
    let top = rect.top - toolbarRect.height - 10;
    let left = rect.left + (rect.width / 2) - (toolbarRect.width / 2);
    
    // Check if toolbar goes off top of screen
    if (top < 10) {
        top = rect.bottom + 10; // Position below instead
    }
    
    // Check if toolbar goes off left/right
    if (left < 10) left = 10;
    if (left + toolbarRect.width > window.innerWidth - 10) {
        left = window.innerWidth - toolbarRect.width - 10;
    }
    
    toolbar.style.top = `${top + window.scrollY}px`;
    toolbar.style.left = `${left}px`;
}

/**
 * Update toolbar buttons to show current state
 */
function updateToolbarButtons(figure, toolbar) {
    // Position
    const currentPosition = figure.classList.contains('float-left') ? 'left' :
                           figure.classList.contains('float-right') ? 'right' : 'inline';
    toolbar.querySelectorAll('[data-action="position"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentPosition);
    });
    
    // Size
    const currentSize = figure.classList.contains('size-small') ? 'small' :
                       figure.classList.contains('size-medium') ? 'medium' :
                       figure.classList.contains('size-large') ? 'large' : 'medium';
    toolbar.querySelectorAll('[data-action="size"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentSize);
    });
    
    // Style
    const currentStyle = figure.classList.contains('style-polaroid') ? 'polaroid' :
                        figure.classList.contains('style-screen') ? 'screen' : 'default';
    toolbar.querySelectorAll('[data-action="style"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentStyle);
    });
}

/**
 * Handle toolbar button actions
 */
function handleToolbarAction(figure, action, value) {
    console.log(`[MOSH Toolbar] handleToolbarAction called: ${action} = ${value}`);
    console.log(`[MOSH Toolbar] Figure before:`, figure.className);
    
    if (action === 'delete') {
        if (confirm(localize("MOSH.Figure.DeleteConfirm") || "Delete this image?")) {
            figure.remove();
            hideFigureToolbar();
            ui.notifications.info(localize("MOSH.Figure.Deleted"));
        }
        return;
    }
    
    // Build new class list
    let classes = ['mosh-figure'];
    let currentPosition = 'inline';
    let currentSize = 'medium';
    let currentStyle = 'default';
    
    // Get current values
    if (figure.classList.contains('float-left')) currentPosition = 'left';
    else if (figure.classList.contains('float-right')) currentPosition = 'right';
    
    if (figure.classList.contains('size-small')) currentSize = 'small';
    else if (figure.classList.contains('size-medium')) currentSize = 'medium';
    else if (figure.classList.contains('size-large')) currentSize = 'large';
    
    if (figure.classList.contains('style-polaroid')) currentStyle = 'polaroid';
    else if (figure.classList.contains('style-screen')) currentStyle = 'screen';
    
    // Apply change
    if (action === 'position') {
        currentPosition = value;
        console.log(`[MOSH Toolbar] New position: ${currentPosition}`);
    } else if (action === 'size') {
        currentSize = value;
        console.log(`[MOSH Toolbar] New size: ${currentSize}`);
    } else if (action === 'style') {
        currentStyle = value;
        console.log(`[MOSH Toolbar] New style: ${currentStyle}`);
    }
    
    // Build class string
    if (currentPosition !== 'inline') {
        classes.push(`float-${currentPosition}`);
    }
    classes.push(`size-${currentSize}`);
    if (currentStyle !== 'default') {
        classes.push(`style-${currentStyle}`);
    }
    
    // Check if selected
    if (figure.classList.contains('mosh-figure-selected')) {
        classes.push('mosh-figure-selected');
    }
    
    // Apply new classes
    const newClassName = classes.join(' ');
    console.log(`[MOSH Toolbar] Setting className to: "${newClassName}"`);
    figure.className = newClassName;
    
    console.log(`[MOSH Toolbar] Figure after:`, figure.className);
    
    // Force a re-render by touching the figure
    figure.setAttribute('data-mosh-updated', Date.now().toString());
    
    // Trigger input event to notify ProseMirror of changes
    const editor = figure.closest('.ProseMirror');
    if (editor) {
        // Try multiple approaches to ensure ProseMirror notices
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        editor.dispatchEvent(inputEvent);
        
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        editor.dispatchEvent(changeEvent);
        
        console.log(`[MOSH Toolbar] Dispatched input and change events to ProseMirror`);
    }
    
    // Update toolbar buttons to show new state
    if (currentFigureToolbar) {
        updateToolbarButtons(figure, currentFigureToolbar);
    }
    
    // Reposition toolbar in case figure size changed
    setTimeout(() => {
        if (currentFigureToolbar && currentTargetFigure === figure) {
            positionFigureToolbar(figure, currentFigureToolbar);
        }
    }, 100);
}

/**
 * Hide inline toolbar
 */
function hideFigureToolbar() {
    // Remove highlight from figure
    if (currentTargetFigure) {
        currentTargetFigure.classList.remove('mosh-figure-selected');
    }
    
    if (currentFigureToolbar) {
        currentFigureToolbar.remove();
        currentFigureToolbar = null;
    }
    
    currentTargetFigure = null;
}

/**
 * Add toolbar styles
 */
export function addToolbarStyles() {
    const styleId = "mosh-toolbar-styles";
    if (document.getElementById(styleId)) {
        console.log(`${MODULE_ID} | Toolbar styles already added`);
        return;
    }
    
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
    
    console.log(`${MODULE_ID} | Toolbar styles added to DOM`);
}
