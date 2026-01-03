/**
 * MOSH Journal Enhancer - Actor/Item Embeds
 * Override toEmbed methods for Mothership actors and items
 * Based on original mosh-statblock implementation
 */

import { MODULE_ID, TEMPLATES } from "./config.js";

/**
 * Register embed overrides for Mothership system
 * This should be called during init hook
 */
export function registerEmbedOverrides() {
    // Only apply to Mothership system
    if (game.system.id !== "mosh") {
        console.log(`${MODULE_ID} | Not Mothership system, skipping embed overrides`);
        return;
    }

    const ActorClass = CONFIG.Actor.documentClass;
    const ItemClass = CONFIG.Item.documentClass;

    // --- Override Actor.toEmbed ---
    ActorClass.prototype.toEmbed = async function (config, options = {}) {
        const actor = this;
        
        // Helper to check for statblock flag
        const checkObject = (obj) => {
            if (!obj) return false;
            if (obj.statblock) return true;
            if ("statblock" in obj) return true;
            for (const key of Object.keys(obj)) {
                if (key.toLowerCase() === "statblock") return true;
            }
            return false;
        };

        // Determine Smart Default based on Actor Type
        const isCreature = actor.type === "creature";
        const isShip = actor.type === "ship";
        const isCharacter = actor.type === "character" || actor.type === "android";

        let viewMode = "bio";
        if (isCreature) viewMode = "statblock";
        if (isShip) viewMode = "ship";

        // Check for overrides in config/options
        if (checkObject(config) || checkObject(options)) {
            viewMode = "statblock";
        }

        // Explicit 'bio' flag
        const isBioRequested = (config.bio === true || config.bio === "true") || 
                               (options.bio === true || options.bio === "true");
        if (isBioRequested) viewMode = "bio";

        // Explicit 'ship' flag
        if (config.ship === true || config.ship === "true") viewMode = "ship";

        if (config.view) viewMode = config.view;
        if (config.mode) viewMode = config.mode;

        const showRolls = config.rolls !== undefined;
        const compact = config.compact !== undefined;
        const showBio = config.bio !== "false" && config.bio !== false;

        // Determine label
        const label = config.label || options.label || actor.name;

        // Get TextEditor implementation
        const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation || TextEditor;

        // Generate enriched link
        const enrichedLink = await TextEditorImpl.enrichHTML(`@UUID[${actor.uuid}]{${label}}`, {
            async: true,
            relativeTo: actor
        });

        // Prepare context data
        const context = {
            actor: actor,
            system: actor.system,
            config: { ...config, viewMode, showRolls, compact, showBio },
            label,
            enrichedLink,
            isGM: game.user.isGM,
            isCreature,
            isShip,
            isCharacter,
            isFirstEdition: actor.system.settings?.firstEdition || false,
            items: actor.items,
            // Pre-enrich biography and description
            enrichedBiography: showBio ? await TextEditorImpl.enrichHTML(
                actor.system.biography || "", 
                {
                    secrets: actor.isOwner,
                    rollData: actor.getRollData?.() || {},
                    relativeTo: actor
                }
            ) : "",
            enrichedDescription: showBio ? await TextEditorImpl.enrichHTML(
                actor.system.description || 
                (actor.system.desc && actor.system.desc.value) || "", 
                {
                    secrets: actor.isOwner,
                    rollData: actor.getRollData?.() || {},
                    relativeTo: actor
                }
            ) : ""
        };

        // Determine which template to render
        let template = TEMPLATES.BIO;
        if (viewMode === "statblock") template = TEMPLATES.STATBLOCK;
        if (viewMode === "ship") template = TEMPLATES.SHIP;

        // Render using Foundry's template system
        const renderFn = foundry.applications.handlebars?.renderTemplate || renderTemplate;
        const html = await renderFn(template, context);

        // Convert string to DOM element
        const div = document.createElement("div");
        div.innerHTML = html;
        const element = div.firstElementChild;

        return element;
    };

    // --- Override Actor.onEmbed ---
    ActorClass.prototype.onEmbed = function (element) {
        const actor = this;
        
        // Open Sheet listener
        const sheetLinks = element.querySelectorAll(".open-sheet");
        sheetLinks.forEach(link => {
            link.style.cursor = "pointer";
            link.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (actor.sheet) actor.sheet.render(true);
            });
        });

        // Compact Bio toggle
        const toggleBtn = element.querySelector(".mosh-bio-toggle");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", (event) => {
                event.preventDefault();
                const content = element.querySelector(".mosh-bio-content, .mosh-embed-body");
                if (content) {
                    content.classList.toggle("expanded");
                    toggleBtn.textContent = content.classList.contains("expanded")
                        ? game.i18n.localize("MOSH.Embeds.ShowLess")
                        : game.i18n.localize("MOSH.Embeds.ReadMore");
                }
            });
        }
        
        // Clickable items for rolls
        const clickables = element.querySelectorAll(".clickable[data-item-id]");
        clickables.forEach(el => {
            el.style.cursor = "pointer";
            el.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const itemId = el.dataset.itemId;
                const item = actor.items.get(itemId);
                if (item?.roll) {
                    item.roll();
                } else if (item) {
                    item.sheet.render(true);
                }
            });
        });
    };

    // --- Override Item.toEmbed ---
    ItemClass.prototype.toEmbed = async function (config, options = {}) {
        const item = this;
        
        // Determine label
        const label = config.label || options.label || item.name;

        // Get TextEditor implementation
        const TextEditorImpl = foundry.applications.ux?.TextEditor?.implementation || TextEditor;

        const enrichedLink = await TextEditorImpl.enrichHTML(`@UUID[${item.uuid}]{${label}}`, {
            async: true,
            relativeTo: item
        });

        const context = {
            item: item,
            system: item.system,
            config: config,
            label,
            enrichedLink,
            enrichedDescription: await TextEditorImpl.enrichHTML(
                item.system.description || "", 
                {
                    secrets: item.isOwner,
                    rollData: item.getRollData?.() || {},
                    relativeTo: item
                }
            )
        };

        const renderFn = foundry.applications.handlebars?.renderTemplate || renderTemplate;
        const html = await renderFn(TEMPLATES.ITEM, context);
        
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.firstElementChild;
    };

    // Apply same onEmbed logic to Items
    ItemClass.prototype.onEmbed = function (element) {
        const item = this;
        
        const sheetLinks = element.querySelectorAll(".open-sheet");
        sheetLinks.forEach(link => {
            link.style.cursor = "pointer";
            link.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (item.sheet) item.sheet.render(true);
            });
        });
    };

    console.log(`${MODULE_ID} | Registered embed overrides for Mothership`);
}
