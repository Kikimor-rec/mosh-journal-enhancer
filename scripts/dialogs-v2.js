/**
 * MOSH Journal Enhancer - ApplicationV2 Dialogs
 */

import { MODULE_ID } from "./config.js";
import { localize, log, logError } from "./utils.js";

/**
 * Block Panel - ApplicationV2 with Handlebars
 */
export class MoshBlockPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.onSelectCallback = options.onSelect || (() => {});
    }
    
    static DEFAULT_OPTIONS = {
        id: "mosh-block-panel",
        window: {
            title: "MOSH.Dialog.Title",
            resizable: false
        },
        position: {
            width: 340,
            height: "auto"
        },
        classes: ["mosh-block-panel"]
    };
    
    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/block-panel.hbs`
        }
    };
    
    async _prepareContext(options) {
        const blocks = [
            {
                type: "narrative",
                className: "narrative-box",
                label: localize("MOSH.Blocks.Narrative"),
                preview: `<div class="narrative-box"><p>${localize("MOSH.Blocks.NarrativePlaceholder")}</p></div>`
            },
            {
                type: "quote",
                className: "mosh-quote",
                label: localize("MOSH.Blocks.Quote"),
                preview: `<blockquote class="mosh-quote"><p>${localize("MOSH.Blocks.QuotePlaceholder")}</p></blockquote>`
            },
            {
                type: "terminal",
                className: "terminal-block",
                label: localize("MOSH.Blocks.Terminal"),
                preview: `<div class="terminal-block"><p>${localize("MOSH.Blocks.TerminalPlaceholder")}</p></div>`
            },
            {
                type: "handout",
                className: "handout-block",
                label: localize("MOSH.Blocks.Handout"),
                preview: `<div class="handout-block"><p>${localize("MOSH.Blocks.HandoutPlaceholder")}</p></div>`
            },
            {
                type: "navigation",
                className: "navigation-block",
                label: localize("MOSH.Blocks.Navigation"),
                preview: `<div class="navigation-block"><p>${localize("MOSH.Blocks.NavigationPlaceholder")}</p></div>`
            },
            {
                type: "warden",
                className: "warden-block",
                label: localize("MOSH.Blocks.Warden"),
                preview: `<div class="warden-block"><p>${localize("MOSH.Blocks.WardenPlaceholder")}</p></div>`
            },
            {
                type: "info",
                className: "info-block",
                label: localize("MOSH.Blocks.Info"),
                preview: `<div class="info-block"><p>${localize("MOSH.Blocks.InfoPlaceholder")}</p></div>`
            }
        ];
        
        return { blocks };
    }
    
    _onRender(context, options) {
        const html = this.element;
        
        // Handle clicks
        html.querySelectorAll('.mosh-panel-item').forEach(item => {
            item.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
            });
            
            item.addEventListener('click', (ev) => {
                const className = item.dataset.class;
                const label = item.querySelector('.mosh-panel-label').textContent;
                
                this.onSelectCallback({ className, label });
                this.close();
            });
        });
    }
}

/**
 * Figure Dialog - ApplicationV2 with Handlebars
 */
export class MoshFigureDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor(insertRange, existingFigure = null, initialSettings = null, options = {}) {
        const { editor = null, onInsert = null, ...appOptions } = options;
        super(appOptions);
        this.insertRange = insertRange;
        this.editor = editor;
        this.onInsert = onInsert;
        this.existingFigure = existingFigure; // For edit mode
        this.isEditMode = !!existingFigure;
        
        // Initialize settings
        this.figureSettings = initialSettings || {
            path: "",
            position: "",
            size: "medium",
            style: "",
            caption: ""
        };
    }
    
    static DEFAULT_OPTIONS = {
        id: "mosh-figure-dialog",
        window: {
            title: "MOSH.Figure.DialogTitle",
            resizable: true
        },
        position: {
            width: 540,
            height: 600
        },
        classes: ["mosh-figure-dialog-app"]
    };
    
    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/figure-dialog.hbs`
        }
    };
    
    async _prepareContext(options) {
        return {
            isEditMode: this.isEditMode
        };
    }
    
    _onRender(context, options) {
        const html = this.element;
        
        const pathInput = html.querySelector('.figure-path');
        const browseBtn = html.querySelector('.browse-btn');
        const positionSelect = html.querySelector('.figure-position');
        const sizeSelect = html.querySelector('.figure-size');
        const styleSelect = html.querySelector('.figure-style');
        const captionInput = html.querySelector('.figure-caption');
        const preview = html.querySelector('.mosh-figure-preview');
        const insertBtn = html.querySelector('.insert-btn');
        const cancelBtn = html.querySelector('.cancel-btn');
        
        // Populate fields with initial settings (for edit mode)
        if (this.figureSettings.path) {
            pathInput.value = this.figureSettings.path;
        }
        if (this.figureSettings.position) {
            positionSelect.value = this.figureSettings.position;
        }
        if (this.figureSettings.size) {
            sizeSelect.value = this.figureSettings.size;
        }
        if (this.figureSettings.style) {
            styleSelect.value = this.figureSettings.style;
        }
        if (this.figureSettings.caption) {
            captionInput.value = this.figureSettings.caption;
        }
        
        // Update button text for edit mode
        if (this.isEditMode) {
            insertBtn.textContent = localize("MOSH.Figure.Update");
        }
        
        const updatePreview = () => {
            if (!this.figureSettings.path) {
                preview.replaceChildren(createPlaceholder(localize("MOSH.Figure.NoImage")));
                return;
            }
            
            preview.replaceChildren(createFigurePreviewElement(this.figureSettings));
        };
        
        // Initial preview
        updatePreview();
        
        // Browse button
        browseBtn.addEventListener('click', () => {
            const FilePickerClass = foundry.applications.apps?.FilePicker?.implementation || globalThis.FilePicker;
            const fp = new FilePickerClass({
                type: "image",
                current: this.figureSettings.path,
                callback: (path) => {
                    this.figureSettings.path = path;
                    pathInput.value = path;
                    updatePreview();
                }
            });
            fp.browse();
        });
        
        // Update settings on change
        pathInput.addEventListener('change', () => {
            this.figureSettings.path = pathInput.value;
            updatePreview();
        });
        
        positionSelect.addEventListener('change', () => {
            this.figureSettings.position = positionSelect.value;
            updatePreview();
        });
        
        sizeSelect.addEventListener('change', () => {
            this.figureSettings.size = sizeSelect.value;
            updatePreview();
        });
        
        styleSelect.addEventListener('change', () => {
            this.figureSettings.style = styleSelect.value;
            updatePreview();
        });
        
        captionInput.addEventListener('input', () => {
            this.figureSettings.caption = captionInput.value;
            updatePreview();
        });
        
        // Insert/Update button
        insertBtn.addEventListener('click', () => {
            if (!this.figureSettings.path) {
                ui.notifications.warn(localize("MOSH.Figure.SelectImage"));
                return;
            }
            
            if (this.isEditMode) {
                this.updateFigure();
            } else {
                this.insertFigure();
            }
            this.close();
        });
        
        // Cancel button
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }
    
    insertFigure() {
        try {
            if (this.onInsert) {
                this.onInsert({ ...this.figureSettings }, { editor: this.editor, range: this.insertRange });
                return;
            }

            const api = game.modules.get(MODULE_ID)?.api;
            if (!api?.insertFigure) throw new Error("MOSH insertFigure API is not available");
            api.insertFigure({ ...this.figureSettings }, { editor: this.editor, range: this.insertRange });
        } catch (error) {
            logError("Figure insert failed", error);
            ui.notifications.error(`${localize("MOSH.Dialog.InsertError")}: ${error.message}`);
        }
    }
    
    updateFigure() {
        log("Updating existing figure");
        
        if (!this.existingFigure) {
            logError("No existing figure to update");
            return;
        }
        
        // Build new class name
        let className = 'mosh-figure';
        if (this.figureSettings.position) className += ` float-${this.figureSettings.position}`;
        if (this.figureSettings.size) className += ` size-${this.figureSettings.size}`;
        if (this.figureSettings.style) className += ` style-${this.figureSettings.style}`;
        
        // Update classes
        this.existingFigure.className = className;
        
        // Update image
        const img = this.existingFigure.querySelector('img');
        if (img) {
            img.src = this.figureSettings.path;
            img.alt = this.figureSettings.caption || '';
        }
        
        // Update or create caption
        let figcaption = this.existingFigure.querySelector('figcaption');
        if (this.figureSettings.caption) {
            if (!figcaption) {
                figcaption = document.createElement('figcaption');
                this.existingFigure.appendChild(figcaption);
            }
            figcaption.textContent = this.figureSettings.caption;
        } else if (figcaption) {
            // Remove caption if empty
            figcaption.remove();
        }
        
        ui.notifications.info(`${localize("MOSH.Blocks.Figure")} ${localize("MOSH.Figure.Updated")}`);
        log("Figure updated successfully");
    }
}

function createPlaceholder(text) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = text;
    return placeholder;
}

function createFigurePreviewElement(settings) {
    const figure = document.createElement("figure");
    figure.classList.add("mosh-figure");
    if (settings.position) figure.classList.add(`float-${settings.position}`);
    if (settings.size) figure.classList.add(`size-${settings.size}`);
    if (settings.style) figure.classList.add(`style-${settings.style}`);

    const img = document.createElement("img");
    img.src = settings.path;
    img.alt = settings.caption || "";
    figure.appendChild(img);

    if (settings.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = settings.caption;
        figure.appendChild(caption);
    }

    return figure;
}
