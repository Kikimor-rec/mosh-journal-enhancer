/**
 * MOSH Journal Enhancer - Configuration
 * Constants and block type definitions
 */

export const MODULE_ID = "mosh-journal-enhancer";
export const MODULE_VERSION = "1.0.0";

// Template paths
export const TEMPLATES = {
    BIO: `modules/${MODULE_ID}/templates/embed/actor-bio.hbs`,
    STATBLOCK: `modules/${MODULE_ID}/templates/embed/actor-statblock.hbs`,
    SHIP: `modules/${MODULE_ID}/templates/embed/actor-ship.hbs`,
    ITEM: `modules/${MODULE_ID}/templates/embed/item-card.hbs`,
    BLOCK_PANEL: `modules/${MODULE_ID}/templates/block-panel.hbs`,
    FIGURE_DIALOG: `modules/${MODULE_ID}/templates/figure-dialog.hbs`
};

// Block types configuration
export const BLOCK_TYPES = {
    narrative: {
        label: "MOSH.Blocks.Narrative",
        icon: "fas fa-book-open",
        hint: "MOSH.Blocks.NarrativeHint",
        className: "narrative"
    },
    quote: {
        label: "MOSH.Blocks.Quote",
        icon: "fas fa-quote-left",
        hint: "MOSH.Blocks.QuoteHint",
        className: "quote"
    },
    terminal: {
        label: "MOSH.Blocks.Terminal",
        icon: "fas fa-terminal",
        hint: "MOSH.Blocks.TerminalHint",
        className: "terminal"
    },
    handout: {
        label: "MOSH.Blocks.Handout",
        icon: "fas fa-file-alt",
        hint: "MOSH.Blocks.HandoutHint",
        className: "handout"
    },
    navigation: {
        label: "MOSH.Blocks.Navigation",
        icon: "fas fa-route",
        hint: "MOSH.Blocks.NavigationHint",
        className: "navigation"
    },
    warden: {
        label: "MOSH.Blocks.Warden",
        icon: "fas fa-eye",
        hint: "MOSH.Blocks.WardenHint",
        className: "warden"
    },
    info: {
        label: "MOSH.Blocks.Info",
        icon: "fas fa-info-circle",
        hint: "MOSH.Blocks.InfoHint",
        className: "info"
    },
    figure: {
        label: "MOSH.Blocks.Figure",
        icon: "fas fa-image",
        hint: "MOSH.Blocks.FigureHint",
        className: "mosh-figure",
        isFigure: true
    }
};

// Figure options
export const FIGURE_OPTIONS = {
    positions: [
        { value: "", label: "MOSH.Figure.Inline" },
        { value: "left", label: "MOSH.Figure.Left" },
        { value: "right", label: "MOSH.Figure.Right" }
    ],
    sizes: [
        { value: "small", label: "MOSH.Figure.Small" },
        { value: "medium", label: "MOSH.Figure.Medium" },
        { value: "large", label: "MOSH.Figure.Large" }
    ],
    styles: [
        { value: "", label: "MOSH.Figure.Default" },
        { value: "polaroid", label: "MOSH.Figure.Polaroid" },
        { value: "screen", label: "MOSH.Figure.Screen" }
    ]
};                                                                                                                                                                                                                                                                                                                                                                                              
