/**
 * MOSH Journal Enhancer - Actor/Item Embeds
 * Adds Mothership-specific @Embed rendering without permanently clobbering originals.
 */

import { MODULE_ID, TEMPLATES } from "./config.js";
import { log, logError } from "./utils.js";

const PATCH_MARKER = Symbol.for(`${MODULE_ID}.embedOverridesRegistered`);
const HANDLER_MARKER = Symbol.for(`${MODULE_ID}.embedHandlersRegistered`);
const ORIGINALS = {
    actorToEmbed: null,
    actorOnEmbed: null,
    itemToEmbed: null,
    itemOnEmbed: null
};

/**
 * Register embed renderers for the Mothership system.
 */
export function registerEmbedOverrides() {
    if (game.system.id !== "mosh") {
        log("Not Mothership system, skipping embed overrides");
        return;
    }

    if (registerDocumentEmbedHandlers()) return;
    registerLegacyEmbedWrappers();
}

function registerDocumentEmbedHandlers() {
    if (!Array.isArray(CONFIG.Actor?.embedHandlers) || !Array.isArray(CONFIG.Item?.embedHandlers)) {
        return false;
    }

    if (!CONFIG.Actor[HANDLER_MARKER]) {
        CONFIG.Actor.embedHandlers.unshift(actorEmbedHandler);
        CONFIG.Actor[HANDLER_MARKER] = true;
    }

    if (!CONFIG.Item[HANDLER_MARKER]) {
        CONFIG.Item.embedHandlers.unshift(itemEmbedHandler);
        CONFIG.Item[HANDLER_MARKER] = true;
    }

    log("Registered document embed handlers for Mothership");
    return true;
}

function registerLegacyEmbedWrappers() {
    const ActorClass = CONFIG.Actor.documentClass;
    const ItemClass = CONFIG.Item.documentClass;
    if (!ActorClass?.prototype || !ItemClass?.prototype) return;

    if (ActorClass.prototype[PATCH_MARKER] && ItemClass.prototype[PATCH_MARKER]) {
        log("Embed overrides already registered");
        return;
    }

    ORIGINALS.actorToEmbed = ActorClass.prototype.toEmbed;
    ORIGINALS.actorOnEmbed = ActorClass.prototype.onEmbed;
    ORIGINALS.itemToEmbed = ItemClass.prototype.toEmbed;
    ORIGINALS.itemOnEmbed = ItemClass.prototype.onEmbed;

    if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
        libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.toEmbed", actorToEmbedWrapper, "WRAPPER");
        libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.onEmbed", actorOnEmbedWrapper, "WRAPPER");
        libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.toEmbed", itemToEmbedWrapper, "WRAPPER");
        libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.onEmbed", itemOnEmbedWrapper, "WRAPPER");
    } else {
        ActorClass.prototype.toEmbed = function(config = {}, options = {}) {
            return actorToEmbedWrapper.call(this, ORIGINALS.actorToEmbed?.bind(this), config, options);
        };
        ActorClass.prototype.onEmbed = function(element, ...args) {
            return actorOnEmbedWrapper.call(this, ORIGINALS.actorOnEmbed?.bind(this), element, ...args);
        };
        ItemClass.prototype.toEmbed = function(config = {}, options = {}) {
            return itemToEmbedWrapper.call(this, ORIGINALS.itemToEmbed?.bind(this), config, options);
        };
        ItemClass.prototype.onEmbed = function(element, ...args) {
            return itemOnEmbedWrapper.call(this, ORIGINALS.itemOnEmbed?.bind(this), element, ...args);
        };
    }

    ActorClass.prototype[PATCH_MARKER] = true;
    ItemClass.prototype[PATCH_MARKER] = true;
    log("Registered embed wrappers for Mothership");
}

async function actorEmbedHandler(actor, content, config = {}, options = {}) {
    if (!shouldRenderMoshActorEmbed(actor, config, options)) return null;

    try {
        const element = await renderActorEmbed(actor, config, options);
        attachActorEmbedListeners(actor, element);
        return element;
    } catch (error) {
        logError(`Failed to render actor embed for ${actor.name}`, error);
        return null;
    }
}

