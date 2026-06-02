/**
 * MOSH Journal Enhancer - Text Effects Runtime
 * Keeps animated effects outside ProseMirror's editable document model.
 */

import { log } from "./utils.js";

const CORRUPTION_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@!?/\\<>[]{}";
const EFFECT_EVENT = "mosh-journal-enhancer:apply-corruption";

const corruptionEffects = new Map();
const typewriterEffects = new Map();

let effectsRuntimeRegistered = false;
let corruptionIdCounter = 0;
let corruptionScheduler = null;

/**
 * Register Foundry render hooks for dynamic text effects.
 */
export function registerTextEffectRuntime() {
    if (effectsRuntimeRegistered) return;
    effectsRuntimeRegistered = true;

    Hooks.on("renderJournalTextPageSheet", applyTextEffects);
    Hooks.on("renderJournalPageSheet", applyTextEffects);
    Hooks.on("renderProseMirrorEditor", (app, html) => applyTextEffects(app, html));
    Hooks.on("renderApplicationV2", (app, html) => applyTextEffects(app, html));

    window.addEventListener(EFFECT_EVENT, event => {
        applyCorruptionEffects(event.detail?.root || document);
    });

    window.setTimeout(() => applyTextEffects(null, document), 500);
}

/**
 * Apply dynamic text effects to rendered journals and previews.
 */
export function applyTextEffects(app, html) {
    const root = normalizeRoot(html);
    if (!root) return;

    root.querySelectorAll?.(".mosh-fx-typewriter").forEach(element => {
        applyTypewriterEffect(element);
    });

    applyCorruptionEffects(root);
}

function applyTypewriterEffect(element) {
    if (!(element instanceof HTMLElement)) return;

    if (isEditableTextEffectElement(element)) {
        stopTypewriterEffectForElement(element, { restore: true });
        element.classList.remove("mosh-fx-typewriter-active", "mosh-fx-typewriter-complete");
        return;
    }

    if (typewriterEffects.has(element) || element.classList.contains("mosh-fx-typewriter-complete")) return;

    const original = element.dataset.moshText || element.textContent || "";
    if (!element.dataset.moshText) element.dataset.moshText = original;

    const characters = Array.from(original);
    const state = {
        element,
        original,
        characters,
        index: 0,
        intensity: getTypewriterIntensity(element),
        timer: null
    };

    typewriterEffects.set(element, state);
    element.classList.add("mosh-fx-typewriter-active");
    element.classList.remove("mosh-fx-typewriter-complete");
    element.textContent = "";
    scheduleTypewriterTick(state, 0);
}

function tickTypewriterEffect(state) {
    const { element, characters } = state;
    if (!element.isConnected || !element.classList.contains("mosh-fx-typewriter") || isEditableTextEffectElement(element)) {
        stopTypewriterEffect(state, { restore: true });
        return;
    }

    state.intensity = getTypewriterIntensity(element);
    state.index += 1;
    element.textContent = characters.slice(0, state.index).join("");

    if (state.index >= characters.length) {
        stopTypewriterEffect(state, { complete: true });
        return;
    }

    scheduleTypewriterTick(state, getTypewriterDelay(state.intensity));
}

function scheduleTypewriterTick(state, delay) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => tickTypewriterEffect(state), Math.max(0, delay));
}

function stopTypewriterEffect(state, { restore = false, complete = false } = {}) {
    window.clearTimeout(state.timer);
    typewriterEffects.delete(state.element);

    if (restore) state.element.textContent = state.original;
    if (complete) {
        state.element.textContent = state.original;
        state.element.classList.add("mosh-fx-typewriter-complete");
    }

    state.element.classList.remove("mosh-fx-typewriter-active");
}

function stopTypewriterEffectForElement(element, options = {}) {
    const state = typewriterEffects.get(element);
    if (state) stopTypewriterEffect(state, options);
}

function getTypewriterIntensity(element) {
    const raw = element.dataset.moshEffectIntensity || element.style.getPropertyValue("--mosh-fx-intensity") || "2";
    const intensity = Number(raw);
    return Number.isFinite(intensity) && intensity > 0 ? Math.min(3, Math.max(1, intensity)) : 2;
}

