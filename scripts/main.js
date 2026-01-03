/**
 * MOSH Journal Enhancer
 * A Foundry VTT module for enhancing journal entries with custom blocks
 * 
 * @module mosh-journal-enhancer
 * @version 1.0.0
 * @author Kikimor
 * @license MIT
 */

import { MODULE_ID, TEMPLATES } from "./config.js";
import { registerEmbedOverrides } from "./embeds.js";
import { registerToolbarHook, addToolbarStyles, openBlockPanel } from "./toolbar.js";
import { registerBlockFormatterMacro, updateMacroIfNeeded } from "./macro.js";
import { generateBlockHTML, generateFigureHTML } from "./blocks.js";
import { log, logError } from "./utils.js";

/**
 * Module initialization
 */
Hooks.once("init", async function() {
    log("Initializing...");
    
    // Register module settings
    registerSettings();
    
    // Preload templates
    await preloadTemplates();
    
    // Register embed overrides MUST be in init hook (before documents are loaded)
    registerEmbedOverrides();
    
    log("Initialization complete");
});

/**
 * Module ready
 */
Hooks.once("ready", async function() {
    log("Module ready");
    
    // Add toolbar hook
    registerToolbarHook();
    
    // Add toolbar styles
    addToolbarStyles();
    
    // Add dialog styles
    addDialogStyles();
    
    // Register/update macro
    await registerBlockFormatterMacro();
    await updateMacroIfNeeded();
    
    // Expose API for external use
    exposeModuleAPI();
    
    log("All hooks registered");
});

/**
 * Register module settings
 */
