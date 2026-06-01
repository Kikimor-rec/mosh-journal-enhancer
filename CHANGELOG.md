# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-06-01

### Added

- Added release workflow support for draft releases with release notes generated from the matching changelog section.
- Expanded README documentation for embeds, journal blocks, text effects, color tools, figure tools, settings, optional Monk's Enhanced Journal compatibility, and troubleshooting.
- Added ProseMirror-native MOSH toolbar controls for Blocks, Effects, Color, and Image.
- Added mark-based inline effect and color insertion so colors, fonts, and MOSH effects can stack on selected text.
- Added scoped runtime handling for dynamic text effects so animated text does not mutate ProseMirror content on timers.
- Added a small Mothership system compatibility adapter for embed data used across MoSh 0.6.x.
- Added a compact text color tool with theme-derived swatches.
- Added mask color choices for redacted/secret text.

### Changed

- Reworked Data Corruption to stay readable in edit mode and render randomized replacement characters only in journal view mode.
- Optimized the Data Corruption scheduler so dynamic text effects do not create one timer per text span.
- Removed unused legacy dialog style injection; current block, effect, and figure styles are loaded through the manifest CSS files.
- Kept DOM/`execCommand` insertion paths as compatibility fallbacks behind the ProseMirror-first editor integration.

### Fixed

- Fixed the inline figure toolbar so position, size, style, and delete actions update the ProseMirror editor content through the editor insertion/update path instead of mutating DOM classes directly.
- Added debug diagnostics for figure toolbar actions when debug logging is enabled.
- Fixed Data Corruption overlays bleeding through Foundry windows by scoping the overlay layer to the owning journal/application window.
- Fixed Data Corruption visibility so the animated random-character overlay is not hidden by normal parent/editor elements.
- Reworked Data Corruption runtime to animate random characters through stylesheet rules instead of a fragile positioned overlay.
- Kept Data Corruption readable in ProseMirror edit mode while animating only in journal view mode.
- Improved Data Corruption styling so inherited text colors can affect the animated output.
- Reworked Data Corruption markup into source/frame layers so view-mode length follows the original text and the real text is not selected/copied from journal view.
- Made module text color wrap an entire Data Corruption span when applying color inside the effect.
- Fixed generated figure class names so inserted figures consistently use `float-left` / `float-right`, `size-small` / `size-medium` / `size-large`, and `style-polaroid` / `style-screen`.
- Updated Mothership system compatibility metadata to require 0.6.0 and mark 0.6.1 as verified.

## [1.0.2] - 2026-05-30

### Changed

- Verified compatibility metadata for Foundry VTT v14 while keeping v13 as the minimum supported version.
- Removed Monk's Enhanced Journal from package relationships; compatibility remains soft and optional.
- Switched actor/item `@Embed` rendering to Foundry document embed handlers when available, with guarded legacy wrappers as fallback.
- Improved journal toolbar discovery for Foundry v13/v14 ApplicationV2, ProseMirror, and Monk's Enhanced Journal editor containers.

### Fixed

- Restored MOSH block and image toolbar buttons in dynamically rendered journal editors.
- Avoided string-built figure preview HTML in the figure dialog.
- Escaped generated figure and navigation block parameters.

## [1.0.1] - 2026-05-21

### Changed

- Stabilized journal editor toolbar registration for Foundry VTT v13/v14 ApplicationV2 and ProseMirror rendering.
- Added soft compatibility handling for Monk's Enhanced Journal editor containers.
- Moved toolbar-inserted journal block styles into manifest CSS so saved content renders consistently.
- Updated figure styles to match inserted classes such as `float-left`, `size-medium`, and `style-polaroid`.
- Made `enableToolbar` and `enableEmbeds` settings actually gate hook and embed registration.
- Added `debugLogging` setting for console diagnostics.

### Fixed

- Reworked actor/item embed overrides to use guarded wrappers and libWrapper when available.
- Added fallback to original embed rendering if MOSH embed template rendering fails.
- Reduced global DOM polling by removing the toolbar MutationObserver and interval scan.
- Escaped user-provided figure path/caption content during preview and insertion.

## [1.0.0] - 2026-01-03

### Added

- Initial release for Foundry VTT v13
- **Actor Embeds**
  - Smart embed detection (Creatures â†’ Statblock, Characters â†’ Bio, Ships â†’ Ship vitals)
  - High-contrast terminal-style statblocks for creatures
  - Bio cards with portrait and biography for characters
  - Ship vitals display for ships
  - Interactive elements - click to open actor sheet
  - Support for `@Embed[Actor.UUID]` syntax with optional `statblock`, `bio=true`, `ship` flags
- **Custom Formatting Blocks**
  - Narrative - Atmospheric read-aloud text
  - Quote - NPC dialogue and radio transmissions
  - Terminal - Ship computer/AI output
  - Handout - Notes, documents, data logs
  - Navigation - Location links with exits
  - Warden - GM tips and advice
  - Info - Important rules and information
- **Editor Toolbar Integration**
  - "Blocks" button in ProseMirror editor toolbar
  - Block selection panel with live previews
  - Works with Foundry v13 ProseMirror editor
- **Localization**
  - Full English translation
  - Full Russian translation
- **Settings**
  - Toggle editor toolbar on/off
  - Toggle custom embed rendering on/off
- **Macro Support**
  - Auto-created "MOSH Block Formatter" macro for quick access
  - Global API: `MoshJournalEnhancer.openBlockPanel()`

### Technical

- Built with ApplicationV2 for dialogs
- ES Modules architecture
- Compatible with Foundry VTT v13-v14
- Requires Mothership RPG system

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-06-01 | ProseMirror-native toolbar, stable corrupted text, color/effect stacking, figure persistence |
| 1.0.2 | 2026-05-30 | Foundry v14 compatibility, optional Monk's support, toolbar restoration |
| 1.0.1 | 2026-05-21 | Foundry v13/v14 stabilization and Monk's Enhanced Journal compatibility |
| 1.0.0 | 2026-01-03 | Initial public release |

[Unreleased]: https://github.com/Kikimor-rec/mosh-journal-enhancer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Kikimor-rec/mosh-journal-enhancer/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/Kikimor-rec/mosh-journal-enhancer/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Kikimor-rec/mosh-journal-enhancer/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Kikimor-rec/mosh-journal-enhancer/releases/tag/v1.0.0