function getTypewriterDelay(intensity) {
    return Math.round(95 - ((intensity - 1) * 25));
}

/**
 * Start scoped corruption overlays for all matching elements inside root.
 */
export function applyCorruptionEffects(root = document) {
    const normalizedRoot = normalizeRoot(root);
    const elements = normalizedRoot?.querySelectorAll?.(".mosh-fx-corrupt") || [];
    elements.forEach(element => {
        if (isEditableCorruptionElement(element)) {
            stopCorruptionEffectForElement(element);
            normalizeCorruptionForEditor(element);
            element.classList.add("mosh-fx-corrupt-editor");
            return;
        }

        element.classList.remove("mosh-fx-corrupt-editor");
        startCorruptionEffect(element);
    });
}

function startCorruptionEffect(element) {
    if (!(element instanceof HTMLElement) || corruptionEffects.has(element)) return;

    const parts = ensureCorruptionStructure(element);
    const original = cleanRuntimeText(element.dataset.moshText || parts.source.textContent || "");
    if (!element.dataset.moshText) element.dataset.moshText = original;
    if (!element.dataset.moshCorruptionId) {
        element.dataset.moshCorruptionId = `c${Date.now().toString(36)}${(++corruptionIdCounter).toString(36)}`;
    }

    element.classList.add("mosh-fx-corrupt-active");
    parts.frame.setAttribute("aria-hidden", "true");

    const state = {
        element,
        frame: parts.frame,
        original,
        intensity: getCorruptionIntensity(element),
        nextTickAt: 0,
        styleSignature: ""
    };

    corruptionEffects.set(element, state);
    log("Corruption effect started", {
        id: element.dataset.moshCorruptionId,
        intensity: state.intensity,
        textLength: original.length,
        className: element.className,
        inlineStyle: element.getAttribute("style") || ""
    });
    scheduleCorruptionTick(state, 0);
    ensureCorruptionScheduler();
}

function tickCorruptionEffect(state) {
    const { element, frame } = state;
    if (!element.isConnected || !element.classList.contains("mosh-fx-corrupt")) {
        stopCorruptionEffect(state);
        return;
    }

    const intensity = getCorruptionIntensity(element);
    if (Math.abs(intensity - state.intensity) > 0.01) {
        state.intensity = intensity;
    }

    syncCorruptionFrameStyle(state);
    frame.textContent = corruptTextFrame(state.original, intensity);
    scheduleCorruptionTick(state, getCorruptionDelay(intensity));
}

function stopCorruptionEffect(state) {
    if (state.frame) state.frame.textContent = "";
    state.element.classList.remove("mosh-fx-corrupt-active");
    corruptionEffects.delete(state.element);
    stopCorruptionSchedulerIfIdle();
}

function stopCorruptionEffectForElement(element) {
    const state = corruptionEffects.get(element);
    if (state) stopCorruptionEffect(state);
}

function normalizeCorruptionForEditor(element) {
    element.classList.remove("mosh-fx-corrupt-active");

    const source = element.querySelector(":scope > .mosh-fx-source");
    const frame = element.querySelector(":scope > .mosh-fx-frame");

    if (frame) frame.remove();
    if (!source) return;

    const nodes = Array.from(source.childNodes);
    source.replaceWith(...nodes);
}

function getCorruptionIntensity(element) {
    const raw = element.dataset.moshEffectIntensity || element.style.getPropertyValue("--mosh-fx-intensity") || "2";
    const intensity = Number(raw);
    return Number.isFinite(intensity) && intensity > 0 ? Math.min(3, Math.max(1, intensity)) : 2;
}

function corruptTextFrame(text, intensity = 2) {
    const chance = Math.min(0.82, 0.18 + (intensity * 0.18));
    return Array.from(text, char => {
        if (!char.trim()) return char;
        return Math.random() < chance ? randomCorruptionChar() : char;
    }).join("");
}

function getCorruptionDelay(intensity) {
    return Math.round(460 - ((intensity - 1) * 170));
}