function registerSettings() {
    // Enable/disable toolbar
    game.settings.register(MODULE_ID, "enableToolbar", {
        name: "MOSH.Settings.EnableToolbar",
        hint: "MOSH.Settings.EnableToolbarHint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
    
    // Enable/disable embed overrides
    game.settings.register(MODULE_ID, "enableEmbeds", {
        name: "MOSH.Settings.EnableEmbeds",
        hint: "MOSH.Settings.EnableEmbedsHint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
    
    log("Settings registered");
}

/**
 * Preload Handlebars templates
 */
async function preloadTemplates() {
    const templates = Object.values(TEMPLATES);
    
    try {
        await foundry.applications.handlebars.loadTemplates(templates);
        log(`Preloaded ${templates.length} templates`);
    } catch (error) {
        logError("Failed to preload templates", error);
    }
}

/**
 * Add dialog-specific styles
 */
function addDialogStyles() {
    const styleId = "mosh-dialog-styles";
    if (document.getElementById(styleId)) return;
    
    const styles = `
        /* Dialog Base Styles - ApplicationV2 */
        .mosh-dialog {
            background: var(--color-bg-option, #1a1a1a);
        }
        
        .mosh-dialog .window-content,
        .mosh-block-formatter .window-content {
            background: transparent;
            padding: 12px;
        }
        
        .mosh-block-formatter .mosh-formatter-form {
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        
        /* Tab Navigation */
        .mosh-block-formatter .tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 16px;
            border-bottom: 2px solid var(--color-border-light, #444);
            padding-bottom: 0;
        }
        
        .mosh-block-formatter .tabs .item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 10px 16px;
            color: var(--color-text-primary, #ccc);
            cursor: pointer;
            border-radius: 4px 4px 0 0;
            transition: all 0.2s;
            text-decoration: none;
            border: 1px solid var(--color-border-light, #444);
            border-bottom: none;
            margin-bottom: -2px;
            background: var(--color-bg-btn, #2a2a2a);
        }
        
        .mosh-block-formatter .tabs .item:hover {
            color: #fff;
            background: var(--color-bg-btn-hover, #3a3a3a);
        }
        
        .mosh-block-formatter .tabs .item.active {
            color: var(--color-shadow-primary, #ff6b35);
            background: var(--color-bg-option, #1a1a1a);
            border-color: var(--color-border-light, #444);
            border-bottom-color: var(--color-bg-option, #1a1a1a);
        }
        
        .mosh-block-formatter .tabs .item i {
            font-size: 14px;
        }
        
        /* Tab Content */
        .mosh-block-formatter .tab-content > .tab {
            display: none;
        }
        
        .mosh-block-formatter .tab-content > .tab.active {
            display: block;
        }
        
        /* Selection Info */
        .mosh-formatter-form .selection-info {
            margin-bottom: 16px;
            padding: 10px 12px;
            border-radius: 6px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .mosh-formatter-form .selection-info.has-selection {
            background: rgba(46, 204, 113, 0.15);
            border: 1px solid rgba(46, 204, 113, 0.3);
            color: #2ecc71;
        }
        
        .mosh-formatter-form .selection-info.no-selection {
            background: rgba(255, 193, 7, 0.15);
            border: 1px solid rgba(255, 193, 7, 0.3);
            color: #ffc107;
        }
        
        .mosh-formatter-form .selection-info i {
            flex-shrink: 0;
        }
        
        /* Preview Section */
        .mosh-formatter-form .preview-section {
            margin: 16px 0;
        }
        
        .mosh-formatter-form .preview-section > label {
            display: block;
            font-size: 12px;
            color: var(--color-text-secondary, #999);
            margin-bottom: 8px;
        }
        
        .mosh-formatter-form .preview-section > label i {
            margin-right: 4px;
        }
        
        .mosh-formatter-form .block-preview-content,
        .mosh-formatter-form .figure-result-preview {
            padding: 12px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 6px;
            background: var(--color-bg-input, #111);
            min-height: 80px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .mosh-formatter-form .preview-placeholder {
            color: var(--color-text-secondary, #666);
            font-style: italic;
            text-align: center;
            margin: 20px 0;
        }
        
        /* Figure Options */
        .mosh-formatter-form .figure-options {
            margin: 16px 0;
        }
        
        .mosh-formatter-form .figure-option-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 12px;
        }
        
        .mosh-formatter-form .figure-preview {
            width: 100%;
            height: 150px;
            border: 2px dashed var(--color-border-light, #444);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: var(--color-bg-input, #1a1a1a);
            cursor: pointer;
            transition: border-color 0.2s;
            margin-bottom: 12px;
        }
        
        .mosh-formatter-form .figure-preview:hover {
            border-color: var(--color-shadow-primary, #ff6b35);
        }
        
        .mosh-formatter-form .figure-preview-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        .mosh-formatter-form .figure-preview-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: var(--color-text-secondary, #666);
        }
        
        .mosh-formatter-form .figure-preview-placeholder i {
            font-size: 32px;
        }
        
        .mosh-formatter-form .figure-preview-placeholder small {
            font-size: 11px;
            opacity: 0.7;
        }
        
        .mosh-block-formatter .hint,
        .mosh-formatter-dialog .hint {
            font-size: 12px;
            color: var(--color-text-secondary, #999);
            margin-bottom: 12px;
        }
        
        .mosh-block-formatter .block-grid,
        .mosh-formatter-dialog .block-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-bottom: 16px;
        }
        
        .mosh-block-formatter .block-btn,
        .mosh-formatter-dialog .block-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-btn, #2a2a2a);
            color: var(--color-text-primary, #ddd);
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .mosh-block-formatter .block-btn:hover,
        .mosh-formatter-dialog .block-btn:hover {
            background: var(--color-bg-btn-hover, #3a3a3a);
            border-color: var(--color-border-highlight, #666);
        }
        
        .mosh-block-formatter .block-btn.selected,
        .mosh-formatter-dialog .block-btn.selected {
            background: var(--color-bg-option-hover, #444);
            border-color: var(--color-shadow-primary, #ff6b35);
            box-shadow: 0 0 8px rgba(255, 107, 53, 0.3);
        }
        
        .mosh-block-formatter .block-btn i,
        .mosh-formatter-dialog .block-btn i {
            font-size: 14px;
            width: 18px;
            text-align: center;
        }
        
        .mosh-block-formatter .modifier-section,
        .mosh-block-formatter .title-section,
        .mosh-formatter-dialog .modifier-section,
        .mosh-formatter-dialog .title-section {
            margin-bottom: 12px;
        }
        
        .mosh-block-formatter label,
        .mosh-formatter-dialog label {
            display: block;
            font-size: 12px;
            color: var(--color-text-secondary, #999);
            margin-bottom: 4px;
        }
        
        .mosh-block-formatter select,
        .mosh-block-formatter input[type="text"],
        .mosh-formatter-dialog select,
        .mosh-formatter-dialog input[type="text"] {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-input, #1a1a1a);
            color: var(--color-text-primary, #ddd);
        }
        
        .mosh-block-formatter .action-section,
        .mosh-formatter-dialog .action-section {
            margin-top: 16px;
        }
        
        .mosh-block-formatter .insert-btn,
        .mosh-formatter-dialog .insert-btn {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 4px;
            background: var(--color-shadow-primary, #ff6b35);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .mosh-block-formatter .insert-btn:hover,
        .mosh-formatter-dialog .insert-btn:hover {
            background: #ff8555;
            transform: translateY(-1px);
        }
        
        /* Insert Block/Figure Buttons */
        .mosh-block-formatter .insert-block-btn,
        .mosh-block-formatter .insert-figure-btn,
        .mosh-formatter-form .insert-block-btn,
        .mosh-formatter-form .insert-figure-btn {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 4px;
            background: var(--color-shadow-primary, #ff6b35);
            color: #fff;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .mosh-block-formatter .insert-block-btn:hover,
        .mosh-block-formatter .insert-figure-btn:hover,
        .mosh-formatter-form .insert-block-btn:hover,
        .mosh-formatter-form .insert-figure-btn:hover {
            background: #ff8555;
            transform: translateY(-1px);
        }
        
        .mosh-formatter-form .insert-block-btn:disabled,
        .mosh-formatter-form .insert-figure-btn:disabled {
            background: var(--color-bg-btn, #2a2a2a);
            color: var(--color-text-secondary, #666);
            cursor: not-allowed;
            transform: none;
        }

        /* Figure Picker Dialog */
        .mosh-figure-picker {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .mosh-figure-picker .figure-preview {
            width: 100%;
            height: 150px;
            border: 2px dashed var(--color-border-light, #444);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: var(--color-bg-input, #1a1a1a);
        }
        
        .mosh-figure-picker .preview-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }
        
        .mosh-figure-picker .preview-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: var(--color-text-secondary, #666);
        }
        
        .mosh-figure-picker .preview-placeholder i {
            font-size: 32px;
        }
        
        .mosh-figure-picker .figure-path-group {
            display: flex;
            gap: 8px;
        }
        
        .mosh-figure-picker .figure-image-path {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-input, #1a1a1a);
            color: var(--color-text-primary, #ddd);
        }
        
        .mosh-figure-picker .figure-browse-btn {
            padding: 8px 16px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-btn, #2a2a2a);
            color: var(--color-text-primary, #ddd);
            cursor: pointer;
        }
        
        .mosh-figure-picker .figure-browse-btn:hover {
            background: var(--color-bg-btn-hover, #3a3a3a);
        }
        
        .mosh-figure-picker .figure-option-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .mosh-figure-picker .figure-option-group label {
            font-size: 12px;
            color: var(--color-text-secondary, #999);
        }
        
        .mosh-figure-picker .figure-option-group select,
        .mosh-figure-picker .figure-option-group input {
            padding: 8px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-input, #1a1a1a);
            color: var(--color-text-primary, #ddd);
        }
        
        /* New formatter form figure controls */
        .mosh-formatter-form .figure-path-group {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        .mosh-formatter-form .figure-image-path {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-input, #1a1a1a);
            color: var(--color-text-primary, #ddd);
        }
        
        .mosh-formatter-form .figure-browse-btn {
            padding: 8px 16px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-btn, #2a2a2a);
            color: var(--color-text-primary, #ddd);
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .mosh-formatter-form .figure-browse-btn:hover {
            background: var(--color-bg-btn-hover, #3a3a3a);
            border-color: var(--color-shadow-primary, #ff6b35);
        }
        
        .mosh-formatter-form .figure-option-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .mosh-formatter-form .figure-option-group label {
            font-size: 12px;
            color: var(--color-text-secondary, #999);
        }
        
        .mosh-formatter-form .figure-option-group select,
        .mosh-formatter-form .figure-option-group input {
            padding: 8px;
            border: 1px solid var(--color-border-light, #444);
            border-radius: 4px;
            background: var(--color-bg-input, #1a1a1a);
            color: var(--color-text-primary, #ddd);
        }

        /* Light theme support */
        body.theme-light .mosh-dialog {
            background: var(--color-bg-option, #f0f0f0);
        }
        
        body.theme-light .mosh-formatter-dialog .block-btn {
            background: var(--color-bg-btn, #fff);
            border-color: var(--color-border-light, #ccc);
            color: var(--color-text-primary, #333);
        }
        
        body.theme-light .mosh-figure-picker .figure-preview {
            background: var(--color-bg-input, #fff);
            border-color: var(--color-border-light, #ccc);
        }
        
        body.theme-light .mosh-formatter-form .block-preview-content,
        body.theme-light .mosh-formatter-form .figure-result-preview {
            background: var(--color-bg-input, #f5f5f5);
            border-color: var(--color-border-light, #ccc);
        }
        
        body.theme-light .mosh-formatter-form .figure-preview {
            background: var(--color-bg-input, #f5f5f5);
            border-color: var(--color-border-light, #ccc);
        }
        
        body.theme-light .mosh-block-formatter .tabs .item.active {
            background: var(--color-bg-option, #f0f0f0);
            border-bottom-color: var(--color-bg-option, #f0f0f0);
        }
        
        /* MOSH Block Styles - Mothership/Sci-Fi Theme */
        
        /* Narrative - Atmospheric storytelling */
        .narrative-box {
            position: relative;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
            border-left: 6px solid #f2ea79;
            padding: 20px 24px 20px 28px;
            margin: 20px 0;
            font-style: italic;
            color: #d4d4d4;
            box-shadow: 
                0 4px 16px rgba(0,0,0,0.5),
                inset 0 0 20px rgba(242,234,121,0.05);
            font-size: 1.05em;
            line-height: 1.6;
        }
        .narrative-box::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 6px;
            background: linear-gradient(180deg, #f2ea79 0%, transparent 100%);
        }
        
        /* Quote - Radio/Comms style */
        .mosh-quote {
            position: relative;
            background: #0d0d0d;
            border: 2px solid #ff6b35;
            border-left: 6px solid #ff6b35;
            padding: 16px 20px;
            margin: 20px 0;
            font-family: 'Share Tech Mono', 'Courier New', monospace;
            color: #ffaa77;
            box-shadow: 
                0 0 20px rgba(255,107,53,0.3),
                inset 0 0 30px rgba(255,107,53,0.05);
        }
        .mosh-quote::before {
            content: "〉";
            position: absolute;
            left: 6px;
            top: 12px;
            font-size: 24px;
            color: #ff6b35;
            opacity: 0.6;
        }
        
        /* Terminal - Computer output */
        .terminal-block {
            position: relative;
            background: #000000;
            border: 3px solid #00ff00;
            padding: 20px 24px;
            margin: 20px 0;
            font-family: 'Share Tech Mono', 'Courier New', monospace;
            color: #00ff00;
            box-shadow: 
                0 0 30px rgba(0,255,0,0.4),
                inset 0 0 40px rgba(0,255,0,0.1);
            text-shadow: 0 0 5px rgba(0,255,0,0.7);
        }
        .terminal-block::before {
            content: ">";
            position: absolute;
            left: 8px;
            top: 16px;
            font-size: 20px;
            animation: terminal-blink 1s infinite;
        }
        @keyframes terminal-blink {
            0%, 49% { opacity: 1; }
            50%, 100% { opacity: 0.3; }
        }
        
        /* Handout - Paper documents */
        .handout-block {
            position: relative;
            background: 
                linear-gradient(0deg, transparent 0%, rgba(0,0,0,0.02) 50%, transparent 100%),
                #f5e6d3;
            border: 1px solid #8b7355;
            border-top: 3px solid #8b7355;
            padding: 20px 24px;
            margin: 20px 0;
            color: #2d2424;
            box-shadow: 
                0 8px 16px rgba(0,0,0,0.3),
                inset 0 0 100px rgba(139,115,85,0.1);
            font-family: 'Special Elite', 'Courier New', serif;
        }
        .handout-block::after {
            content: "";
            position: absolute;
            top: 0;
            right: 0;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, transparent 50%, rgba(139,115,85,0.2) 50%);
            pointer-events: none;
        }
        
        /* Navigation - Location links */
        .navigation-block {
            position: relative;
            background: 
                linear-gradient(90deg, #1a1a1a 0%, #2d2d2d 100%);
            border: 2px solid #f2ea79;
            border-left: 6px solid #f2ea79;
            padding: 16px 20px 16px 24px;
            margin: 20px 0;
            color: #f2ea79;
            font-family: 'Share Tech Mono', monospace;
            box-shadow: 
                0 0 20px rgba(242,234,121,0.2),
                inset 0 0 30px rgba(242,234,121,0.05);
            text-transform: uppercase;
            letter-spacing: 1px;
            font-size: 0.95em;
        }
        .navigation-block::before {
            content: "⟪";
            position: absolute;
            left: 6px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 20px;
            opacity: 0.7;
        }
        
        /* Warden - GM notes */
        .warden-block {
            position: relative;
            background: 
                linear-gradient(135deg, #1a0f0f 0%, #2d1b1b 100%);
            border-left: 6px solid #ff4444;
            border-right: 2px solid rgba(255,68,68,0.3);
            padding: 18px 24px 18px 28px;
            margin: 20px 0;
            color: #ffcccc;
            font-style: italic;
            box-shadow: 
                0 4px 16px rgba(255,68,68,0.2),
                inset 0 0 30px rgba(255,68,68,0.05);
            font-size: 0.95em;
        }
        .warden-block::before {
            content: "⚠";
            position: absolute;
            left: 8px;
            top: 16px;
            font-size: 18px;
            opacity: 0.5;
        }
        
        /* Info - Rules/Mechanics */
        .info-block {
            position: relative;
            background: 
                linear-gradient(135deg, #0f1a1a 0%, #1b2d2d 100%);
            border-left: 6px solid #44aaff;
            border-right: 2px solid rgba(68,170,255,0.3);
            padding: 18px 24px 18px 28px;
            margin: 20px 0;
            color: #ccddff;
            box-shadow: 
                0 4px 16px rgba(68,170,255,0.2),
                inset 0 0 30px rgba(68,170,255,0.05);
        }
        .info-block::before {
            content: "ⓘ";
            position: absolute;
            left: 8px;
            top: 16px;
            font-size: 18px;
            opacity: 0.6;
        }
        
        /* Figure/Image blocks */
        .mosh-figure {
            text-align: center;
            border: 3px solid #444;
            padding: 10px;
            background: #1a1a1a;
            transition: border-color 0.2s, box-shadow 0.2s, max-width 0.3s ease;
            position: relative;
        }
        
        /* Only editor figures are clickable */
        .ProseMirror .mosh-figure {
            cursor: pointer;
        }
        
        .ProseMirror .mosh-figure:hover {
            border-color: #666;
        }
        
        /* Selected figure highlight */
        .mosh-figure.mosh-figure-selected {
            border-color: #f2ea79;
            box-shadow: 0 0 0 2px rgba(242, 234, 121, 0.3);
        }
        
        /* Inline figures (no float) - centered, full width */
        .mosh-figure:not(.float-left):not(.float-right) {
            clear: both;
            margin: 20px auto;
            max-width: 90%;
            display: block;
        }
        
        .mosh-figure img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        
        .mosh-figure figcaption {
            margin-top: 10px;
            font-style: italic;
            color: #aaa;
            font-size: 0.9em;
        }
        
        /* Figure sizes */
        .mosh-figure.size-small {
            max-width: 250px !important;
        }
        
        .mosh-figure.size-medium {
            max-width: 400px !important;
        }
        
        .mosh-figure.size-large {
            max-width: 600px !important;
        }
        
        /* For inline (non-float) figures, allow larger sizes */
        .mosh-figure:not(.float-left):not(.float-right).size-large {
            max-width: 90% !important;
        }
        
        /* Float positions */
        .mosh-figure.float-left {
            float: left;
            margin: 10px 20px 10px 0;
            clear: none;
        }
        
        .mosh-figure.float-right {
            float: right;
            margin: 10px 0 10px 20px;
            clear: none;
        }
        
        /* Ensure journal content allows floating */
        .journal-entry-content,
        .journal-entry-page .editor-content,
        .ProseMirror {
            overflow: visible;
        }
        
        /* Clear floats after paragraphs with floated figures */
        .journal-entry-content::after,
        .journal-entry-page .editor-content::after,
        .ProseMirror::after {
            content: "";
            display: table;
            clear: both;
        }
        
        /* Figure styles */
        .mosh-figure.style-polaroid {
            background: #f5f5f5;
            border: none;
            padding: 15px 15px 50px 15px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            transform: rotate(-1deg);
        }
        
        .mosh-figure.style-polaroid figcaption {
            color: #333;
            margin-top: 20px;
            font-family: 'Courier New', monospace;
        }
        
        .mosh-figure.style-screen {
            background: #000;
            border: 3px solid #00ff00;
            padding: 5px;
            box-shadow: 
                0 0 10px rgba(0,255,0,0.3),
                inset 0 0 10px rgba(0,255,0,0.1);
        }
        
        .mosh-figure.style-screen::before {
            content: "[ DISPLAY ]";
            display: block;
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            text-align: center;
            margin-bottom: 5px;
            letter-spacing: 2px;
        }
        
        .mosh-figure.style-screen figcaption {
            color: #00ff00;
            font-family: monospace;
        }
        
        /* Block panel styles */
        .mosh-panel-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            max-height: 500px;
            overflow-y: auto;
            background: #111;
        }
        .mosh-panel-item {
            border: 1px solid #444;
            background: #1a1a1a;
            cursor: pointer;
            padding: 8px;
            border-radius: 4px;
            transition: border-color 0.2s, background 0.2s;
        }
        .mosh-panel-item:hover {
            border-color: #f2ea79;
            background: #2a2a2a;
        }
        .mosh-panel-label {
            font-family: 'Oswald', sans-serif;
            color: #888;
            font-size: 11px;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: bold;
        }
        .mosh-panel-preview {
            font-size: 11px !important;
            line-height: 1.3;
            pointer-events: none;
            max-height: 60px;
            overflow: hidden;
        }
        .mosh-panel-preview > div,
        .mosh-panel-preview > blockquote {
            margin: 0 !important;
            padding: 6px !important;
            font-size: 10px !important;
        }
        .mosh-panel-preview p {
            margin: 0 !important;
        }
        
        /* Inline figure toolbar */
        .mosh-figure-toolbar {
            position: fixed;
            z-index: 100000;
            background: #1a1a1a;
            border: 2px solid #f2ea79;
            border-radius: 6px;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 
                0 4px 12px rgba(0, 0, 0, 0.8),
                0 0 0 1px rgba(242, 234, 121, 0.2);
            animation: toolbarFadeIn 0.15s ease-out;
            pointer-events: auto;
            user-select: none;
        }
        
        @keyframes toolbarFadeIn {
            from { 
                opacity: 0; 
                transform: translateY(-8px) scale(0.95);
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scale(1);
            }
        }
        
        .mosh-figure-toolbar-section {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .mosh-figure-toolbar-separator {
            width: 1px;
            height: 24px;
            background: #444;
            margin: 0 4px;
        }
        
        .mosh-figure-toolbar .toolbar-label {
            font-size: 11px;
            color: #888;
            margin-right: 4px;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .mosh-figure-toolbar .toolbar-btn {
            width: 34px;
            height: 34px;
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            color: #aaa;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            flex-shrink: 0;
        }
        
        .mosh-figure-toolbar .toolbar-btn:hover {
            background: #3a3a3a;
            border-color: #f2ea79;
            color: #f2ea79;
            transform: translateY(-1px);
        }
        
        .mosh-figure-toolbar .toolbar-btn:active {
            transform: translateY(0);
        }
        
        .mosh-figure-toolbar .toolbar-btn.active {
            background: #f2ea79;
            border-color: #f2ea79;
            color: #000;
            font-weight: bold;
        }
        
        .mosh-figure-toolbar .toolbar-btn.active:hover {
            background: #fff;
            border-color: #fff;
        }
        
        .mosh-figure-toolbar .toolbar-btn-danger:hover {
            background: #d9534f;
            border-color: #d9534f;
            color: #fff;
        }
        
        .mosh-figure-toolbar .toolbar-btn i {
            pointer-events: none;
        }
        
        /* Figure dialog styles */
        .mosh-figure-dialog-app .window-content {
            padding: 0;
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .mosh-figure-dialog {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 16px;
            background: #1a1a1a;
            flex: 1;
            overflow-y: auto;
        }
        .mosh-figure-dialog .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .mosh-figure-dialog .form-group.button-row {
            flex-direction: row;
            gap: 12px;
            position: sticky;
            bottom: 0;
            background: #1a1a1a;
            padding: 16px;
            margin: 0 -16px -16px -16px;
            border-top: 1px solid #444;
            z-index: 10;
        }
        .mosh-figure-dialog label {
            font-weight: bold;
            color: #f2ea79;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .mosh-figure-dialog input[type="text"],
        .mosh-figure-dialog select {
            padding: 8px 12px;
            background: #0a0a0a;
            border: 1px solid #444;
            color: #ddd;
            border-radius: 4px;
        }
        .mosh-figure-dialog .image-select {
            display: flex;
            gap: 8px;
        }
        .mosh-figure-dialog .image-select input {
            flex: 1;
        }
        .mosh-figure-dialog .image-select button,
        .mosh-figure-dialog .button-row button {
            padding: 8px 16px;
            background: #2d2d2d;
            border: 1px solid #f2ea79;
            color: #f2ea79;
            cursor: pointer;
            border-radius: 4px;
            white-space: nowrap;
            flex: 1;
        }
        .mosh-figure-dialog .image-select button:hover,
        .mosh-figure-dialog .button-row button:hover {
            background: #3d3d3d;
        }
        .mosh-figure-dialog .insert-btn {
            background: #2d6d2d !important;
            border-color: #4caf50 !important;
            color: #fff !important;
        }
        .mosh-figure-dialog .insert-btn:hover {
            background: #3d7d3d !important;
        }
        .mosh-figure-dialog .cancel-btn {
            border-color: #666 !important;
            color: #fff !important;
        }
        .mosh-figure-preview {
            border: 2px solid #444;
            padding: 16px;
            background: #0a0a0a;
            border-radius: 4px;
            min-height: 150px;
            max-height: 250px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .mosh-figure-preview img {
            max-width: 100%;
            max-height: 220px;
            object-fit: contain;
        }
        .mosh-figure-preview .placeholder {
            color: #666;
            font-style: italic;
        }
    `;
    
    const styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
}

/**
 * Expose module API for external use
 */
function exposeModuleAPI() {
    const module = game.modules.get(MODULE_ID);
    if (!module) return;
    
    module.api = {
        // Panel function (used by macro and toolbar)
        openBlockPanel,
        
        // Block generation
        generateBlockHTML,
        generateFigureHTML,
        
        // Version
        version: "2.3.0"
    };
    
    // Also expose on globalThis for macro compatibility
    globalThis.MoshJournalEnhancer = module.api;
    
    log("API exposed");
}
