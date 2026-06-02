/**
 * MOSH Journal Enhancer - Utilities
 * Helper functions used across the module
 */

import { MODULE_ID } from "./config.js";

/**
 * Localize a string
 * @param {string} key - The localization key
 * @returns {string} The localized string
 */
export function localize(key) {
    return game.i18n.localize(key);
}

/**
 * Format a localized string with arguments
 * @param {string} key - The localization key
 * @param {object} data - The data to format with
 * @returns {string} The formatted string
 */
export function format(key, data) {
    return game.i18n.format(key, data);
}

/**
 * Get module setting
 * @param {string} key - The setting key
 * @returns {*} The setting value
 */
export function getSetting(key) {
    return game.settings.get(MODULE_ID, key);
}

/**
 * Set module setting
 * @param {string} key - The setting key
 * @param {*} value - The value to set
 */
export async function setSetting(key, value) {
    return game.settings.set(MODULE_ID, key, value);
}

/**
 * Expand selection to include complete block elements
 * Finds the nearest block wrapper if selection is inside one
 * @param {Selection} selection - The current selection
 * @param {HTMLElement} contentElement - The content container
 * @returns {object} Object with startNode, endNode, and blockElement if found
 */
export function expandSelectionToBlocks(selection, contentElement) {
    if (!selection || selection.rangeCount === 0) {
        return { startNode: null, endNode: null, blockElement: null };
    }
    
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    
    // If text node, get parent
    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }
    
    // Look for mosh-block parent
    let blockElement = null;
    let current = node;
    
    while (current && current !== contentElement) {
        if (current.classList && current.classList.contains("mosh-block")) {
            blockElement = current;
            break;
        }
        current = current.parentElement;
    }
    
    return {
        startNode: range.startContainer,
        endNode: range.endContainer,
        blockElement: blockElement
    };
}

/**
 * Strip HTML tags from content, preserving only text
 * @param {string} html - HTML content
 * @returns {string} Plain text content
 */
export function stripHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
}

/**
 * Sanitize HTML content
 * @param {string} html - HTML content to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    
    // Remove script tags
    const scripts = temp.querySelectorAll("script");
    scripts.forEach(s => s.remove());
    
    // Remove event handlers
    const allElements = temp.querySelectorAll("*");
    allElements.forEach(el => {
        for (const attr of [...el.attributes]) {
            if (attr.name.startsWith("on")) {
                el.removeAttribute(attr.name);
            }
        }
    });
    
    return temp.innerHTML;
}

/**
 * Escape plain text for safe HTML text/attribute insertion.
 * @param {string} value - The value to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(value = "") {
    const temp = document.createElement("div");
    temp.textContent = String(value);
    return temp.innerHTML;
}

const FIGURE_POSITIONS = new Set(["", "left", "right"]);
const FIGURE_SIZES = new Set(["small", "medium", "large"]);
const FIGURE_STYLES = new Set(["", "polaroid", "screen", "dossier", "blueprint"]);
const FIGURE_PHOTO_EFFECTS = new Set(["", "aged", "bw", "faded"]);
const FIGURE_INTENSITIES = new Set(["subtle", "default", "strong"]);
const FIGURE_FILTER_STRENGTH = {
    subtle: "0.65",
    default: "1",
    strong: "1.35"
};
const FIGURE_DEFAULT_ACCENTS = {
    screen: "#00ff41",
    blueprint: "#37d7ff",
    dossier: "#d8b45a",
    polaroid: "#d8c8a0"
};

/**
 * Normalize figure settings used by preview, insertion, and toolbar updates.
 * @param {object} settings - Raw figure settings
 * @returns {object} Normalized figure settings
 */
export function normalizeFigureSettings(settings = {}) {
    const style = FIGURE_STYLES.has(settings.style) ? settings.style : "";
    const intensity = FIGURE_INTENSITIES.has(settings.intensity) ? settings.intensity : "default";
    const photoEffect = FIGURE_PHOTO_EFFECTS.has(settings.photoEffect) ? settings.photoEffect : "";
    return {
        path: String(settings.path || ""),
        caption: String(settings.caption || ""),
        position: FIGURE_POSITIONS.has(settings.position) ? settings.position : "",
        size: FIGURE_SIZES.has(settings.size) ? settings.size : "medium",
        style,
        accentColor: normalizeFigureColor(settings.accentColor) || FIGURE_DEFAULT_ACCENTS[style] || "",
        photoEffect,
        intensity,
        filterStrength: FIGURE_FILTER_STRENGTH[intensity] || FIGURE_FILTER_STRENGTH.default
    };
}

/**
 * Build the persisted figure class list.
 * @param {object} settings - Raw figure settings
 * @returns {string[]} Figure CSS classes
 */
export function buildFigureClassList(settings = {}) {
    const normalized = normalizeFigureSettings(settings);
    const classes = ["mosh-figure"];
    if (normalized.position) classes.push(`float-${normalized.position}`);
    classes.push(`size-${normalized.size}`);
    if (normalized.style) classes.push(`style-${normalized.style}`);
    if ((normalized.style === "polaroid" || normalized.style === "dossier") && normalized.photoEffect) {
        classes.push(`photo-${normalized.photoEffect}`);
    }
    return classes;
}

