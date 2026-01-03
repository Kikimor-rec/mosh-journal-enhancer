/**
 * MOSH Journal Enhancer - Block Generator
 * Functions for generating block HTML
 */

import { BLOCK_TYPES } from "./config.js";
import { localize, sanitizeHtml } from "./utils.js";

/**
 * Generate HTML for a block
 * @param {string} type - Block type (narrative, quote, terminal, etc.)
 * @param {string} content - The content to wrap
 * @param {object} options - Additional options
 * @returns {string} The generated HTML
 */
export function generateBlockHTML(type, content = "", options = {}) {
    const blockConfig = BLOCK_TYPES[type];
    if (!blockConfig) {
        console.warn(`Unknown block type: ${type}`);
        return content;
    }
    
    // Handle figure separately
    if (blockConfig.isFigure) {
        return generateFigureHTML(content, options);
    }
    
    // For regular blocks
    const className = blockConfig.className;
    const modifier = options.modifier || "";
    const title = options.title || "";
    
    let modifierClass = modifier ? ` ${modifier}` : "";
    let html = `<div class="mosh-block ${className}${modifierClass}">`;
    
    // Add title if provided
    if (title) {
        html += `<div class="title">${sanitizeHtml(title)}</div>`;
    }
    
    // Navigation block has special structure
    if (type === "navigation" && options.exits) {
        html += generateNavigationContent(options.exits);
    } else {
        // Wrap content in paragraphs if it's plain text
        const wrappedContent = content.includes("<") ? content : `<p>${content}</p>`;
        html += wrappedContent;
    }
    
    html += "</div>";
    
    return html;
}

/**
 * Generate HTML for a figure block
 * @param {string} imageSrc - Image source URL
 * @param {object} options - Options (position, size, style, caption)
 * @returns {string} The generated HTML
 */
export function generateFigureHTML(imageSrc, options = {}) {
    const { 
        position = "", 
        size = "medium", 
        style = "", 
        caption = "" 
    } = options;
    
    // Build class list
    const classes = ["mosh-figure"];
    if (position) classes.push(position); // left, right
    if (size) classes.push(size); // small, medium, large
    if (style) classes.push(style); // polaroid, screen
    
    let html = `<figure class="${classes.join(" ")}">`;
    html += `<img src="${imageSrc}" alt="${sanitizeHtml(caption)}" loading="lazy">`;
    
    if (caption) {
        html += `<figcaption>${sanitizeHtml(caption)}</figcaption>`;
    }
    
    html += "</figure>";
    
    return html;
}

/**
 * Generate navigation block content with exits
 * @param {Array} exits - Array of exit objects {label, target}
 * @returns {string} The generated HTML
 */
function generateNavigationContent(exits) {
    if (!exits || !exits.length) {
        return `<ul class="exits"><li>${localize("MOSH.Blocks.Exits")}: ...</li></ul>`;
    }
    
    let html = '<ul class="exits">';
    
    for (const exit of exits) {
        html += "<li>";
        if (exit.target) {
            html += `@UUID[${exit.target}]{${exit.label}}`;
        } else {
            html += exit.label;
        }
        html += "</li>";
    }
    
    html += "</ul>";
    return html;
}

/**
 * Wrap selected content in a block
 * @param {string} type - Block type
 * @param {string} selectedContent - The selected content
 * @param {object} options - Additional options
 * @returns {string} The wrapped content
 */
export function wrapInBlock(type, selectedContent, options = {}) {
    // If no content, provide placeholder
    const content = selectedContent || localize("MOSH.Blocks.Placeholder");
    return generateBlockHTML(type, content, options);
}

/**
 * Parse a block element and extract its data
 * @param {HTMLElement} element - The block element
 * @returns {object} Block data (type, content, options)
 */
export function parseBlockElement(element) {
    if (!element || !element.classList.contains("mosh-block")) {
        return null;
    }
    
    // Determine block type from classes
    let type = null;
    for (const [key, config] of Object.entries(BLOCK_TYPES)) {
        if (element.classList.contains(config.className)) {
            type = key;
            break;
        }
    }
    
    if (!type) return null;
    
    // Extract content
    const contentEl = element.querySelector(".content");
    const content = contentEl ? contentEl.innerHTML : "";
    
    // Extract title if present
    const titleEl = element.querySelector(".title");
    const title = titleEl ? titleEl.textContent : "";
    
    // Check for modifiers
    const modifiers = [];
    if (element.classList.contains("torn")) modifiers.push("torn");
    if (element.classList.contains("classified")) modifiers.push("classified");
    
    return {
        type,
        content,
        title,
        modifier: modifiers.join(" ")
    };
}

/**
 * Remove block wrapper, keeping content
 * @param {HTMLElement} blockElement - The block element to unwrap
 * @returns {string} The unwrapped content
 */
export function unwrapBlock(blockElement) {
    if (!blockElement) return "";
    
    const contentEl = blockElement.querySelector(".content");
    return contentEl ? contentEl.innerHTML : blockElement.innerHTML;
}
