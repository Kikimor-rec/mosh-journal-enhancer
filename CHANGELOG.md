# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Compatible with Foundry VTT v13+
- Requires Mothership RPG system

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-01-03 | Initial public release |

[Unreleased]: https://github.com/Kikimor-rec/mosh-journal-enhancer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Kikimor-rec/mosh-journal-enhancer/releases/tag/v1.0.0