/**
 * Build persisted CSS variables for a figure.
 * @param {object} settings - Raw figure settings
 * @returns {string} Inline style text
 */
export function buildFigureStyleText(settings = {}) {
    const normalized = normalizeFigureSettings(settings);
    if (!normalized.style) return "";

    const styles = [`--mosh-figure-filter-strength: ${normalized.filterStrength}`];
    if (normalized.accentColor) styles.unshift(`--mosh-figure-accent: ${normalized.accentColor}`);
    return styles.join("; ");
}

/**
 * Build a persisted figure HTML string.
 * @param {object} settings - Raw figure settings
 * @param {object} options - Extra attributes
 * @returns {string} Figure HTML
 */
export function buildFigureHTML(settings = {}, { marker = "" } = {}) {
    const normalized = normalizeFigureSettings(settings);
    const classes = buildFigureClassList(normalized).map(escapeHtml).join(" ");
    const styleText = buildFigureStyleText(normalized);
    const markerAttr = marker ? ` data-mosh-figure-id="${escapeHtml(marker)}"` : "";
    const styleAttr = styleText ? ` style="${escapeHtml(styleText)}"` : "";

    let html = `<figure class="${classes}"${markerAttr}${styleAttr}>`;
    html += `<img src="${escapeHtml(normalized.path)}" alt="${escapeHtml(normalized.caption)}" loading="lazy">`;
    if (normalized.caption) html += `<figcaption>${escapeHtml(normalized.caption)}</figcaption>`;
    html += "</figure>";
    return html;
}

/**
 * Parse existing figure settings from a rendered figure element.
 * @param {HTMLElement} figure - Figure element
 * @returns {object} Normalized figure settings
 */
export function parseFigureSettings(figure) {
    const classList = figure?.classList;
    const img = figure?.querySelector?.("img");
    const style = classList?.contains("style-polaroid") ? "polaroid"
        : classList?.contains("style-screen") ? "screen"
            : classList?.contains("style-dossier") ? "dossier"
                : classList?.contains("style-blueprint") ? "blueprint"
                    : "";
    const photoEffect = classList?.contains("photo-aged") ? "aged"
        : classList?.contains("photo-bw") ? "bw"
            : classList?.contains("photo-faded") ? "faded"
                : "";
    const strength = figure?.style?.getPropertyValue("--mosh-figure-filter-strength")?.trim();
    const intensity = strength === FIGURE_FILTER_STRENGTH.subtle ? "subtle"
        : strength === FIGURE_FILTER_STRENGTH.strong ? "strong"
            : "default";

    return normalizeFigureSettings({
        path: img?.getAttribute("src") || "",
        caption: figure?.querySelector?.("figcaption")?.textContent?.trim() || img?.getAttribute("alt") || "",
        position: classList?.contains("float-left") ? "left" : classList?.contains("float-right") ? "right" : "",
        size: classList?.contains("size-small") ? "small" : classList?.contains("size-large") ? "large" : "medium",
        style,
        accentColor: figure?.style?.getPropertyValue("--mosh-figure-accent")?.trim() || "",
        photoEffect,
        intensity
    });
}

function normalizeFigureColor(value = "") {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        return `#${color.slice(1).split("").map(char => char + char).join("")}`.toLowerCase();
    }
    return "";
}

/**
 * Check whether Monk's Enhanced Journal is active.
 * @returns {boolean}
 */
export function isMonksEnhancedJournalActive() {
    return game.modules.get("monks-enhanced-journal")?.active === true;
}

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} A unique ID
 */
export function generateId(prefix = "mosh") {
    return `${prefix}-${foundry.utils.randomID(8)}`;
}

/**
 * Debounce a function
 * @param {Function} fn - The function to debounce
 * @param {number} delay - The delay in milliseconds
 * @returns {Function} The debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Check if the current system is Mothership
 * @returns {boolean} True if Mothership system
 */
export function isMothershipSystem() {
    return game.system.id === "mosh";
}

/**
 * Get current theme (dark or light)
 * @returns {string} "dark" or "light"
 */
export function getCurrentTheme() {
    return document.body.classList.contains("theme-light") ? "light" : "dark";
}

/**
 * Log a message to console with module prefix
 * @param {string} message - The message to log
 * @param {*} data - Optional data to log
 */
export function log(message, data = null) {
    if (game.ready && game.settings.settings.has(`${MODULE_ID}.debugLogging`) && !getSetting("debugLogging")) {
        return;
    }

    if (data !== null && data !== undefined) {
        console.log(`${MODULE_ID} | ${message}`, data);
    } else {
        console.log(`${MODULE_ID} | ${message}`);
    }
}

/**
 * Log an error to console with module prefix
 * @param {string} message - The error message
 * @param {Error} error - Optional error object
 */
export function logError(message, error = null) {
    if (error) {
        console.error(`${MODULE_ID} | ${message}`, error);
    } else {
        console.error(`${MODULE_ID} | ${message}`);
    }
}
