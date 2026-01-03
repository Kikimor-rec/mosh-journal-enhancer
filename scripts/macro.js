/**
 * MOSH Journal Enhancer - Macro Registration
 * Registers and manages the block formatter macro
 */

import { MODULE_ID } from "./config.js";
import { openBlockPanel } from "./toolbar.js";

const MACRO_NAME = "MOSH Block Formatter";
const MACRO_ICON = "icons/svg/book.svg";
const MACRO_VERSION = "1.0.0";

/**
 * Register the block formatter macro on module ready
 */
export async function registerBlockFormatterMacro() {
    // Only register for GMs
    if (!game.user.isGM) return;
    
    // Check if macro already exists
    const existingMacro = game.macros.find(m => m.name === MACRO_NAME);
    if (existingMacro) {
        console.log(`${MODULE_ID} | Macro already exists: ${MACRO_NAME}`);
        return;
    }
    
    // Create macro command - use global API instead of dynamic import
    const command = `
// MOSH Journal Enhancer - Block Formatter
// Opens the block formatting panel
if (typeof MoshJournalEnhancer !== "undefined" && MoshJournalEnhancer.openBlockPanel) {
    MoshJournalEnhancer.openBlockPanel();
} else {
    ui.notifications.error("MOSH Journal Enhancer module is not active or not loaded.");
}
    `.trim();
    
    try {
        await Macro.create({
            name: MACRO_NAME,
            type: "script",
            img: MACRO_ICON,
            command: command,
            flags: {
                [MODULE_ID]: {
                    version: MACRO_VERSION
                }
            }
        });
        
        console.log(`${MODULE_ID} | Created macro: ${MACRO_NAME}`);
        ui.notifications.info(`Created macro: ${MACRO_NAME}`);
    } catch (error) {
        console.error(`${MODULE_ID} | Failed to create macro`, error);
    }
}

/**
 * Update existing macro if version changed
 */
export async function updateMacroIfNeeded() {
    if (!game.user.isGM) return;
    
    const existingMacro = game.macros.find(m => m.name === MACRO_NAME);
    if (!existingMacro) return;
    
    const macroVersion = existingMacro.flags?.[MODULE_ID]?.version;
    
    if (macroVersion !== MACRO_VERSION) {
        // Update macro command - use global API
        const command = `
// MOSH Journal Enhancer - Block Formatter v${MACRO_VERSION}
// Opens the block formatting panel
if (typeof MoshJournalEnhancer !== "undefined" && MoshJournalEnhancer.openBlockPanel) {
    MoshJournalEnhancer.openBlockPanel();
} else {
    ui.notifications.error("MOSH Journal Enhancer module is not active or not loaded.");
}
        `.trim();
        
        await existingMacro.update({
            command: command,
            flags: {
                [MODULE_ID]: {
                    version: MACRO_VERSION
                }
            }
        });
        
        console.log(`${MODULE_ID} | Updated macro to version ${MACRO_VERSION}`);
    }
}

/**
 * Export the panel opener for use in macro
 * This is called from the macro command
 */
export function openFormatter() {
    openBlockPanel();
}
