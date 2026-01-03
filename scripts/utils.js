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
    if (data) {
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
