/**
 * MOSH Journal Enhancer - ApplicationV2 Dialogs
 */

import { MODULE_ID, BLOCK_TYPES, TEXT_EFFECTS, FIGURE_OPTIONS } from "./config.js";
import { buildFigureClassList, buildFigureStyleText, localize, log, logError, normalizeFigureSettings, parseFigureSettings } from "./utils.js";

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
            resizable: true
        },
        position: {
            width: 420,
            height: 520
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
        const { editor = null, pmView = null, onInsert = null, ...appOptions } = options;
        super(appOptions);
        this.insertRange = insertRange;
        this.editor = editor;
        this.pmView = pmView;
        this.onInsert = onInsert;
        this.existingFigure = existingFigure; // For edit mode
        this.isEditMode = !!existingFigure;
        
        // Initialize settings
        this.figureSettings = normalizeFigureSettings(initialSettings || (existingFigure ? parseFigureSettings(existingFigure) : {
            path: "",
            position: "",
            size: "medium",
            style: "",
            caption: "",
            accentColor: "",
            photoEffect: "",
            intensity: "default"
        }));
    }
    
    static DEFAULT_OPTIONS = {
        id: "mosh-figure-dialog",
        window: {
            title: "MOSH.Figure.DialogTitle",
            resizable: true
        },
        position: {
            width: 880,
            height: 680
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
            isEditMode: this.isEditMode,
            positions: localizeFigureOptions(FIGURE_OPTIONS.positions),
            sizes: localizeFigureOptions(FIGURE_OPTIONS.sizes),
            styles: localizeFigureOptions(FIGURE_OPTIONS.styles),
            accentColors: localizeFigureOptions(FIGURE_OPTIONS.accentColors),
            photoEffects: localizeFigureOptions(FIGURE_OPTIONS.photoEffects),
            intensities: localizeFigureOptions(FIGURE_OPTIONS.intensities)
        };
    }
    
    _onRender(context, options) {
        const html = this.element;
        
        const pathInput = html.querySelector('.figure-path');
        const pathStatus = html.querySelector('.figure-path-status');
        const browseBtn = html.querySelector('.browse-btn');
        const positionSelect = html.querySelector('.figure-position');
        const sizeSelect = html.querySelector('.figure-size');
        const styleSelect = html.querySelector('.figure-style');
        const accentSection = html.querySelector('.figure-accent-section');
        const accentPicker = html.querySelector('.figure-accent-picker');
        const accentHexInput = html.querySelector('.figure-accent-hex');
        const photoSection = html.querySelector('.figure-photo-section');
        const intensitySection = html.querySelector('.figure-intensity-section');
        const photoSelect = html.querySelector('.figure-photo-effect');
        const intensitySelect = html.querySelector('.figure-intensity');
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
        if (this.figureSettings.photoEffect) {
            photoSelect.value = this.figureSettings.photoEffect;
        }
        if (this.figureSettings.intensity) {
            intensitySelect.value = this.figureSettings.intensity;
        }
        if (this.figureSettings.caption) {
            captionInput.value = this.figureSettings.caption;
        }
        
        // Update button text for edit mode
        if (this.isEditMode) {
            insertBtn.textContent = localize("MOSH.Figure.Update");
        }
        
        const updatePreview = () => {
            this.figureSettings = normalizeFigureSettings(this.figureSettings);
            accentSection.hidden = !usesFigureAccent(this.figureSettings.style);
            photoSection.hidden = !usesFigurePhotoEffect(this.figureSettings.style);
            intensitySection.hidden = !this.figureSettings.style;
            pathStatus.classList.remove("valid", "error");

            const activeColor = normalizeColor(this.figureSettings.accentColor) || "#00ff41";
            accentPicker.value = activeColor;
            accentHexInput.value = activeColor.toUpperCase();

            html.querySelectorAll(".figure-accent-swatch").forEach(button => {
                button.classList.toggle("active", button.dataset.color?.toLowerCase() === this.figureSettings.accentColor);
            });

            if (!this.figureSettings.path) {
                pathStatus.textContent = localize("MOSH.Figure.NoImage");
                preview.replaceChildren(createPlaceholder(localize("MOSH.Figure.NoImage")));
                return;
            }

            pathStatus.textContent = this.figureSettings.path;
            pathStatus.classList.add("valid");
            preview.replaceChildren(createFigurePreviewElement(this.figureSettings, {
                onLoad: () => {
                    pathStatus.textContent = this.figureSettings.path;
                    pathStatus.classList.remove("error");
                    pathStatus.classList.add("valid");
                },
                onError: () => {
                    pathStatus.textContent = `${localize("MOSH.Dialog.InsertError")}: ${this.figureSettings.path}`;
                    pathStatus.classList.remove("valid");
                    pathStatus.classList.add("error");
                }
            }));
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
            this.figureSettings = normalizeFigureSettings({
                ...this.figureSettings,
                photoEffect: usesFigurePhotoEffect(styleSelect.value) ? this.figureSettings.photoEffect : ""
            });
            photoSelect.value = this.figureSettings.photoEffect;
            intensitySelect.value = this.figureSettings.intensity;
            updatePreview();
        });

        html.querySelectorAll(".figure-accent-swatch").forEach(button => {
            button.addEventListener("click", () => {
                this.figureSettings.accentColor = button.dataset.color || "";
                updatePreview();
            });
        });

        accentPicker.addEventListener('input', () => {
            this.figureSettings.accentColor = accentPicker.value;
            updatePreview();
        });

        accentHexInput.addEventListener('input', () => {
            const color = normalizeColor(accentHexInput.value);
            if (!color) {
                accentHexInput.classList.add("invalid");
                return;
            }

            accentHexInput.classList.remove("invalid");
            this.figureSettings.accentColor = color;
            updatePreview();
        });

        photoSelect.addEventListener('change', () => {
            this.figureSettings.photoEffect = photoSelect.value;
            updatePreview();
        });

        intensitySelect.addEventListener('change', () => {
            this.figureSettings.intensity = intensitySelect.value;
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
            
            const success = this.isEditMode ? this.updateFigure() : this.insertFigure();
            if (success) this.close();
        });
        
        // Cancel button
        cancelBtn.addEventListener('click', () => {
            this.close();
        });
    }
    
    insertFigure() {
        try {
            if (this.onInsert) {
                return !!this.onInsert({ ...this.figureSettings }, {
                    editor: this.editor,
                    range: this.insertRange,
                    pmView: this.pmView
                });
            }

            const api = game.modules.get(MODULE_ID)?.api;
            if (!api?.insertFigure) throw new Error("MOSH insertFigure API is not available");
            return !!api.insertFigure({ ...this.figureSettings }, {
                editor: this.editor,
                range: this.insertRange,
                pmView: this.pmView
            });
        } catch (error) {
            logError("Figure insert failed", error);
            ui.notifications.error(`${localize("MOSH.Dialog.InsertError")}: ${error.message}`);
            return false;
        }
    }
    
    updateFigure() {
        log("Updating existing figure");
        
        if (!this.existingFigure) {
            logError("No existing figure to update");
            return false;
        }
        
        const normalized = normalizeFigureSettings(this.figureSettings);
        this.existingFigure.className = buildFigureClassList(normalized).join(" ");
        const styleText = buildFigureStyleText(normalized);
        if (styleText) this.existingFigure.setAttribute("style", styleText);
        else this.existingFigure.removeAttribute("style");
        
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
        return true;
    }
}

function createPlaceholder(text) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = text;
    return placeholder;
}

function createFigurePreviewElement(settings, { onLoad = null, onError = null } = {}) {
    const figure = document.createElement("figure");
    figure.classList.add("mosh-figure");
    figure.className = buildFigureClassList(settings).join(" ");
    const styleText = buildFigureStyleText(settings);
    if (styleText) figure.setAttribute("style", styleText);

    const img = document.createElement("img");
    img.src = settings.path;
    img.alt = settings.caption || "";
    if (onLoad) img.addEventListener("load", onLoad, { once: true });
    if (onError) img.addEventListener("error", onError, { once: true });
    figure.appendChild(img);

    if (settings.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = settings.caption;
        figure.appendChild(caption);
    }

    return figure;
}

function localizeFigureOptions(options = []) {
    return options.map(option => ({
        ...option,
        label: localize(option.label)
    }));
}

function usesFigureAccent(style) {
    return style === "screen" || style === "blueprint";
}

function usesFigurePhotoEffect(style) {
    return style === "polaroid" || style === "dossier";
}

function normalizeColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return `#${color.slice(1).split("").map(char => char + char).join("")}`.toLowerCase();
    }
    return null;
}
