/**
 * MOSH Journal Enhancer - Mothership System Compatibility
 * Normalizes the fields used by journal embeds across supported MoSh 0.6.x releases.
 */

export function normalizeActorSystem(actor) {
    const system = cloneSystemData(actor?.system);
    const get = getProperty;
    const set = setProperty;

    if (!get(system, "class.value") && typeof system.class === "string") {
        set(system, "class.value", system.class);
    }

    if (!get(system, "armor.points") && get(system, "stats.armor.value") !== undefined) {
        set(system, "armor.points", get(system, "stats.armor.value"));
    }

    if (!get(system, "stress") && get(system, "other.stress")) {
        set(system, "stress", get(system, "other.stress"));
    }

    if (!get(system, "description") && get(system, "desc.value")) {
        system.description = get(system, "desc.value");
    }

    return system;
}

export function normalizeItemSystem(item) {
    const system = cloneSystemData(item?.system);

    if (!system.quantity) system.quantity = 1;

    if (system.ranges && !system.ranges.value) {
        system.ranges.value = [system.ranges.short, system.ranges.medium, system.ranges.long]
            .filter(value => value !== undefined && value !== null && value !== "")
            .join("/");
    }

    return system;
}

function cloneSystemData(system = {}) {
    if (foundry.utils?.deepClone) return foundry.utils.deepClone(system);
    return JSON.parse(JSON.stringify(system));
}

function getProperty(object, path) {
    return foundry.utils?.getProperty ? foundry.utils.getProperty(object, path) : path.split(".").reduce((value, key) => value?.[key], object);
}

function setProperty(object, path, value) {
    if (foundry.utils?.setProperty) {
        foundry.utils.setProperty(object, path, value);
        return;
    }

    const parts = path.split(".");
    const final = parts.pop();
    let target = object;
    for (const part of parts) {
        target[part] ??= {};
        target = target[part];
    }
    target[final] = value;
}