async function itemEmbedHandler(item, content, config = {}, options = {}) {
    if (!shouldRenderMoshItemEmbed(item, config, options)) return null;

    try {
        const element = await renderItemEmbed(item, config, options);
        attachItemEmbedListeners(item, element);
        return element;
    } catch (error) {
        logError(`Failed to render item embed for ${item.name}`, error);
        return null;
    }
}

async function actorToEmbedWrapper(wrapped, config = {}, options = {}) {
    config ||= {};
    options ||= {};

    if (!shouldRenderMoshActorEmbed(this, config, options)) {
        return callOriginalEmbed(wrapped, this, config, options);
    }

    try {
        return await renderActorEmbed(this, config, options);
    } catch (error) {
        logError(`Failed to render actor embed for ${this.name}`, error);
        return callOriginalEmbed(wrapped, this, config, options);
    }
}

function actorOnEmbedWrapper(wrapped, element, ...args) {
    try {
        if (typeof wrapped === "function") wrapped(element, ...args);
    } catch (error) {
        logError(`Original actor onEmbed failed for ${this.name}`, error);
    }

    attachActorEmbedListeners(this, element);
}

async function itemToEmbedWrapper(wrapped, config = {}, options = {}) {
    config ||= {};
    options ||= {};

    if (!shouldRenderMoshItemEmbed(this, config, options)) {
        return callOriginalEmbed(wrapped, this, config, options);
    }

    try {
        return await renderItemEmbed(this, config, options);
    } catch (error) {
        logError(`Failed to render item embed for ${this.name}`, error);
        return callOriginalEmbed(wrapped, this, config, options);
    }
}

function itemOnEmbedWrapper(wrapped, element, ...args) {
    try {
        if (typeof wrapped === "function") wrapped(element, ...args);
    } catch (error) {
        logError(`Original item onEmbed failed for ${this.name}`, error);
    }

    attachItemEmbedListeners(this, element);
}

function shouldRenderMoshActorEmbed(actor, config = {}, options = {}) {
    if (actor?.documentName !== "Actor") return false;

    const supportedTypes = new Set(["creature", "ship", "character", "android"]);
    if (supportedTypes.has(actor.type)) return true;

    return getRequestedViewMode(config, options) !== null;
}

function shouldRenderMoshItemEmbed(item, config = {}, options = {}) {
    if (item?.documentName !== "Item") return false;
    return true;
}

async function renderActorEmbed(actor, config = {}, options = {}) {
    const isCreature = actor.type === "creature";
    const isShip = actor.type === "ship";
    const isCharacter = actor.type === "character" || actor.type === "android";

    let viewMode = getRequestedViewMode(config, options);
    if (!viewMode) {
        viewMode = isCreature ? "statblock" : isShip ? "ship" : "bio";
    }

    const showRolls = config.rolls !== undefined;
    const compact = config.compact !== undefined;
    const showBio = config.bio !== "false" && config.bio !== false;
    const label = config.label || options.label || actor.name;
    const TextEditorImpl = getTextEditorImplementation();

    const enrichedLink = await TextEditorImpl.enrichHTML(`@UUID[${actor.uuid}]{${label}}`, {
        async: true,
        relativeTo: actor
    });

    const context = {
        actor,
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
        enrichedBiography: showBio ? await TextEditorImpl.enrichHTML(actor.system.biography || "", {
            secrets: actor.isOwner,
            rollData: actor.getRollData?.() || {},
            relativeTo: actor
        }) : "",
        enrichedDescription: showBio ? await TextEditorImpl.enrichHTML(
            actor.system.description || (actor.system.desc && actor.system.desc.value) || "",
            {
                secrets: actor.isOwner,
                rollData: actor.getRollData?.() || {},
                relativeTo: actor
            }
        ) : ""
    };

    let template = TEMPLATES.BIO;
    if (viewMode === "statblock") template = TEMPLATES.STATBLOCK;
    if (viewMode === "ship") template = TEMPLATES.SHIP;

    return renderTemplateToElement(template, context);
}