function scheduleCorruptionTick(state, delay) {
    state.nextTickAt = performance.now() + Math.max(0, delay);
}

function ensureCorruptionScheduler() {
    if (corruptionScheduler) return;
    corruptionScheduler = window.setInterval(processCorruptionEffects, 80);
}

function stopCorruptionSchedulerIfIdle() {
    if (corruptionEffects.size || !corruptionScheduler) return;
    window.clearInterval(corruptionScheduler);
    corruptionScheduler = null;
}

function processCorruptionEffects() {
    const now = performance.now();
    for (const state of Array.from(corruptionEffects.values())) {
        if (now >= state.nextTickAt) tickCorruptionEffect(state);
    }
    stopCorruptionSchedulerIfIdle();
}

function randomCorruptionChar() {
    return CORRUPTION_CHARS[Math.floor(Math.random() * CORRUPTION_CHARS.length)];
}

function isEditableCorruptionElement(element) {
    return isEditableTextEffectElement(element);
}

function isEditableTextEffectElement(element) {
    return !!element.closest?.(".ProseMirror[contenteditable='true'], [contenteditable='true']");
}

function ensureCorruptionStructure(element) {
    let source = element.querySelector(":scope > .mosh-fx-source");
    let frame = element.querySelector(":scope > .mosh-fx-frame");

    if (!source) {
        source = document.createElement("span");
        source.className = "mosh-fx-source";

        const nodes = Array.from(element.childNodes).filter(node => {
            return !(node instanceof HTMLElement && node.classList.contains("mosh-fx-frame"));
        });

        if (nodes.length) source.append(...nodes);
        else source.textContent = element.dataset.moshText || "";
        element.prepend(source);
    }

    if (!frame) {
        frame = document.createElement("span");
        frame.className = "mosh-fx-frame";
        element.appendChild(frame);
    }

    return { source, frame };
}

function syncCorruptionFrameStyle(state) {
    const source = state.element.querySelector(":scope > .mosh-fx-source");
    const frame = state.frame;
    if (!source || !frame) return;

    const styledElement = findFirstTextElement(source) || source;
    const style = window.getComputedStyle(styledElement);
    const properties = [
        "color",
        "font",
        "fontFamily",
        "fontSize",
        "fontStyle",
        "fontWeight",
        "fontVariant",
        "fontStretch",
        "lineHeight",
        "letterSpacing",
        "textTransform",
        "textDecorationLine",
        "textDecorationStyle",
        "textDecorationColor",
        "textDecorationThickness"
    ];

    for (const property of properties) {
        frame.style[property] = style[property];
    }

    frame.style.setProperty("--mosh-corrupt-accent", style.color);

    const signature = [
        style.color,
        style.fontFamily,
        style.fontSize,
        style.fontStyle,
        style.fontWeight,
        style.lineHeight,
        style.letterSpacing,
        style.textDecorationLine,
        style.textDecorationStyle,
        style.textDecorationColor
    ].join("|");

    if (signature !== state.styleSignature) {
        state.styleSignature = signature;
        log("Corruption frame style synced", {
            id: state.element.dataset.moshCorruptionId,
            sourceTag: styledElement.tagName?.toLowerCase?.() || "span",
            sourceClassName: styledElement.className || "",
            sourceInlineStyle: styledElement.getAttribute?.("style") || "",
            sourceColor: style.color,
            frameColor: frame.style.color,
            frameInlineStyle: frame.getAttribute("style") || "",
            textSample: source.textContent?.trim()?.slice(0, 80) || ""
        });
    }
}

function findFirstTextElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });

    const textNode = walker.nextNode();
    return textNode?.parentElement || null;
}

function cleanRuntimeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeRoot(value) {
    if (!value) return null;
    if (value instanceof HTMLElement || value instanceof Document || value instanceof DocumentFragment) return value;
    if (value.jquery) return value[0] ?? null;
    if (value.element instanceof HTMLElement) return value.element;
    if (value[0] instanceof HTMLElement) return value[0];
    return null;
}
