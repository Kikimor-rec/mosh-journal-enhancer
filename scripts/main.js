/**
 * MOSH Journal Enhancer
 * A Foundry VTT module for enhancing journal entries with custom blocks
 * 
 * @module mosh-journal-enhancer
 * @version 1.1.0
 * @author Kikimor
 * @license MIT
 */

import { MODULE_ID, MODULE_VERSION, TEMPLATES } from "./config.js";
import { registerEmbedOverrides } from "./embeds.js";
import { registerToolbarHook, addToolbarStyles, openBlockPanel, insertBlock, insertFigure } from "./toolbar.js";
import { registerBlockFormatterMacro, updateMacroIfNeeded } from "./macro.js";
import { generateBlockHTML, generateFigureHTML } from "./blocks.js";
import { registerTextEffectRuntime } from "./effects.js";
import { getSetting, isMonksEnhancedJournalActive, log, logError } from "./utils.js";

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
    if (getSetting("enableEmbeds")) {
        registerEmbedOverrides();
    } else {
        log("Embed overrides disabled by setting");
    }
    
    log("Initialization complete");
});

/**
 * Module ready
 */
Hooks.once("ready", async function() {
    log("Module ready");
    
    if (getSetting("enableToolbar")) {
        registerToolbarHook();
        addToolbarStyles();
    } else {
        log("Toolbar disabled by setting");
    }
    
    // Register/update macro
    await registerBlockFormatterMacro();
    await updateMacroIfNeeded();
    
    registerTextEffectRuntime();
    
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

    game.settings.register(MODULE_ID, "debugLogging", {
        name: "MOSH.Settings.DebugLogging",
        hint: "MOSH.Settings.DebugLoggingHint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: value => {
            log(`Debug logging ${value ? "enabled" : "disabled"}`);
        }
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
 * Expose module API for external use
 */
function exposeModuleAPI() {
    const module = game.modules.get(MODULE_ID);
    if (!module) return;
    
    module.api = {
        // Panel function (used by macro and toolbar)
        openBlockPanel,
        insertBlock,
        insertFigure,
        isMonksEnhancedJournalActive,
        
        // Block generation
        generateBlockHTML,
        generateFigureHTML,
        
        // Version
        version: MODULE_VERSION
    };
    
    // Also expose on globalThis for macro compatibility
    globalThis.MoshJournalEnhancer = module.api;
    
    log("API exposed");
}
