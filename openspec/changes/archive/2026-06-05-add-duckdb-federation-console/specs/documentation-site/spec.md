## MODIFIED Requirements

### Requirement: Solution Overview in Docs

The documentation landing page or quickstart MUST include a section describing what archmax provides from a user's perspective, including:

- What the main UI sections are and what users do in each one
- That the "AI-Assisted Model Builder" is a chat interface, not a form-based wizard
- That MCP tokens are how external AI agents connect to the semantic layer
- That the Testing suite validates whether agents can use the models correctly

Each major UI section (Dashboard/Projects, Semantic Models, Data Federation, Data Browser, MCP Access, Testing) MUST be briefly introduced so users understand what they can do before they start.

The Data Federation section MUST describe three areas: **Data Sources** (connection management), **Browser** (schema and table exploration), and **Console** (ad-hoc federated SQL, extension install, and copyable setup commands for `INSTALL`, `LOAD`, and `ATTACH`).

This overview MUST be written for a non-technical audience that has never seen the product.

#### Scenario: New user understands the product

- **WHEN** a new user reads the documentation landing page
- **THEN** they understand the high-level workflow (create project, connect database, build model via chat, publish, create MCP token, connect agent)
- **AND** they can identify what each UI section does before navigating to it

#### Scenario: Reader understands Data Federation areas

- **WHEN** a new user reads the Data Federation description in the overview
- **THEN** they can distinguish connection setup, data browsing, and the federation console
- **AND** they know the console provides setup commands for extensions and attach examples