async function renderItemEmbed(item, config = {}, options = {}) {
    const label = config.label || options.label || item.name;
    const TextEditorImpl = getTextEditorImplementation();
    const enrichedLink = await TextEditorImpl.enrichHTML(`@UUID[${item.uuid}]{${label}}`, {
        async: true,
        relativeTo: item
    });

    return renderTemplateToElement(TEMPLATES.ITEM, {
        item,
        system: item.system,
        config,
        label,
        enrichedLink,
        enrichedDescription: await TextEditorImpl.enrichHTML(item.system.description || "", {
            secrets: item.isOwner,
            rollData: item.getRollData?.() || {},
            relativeTo: item
        })
    });
}

function getRequestedViewMode(config = {}, options = {}) {
    if (hasFlag(config, "statblock") || hasFlag(options, "statblock")) return "statblock";
    if (config.bio === true || config.bio === "true" || options.bio === true || options.bio === "true") return "bio";
    if (config.ship === true || config.ship === "true" || options.ship === true || options.ship === "true") return "ship";
    return config.view || options.view || config.mode || options.mode || null;
}

function hasFlag(obj, flag) {
    if (!obj) return false;
    if (obj[flag] === true || obj[flag] === "true") return true;
    return Object.keys(obj).some(key => key.toLowerCase() === flag.toLowerCase());
}

function attachActorEmbedListeners(actor, element) {
    if (!element) return;

    attachSheetLinks(actor, element);

    const toggleBtn = element.querySelector(".mosh-bio-toggle");
    if (toggleBtn && !toggleBtn.dataset.moshBound) {
        toggleBtn.dataset.moshBound = "true";
        toggleBtn.addEventListener("click", event => {
            event.preventDefault();
            const content = element.querySelector(".mosh-bio-content, .mosh-embed-body");
            if (!content) return;

            content.classList.toggle("expanded");
            toggleBtn.textContent = content.classList.contains("expanded")
                ? game.i18n.localize("MOSH.Embeds.ShowLess")
                : game.i18n.localize("MOSH.Embeds.ReadMore");
        });
    }

    element.querySelectorAll(".clickable[data-item-id]").forEach(clickable => {
        if (clickable.dataset.moshBound) return;
        clickable.dataset.moshBound = "true";
        clickable.style.cursor = "pointer";
        clickable.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const item = actor.items.get(clickable.dataset.itemId);
            if (item?.roll) item.roll();
            else item?.sheet?.render(true);
        });
    });
}

function attachItemEmbedListeners(item, element) {
    attachSheetLinks(item, element);
}

function attachSheetLinks(document, element) {
    element.querySelectorAll(".open-sheet").forEach(link => {
        if (link.dataset.moshBound) return;
        link.dataset.moshBound = "true";
        link.style.cursor = "pointer";
        link.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            document.sheet?.render(true);
        });
    });
}

async function renderTemplateToElement(template, context) {
    const renderFn = foundry.applications.handlebars?.renderTemplate || globalThis.renderTemplate;
    const html = await renderFn(template, context);
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.firstElementChild;
}

function getTextEditorImplementation() {
    return foundry.applications.ux?.TextEditor?.implementation || globalThis.TextEditor;
}

async function callOriginalEmbed(wrapped, document, config = {}, options = {}) {
    if (typeof wrapped === "function") return wrapped(config, options);
    return fallbackLinkElement(document, config, options);
}

function fallbackLinkElement(document, config = {}, options = {}) {
    const label = config.label || options.label || document.name;
    const anchor = document.createAnchor?.({ label }) || document.toAnchor?.({ label });
    if (anchor) return anchor;

    const element = document.createElement?.("a") || globalThis.document.createElement("a");
    element.className = "content-link";
    element.dataset.uuid = document.uuid;
    element.textContent = label;
    return element;
}
