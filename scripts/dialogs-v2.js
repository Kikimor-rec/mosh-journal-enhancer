/**
 * MOSH Journal Enhancer - ApplicationV2 Dialogs
 */

import { MODULE_ID, BLOCK_TYPES, TEXT_EFFECTS } from "./config.js";
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
            width: 420,
            height: 560
        },
        classes: ["mosh-block-panel"]
    };
    
    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/block-panel.hbs`
        }
    };
    
    async _prepareContext(options) {
        const paperVariants = [
            { modifier: "", label: localize("MOSH.Effects.PaperDefault") },
            { modifier: "lined", label: localize("MOSH.Effects.PaperLined") },
            { modifier: "aged", label: localize("MOSH.Effects.PaperAged") },
            { modifier: "stained", label: localize("MOSH.Effects.PaperStained") },
            { modifier: "pinned", label: localize("MOSH.Effects.PaperPinned") }
        ];

        const blocks = Object.entries(BLOCK_TYPES)
            .filter(([k, v]) => !v.isFigure)
            .map(([type, config]) => {
                const fullClass = type === "paper" ? "mosh-block paper-note" : `mosh-block ${config.className}`;
                return {
                    type: type,
                    className: fullClass,
                    isPaper: type === "paper",
                    paperVariants,
                    label: localize(config.label),
                    preview: `<div class="${fullClass}"><p>${localize(config.label + "Placeholder")}</p></div>`
                };
            });
        
        return { 
            blocks
        };
    }
    
    _onRender(context, options) {
        const html = this.element;

        html.querySelectorAll(".mosh-paper-style-btn").forEach(button => {
            button.addEventListener("mousedown", event => event.preventDefault());
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();

                const item = button.closest(".mosh-panel-item");
                const className = item.dataset.class;
                const label = item.querySelector(".mosh-panel-label").textContent;
                const modifier = button.dataset.modifier || "";

                this.onSelectCallback({ className, label, modifier });
                this.close();
            });
        });

        // Handle block clicks
        html.querySelectorAll('.mosh-panel-item').forEach(item => {
            item.addEventListener('mousedown', (ev) => {
                ev.preventDefault();
            });
            
            item.addEventListener('click', (ev) => {
                const className = item.dataset.class;
                const type = item.dataset.type;
                const label = item.querySelector('.mosh-panel-label').textContent;

                this.onSelectCallback({ className, label, modifier: "" });
                this.close();
            });
        });
    }
}

/**
 * Text Effect Panel - separated from block insertion to keep both workflows readable.
 */
export class MoshTextEffectPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.onApplyCallback = options.onApply || (() => {});
        this.redactedPalette = options.redactedPalette || [];
    }

    static DEFAULT_OPTIONS = {
        id: "mosh-effect-panel",
        window: {
            title: "MOSH.Effects.DialogTitle",
            resizable: false
        },
        position: {
            width: 360,
            height: "auto"
        },
        classes: ["mosh-effect-panel"]
    };

    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/effect-panel.hbs`
        }
    };

    async _prepareContext(options) {
        const effects = Object.entries(TEXT_EFFECTS).map(([key, value]) => ({
            key,
            value: value.className,
            label: localize(value.label)
        }));

        return {
            effects,
            redactedPalette: this.redactedPalette,
            i18n: {
                selectEffect: localize("MOSH.Effects.SelectEffect"),
                applyInline: localize("MOSH.Effects.ApplyInline"),
                intensity: localize("MOSH.Effects.Intensity"),
                subtle: localize("MOSH.Effects.Subtle"),
                strong: localize("MOSH.Effects.Strong"),
                redactedColor: localize("MOSH.Effects.RedactedColor"),
                preview: localize("MOSH.Dialog.Preview")
            }
        };
    }

    _onRender(context, options) {
        const html = this.element;
        const effectSelect = html.querySelector(".mosh-effect-select");
        const intensityInput = html.querySelector(".mosh-effect-intensity");
        const preview = html.querySelector(".mosh-effect-preview-text");
        const applyBtn = html.querySelector(".mosh-inline-effect-btn");
        const redactedSection = html.querySelector(".mosh-redacted-color-section");
        let redactedColor = this.redactedPalette[0]?.color || "#111111";

        const updatePreview = () => {
            const className = effectSelect.value;
            preview.className = "mosh-effect-preview-text";
            if (className) preview.classList.add(className);
            preview.style.setProperty("--mosh-fx-intensity", intensityInput.value);
            preview.style.setProperty("--mosh-redacted-color", redactedColor);
            preview.dataset.moshEffectIntensity = intensityInput.value;
            preview.dataset.moshText = preview.textContent.trim();
            redactedSection.hidden = className !== "mosh-fx-redacted";
            if (className === "mosh-fx-corrupt") {
                window.dispatchEvent(new CustomEvent("mosh-journal-enhancer:apply-corruption", { detail: { root: html } }));
            }
        };

        html.querySelectorAll(".mosh-redacted-color-swatches .mosh-color-swatch").forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                redactedColor = normalizeColor(button.dataset.color) || redactedColor;
                updatePreview();
            });
        });

        effectSelect.addEventListener("change", updatePreview);
        intensityInput.addEventListener("input", updatePreview);
        updatePreview();

        applyBtn.addEventListener("click", event => {
            event.preventDefault();
            const className = effectSelect.value;
            if (!className) {
                ui.notifications.warn(localize("MOSH.Dialog.SelectType"));
                return;
            }

            const label = effectSelect.options[effectSelect.selectedIndex].text;
            this.onApplyCallback({
                className,
                label,
                intensity: intensityInput.value,
                redactedColor
            });
            this.close();
        });
    }
}

/**
 * Text Color Panel - applies inline color while offering theme-derived swatches.
 */
export class MoshTextColorPanel extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.onApplyCallback = options.onApply || (() => {});
        this.palette = options.palette || [];
    }

    static DEFAULT_OPTIONS = {
        id: "mosh-color-panel",
        window: {
            title: "MOSH.Color.DialogTitle",
            resizable: false
        },
        position: {
            width: 360,
            height: "auto"
        },
        classes: ["mosh-color-panel"]
    };

    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/color-panel.hbs`
        }
    };

    async _prepareContext(options) {
        return {
            palette: this.palette,
            i18n: {
                themeColors: localize("MOSH.Color.ThemeColors")
            }
        };
    }

    _onRender(context, options) {
        const html = this.element;

        html.querySelectorAll(".mosh-color-swatch").forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                const color = normalizeColor(button.dataset.color);
                if (!color) {
                    ui.notifications.warn(localize("MOSH.Color.InvalidColor"));
                    return;
                }
                this.onApplyCallback({ color, label: localize("MOSH.Color.TextColor") });
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

function normalizeColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return `#${color.slice(1).split("").map(char => char + char).join("")}`.toLowerCase();
    }
    return null;
}
