## REMOVED Requirements

### Requirement: List Test Agents Tool

**Reason**: Test agents no longer exist; the project has a single agent configured in Settings. The builder no longer needs to enumerate or assign agents.
**Migration**: The tool is removed from the builder's tool map and the system prompt. `create_test_case` no longer accepts an agent reference.

## MODIFIED Requirements

### Requirement: LLM Provider Configuration

The deep agent SHALL use an OpenAI-compatible API endpoint resolved per project. For each of the three settings — base URL, API key, and model — the effective value SHALL be the project's `builderLlm` value when set, otherwise the corresponding environment variable: `AGENT_API_BASE_URL` (defaults to `https://openrouter.ai/api/v1`), `AGENT_API_KEY`, and `AGENT_MODEL`. This allows using OpenRouter, direct OpenAI, Azure OpenAI, local Ollama, or any OpenAI-compatible provider, globally or per project.

#### Scenario: Agent uses OpenRouter via env defaults

- **WHEN** the project has no `builderLlm` settings and `AGENT_API_BASE_URL` is set to `https://openrouter.ai/api/v1` with a valid `AGENT_API_KEY`
- **THEN** the agent sends LLM requests through OpenRouter
- **AND** the model specified in `AGENT_MODEL` is used

#### Scenario: Project settings override env

- **WHEN** the project's `builderLlm` has `model: "gpt-5"` and an API key, while env vars configure a different model and key
- **THEN** the builder agent for that project uses the project's model and key
- **AND** other projects without `builderLlm` continue using the env configuration

#### Scenario: Per-field fallback

- **WHEN** the project's `builderLlm` sets only `model` and env vars provide the base URL and API key
- **THEN** the agent uses the project's model with the env base URL and API key

### Requirement: Agent Configuration Missing Banner

The agent chat empty state (shown before any messages are sent) SHALL display an error banner when the backend reports that no LLM configuration is resolvable for the surface. Configuration state SHALL be reported per project: the builder is configured when an API key resolves from `Project.builderLlm` or `AGENT_API_KEY`; the project agent is configured when `Project.agentLlm` is set.

The banner SHALL:

- Appear in place of the default empty state description on the Builder chat (Build section) when the builder is unconfigured, and on the Agent playground page when the project agent is unconfigured
- Use a warning/caution visual treatment (icon + tinted background) consistent with the application's design system
- Explain that an AI provider configuration is required for the agent to work
- Link to the relevant settings page: `/$projectId/settings/builder` for the builder, `/$projectId/settings/agent` for the agent — and mention the env-var fallback (`AGENT_API_KEY`, `AGENT_API_BASE_URL`, `AGENT_MODEL`) for the builder
- Disable the chat input (prevent sending) while the surface is not configured

The banner SHALL NOT appear once the corresponding configuration resolves.

#### Scenario: Builder chat without any builder configuration

- **WHEN** the user navigates to the Build chat
- **AND** neither `Project.builderLlm` nor `AGENT_API_KEY` provides an API key
- **THEN** the empty state displays a warning banner explaining that an API key is required
- **AND** the banner links to `/$projectId/settings/builder` and mentions the env-var fallback
- **AND** the chat input is disabled

#### Scenario: Builder chat with project-level configuration only

- **WHEN** `AGENT_API_KEY` is not set but the project's `builderLlm` contains an API key
- **THEN** the default empty state is shown and the chat input is enabled

#### Scenario: Agent playground without agent configuration

- **WHEN** the user navigates to the Agent page
- **AND** the project has no `agentLlm` configuration
- **THEN** the empty state displays a warning banner linking to `/$projectId/settings/agent`
- **AND** the chat input is disabled

### Requirement: Create Test Case Tool

The deep agent SHALL have access to a `create_test_case` tool that creates a test case document in MongoDB for the current project. The tool accepts `title` (string, required), `semanticModel` (string, required), `inputMessage` (string, required), and `expectedFacts` (array of strings, min 1). The tool SHALL NOT accept any test-agent reference — test cases always execute with the single project agent.

The tool SHALL automatically add "auto-generated" to the test case's `tags` array so that auto-generated cases are distinguishable from manually created ones.

The agent's system prompt SHALL document the tool and instruct the agent to only create test cases when the user explicitly provides ground-truth facts or expected answers. The agent SHALL NOT invent expected facts from its own data exploration or query results.

#### Scenario: Agent creates a test case

- **WHEN** the user provides ground-truth facts
- **AND** the agent invokes `create_test_case` with `{ "title": "Total revenue 2024", "semanticModel": "ecommerce", "inputMessage": "What is the total revenue for 2024?", "expectedFacts": ["Total revenue for 2024 is 1.65 MEUR"] }`
- **THEN** a TestCase document is created for the project
- **AND** the `tags` array contains "auto-generated"

#### Scenario: Agent does not create test cases without user-provided facts

- **WHEN** the agent has finished writing a semantic model
- **AND** the user has not provided any ground-truth facts or expected answers
- **THEN** the agent SHALL NOT invoke `create_test_case` on its own
- **AND** the agent MAY suggest creating test cases and ask the user to supply expected answers

#### Scenario: Invalid input rejected

- **WHEN** the agent invokes `create_test_case` with an empty `expectedFacts` array
- **THEN** the tool returns an error indicating at least one expected fact is required
- **AND** no TestCase document is created

#### Scenario: Auto-generated tag always present

- **WHEN** the agent invokes `create_test_case` for any test case
- **THEN** the resulting TestCase always includes "auto-generated" in its `tags` array regardless of any other tags provided

### Requirement: List Test Cases Tool

The deep agent SHALL have access to a `list_test_cases` tool that returns existing test cases for the current project. The tool accepts an optional `semanticModel` parameter to filter results by model name. It SHALL return a JSON array of objects, each containing `id` (string), `title` (string), `semanticModel` (string), `inputMessage` (string), `expectedFactsCount` (number), and `tags` (array of strings). The agent's system prompt SHALL instruct the agent to call `list_test_cases` before creating new test cases to review existing coverage and avoid duplicates.

#### Scenario: Agent lists test cases for a semantic model

- **WHEN** the agent invokes `list_test_cases` with `{ "semanticModel": "ecommerce" }`
- **AND** the project has three test cases for "ecommerce" and two for "hr"
- **THEN** the tool returns a JSON array with only the three "ecommerce" test cases

#### Scenario: Agent lists all test cases

- **WHEN** the agent invokes `list_test_cases` without a `semanticModel` filter
- **THEN** the tool returns all non-deleted test cases for the project

#### Scenario: No test cases exist

- **WHEN** the agent invokes `list_test_cases`
- **AND** the project has no test cases
- **THEN** the tool returns an empty JSON array

### Requirement: Sidebar Model List

The Builder side panel's **Data Models** entry (nested under the **Agent Scaffold** section) SHALL display semantic models as a flat, non-expandable list. Each entry shows the model name. Clicking a model name selects it and opens the visualization view in the main content area. The currently selected model SHALL be visually highlighted. Clicking the selected model again deselects it and returns to the chat view.

#### Scenario: User clicks a model in the panel

- **WHEN** the user clicks a model name under Agent Scaffold → Data Models
- **THEN** the model is highlighted as selected
- **AND** the main content area shows the visualization for that model

#### Scenario: User deselects the active model

- **WHEN** the user clicks the currently selected model name
- **THEN** the model is deselected
- **AND** the main content area returns to the chat message view

#### Scenario: Models listed without expansion

- **WHEN** the Data Models list is rendered
- **THEN** each model is displayed as a single row with the model name and a database icon
- **AND** no expand/collapse chevron or subtree is shown

## ADDED Requirements

### Requirement: Builder Side Panel Structure

The Builder page (`/$projectId/models`) SHALL render its left side panel with three sections, in order:

1. **Agent Scaffold** — containing two sub-entries: **Data Models** (the semantic model list, including the existing Publish control) and **API Models**, which SHALL be rendered greyed out with a "soon" tag and SHALL NOT be interactive.
2. **Build** — the builder chat conversation history with the new-chat ("+") control (the section formerly labeled "Chat"; routes under `/$projectId/models/chat/*` are unchanged).
3. **Improvements & Testing** — the improvements-and-failing-tests panel (see the `semantic-models` capability for its content requirements).

#### Scenario: Panel sections rendered

- **WHEN** the user opens the Builder page
- **THEN** the side panel shows the sections Agent Scaffold, Build, and Improvements & Testing in that order
- **AND** Agent Scaffold contains the Data Models list and a disabled API Models entry tagged "soon"

#### Scenario: Build section behaves like the former Chat section

- **WHEN** the user clicks "+" in the Build section or selects a past conversation
- **THEN** the chat opens at `/$projectId/models/chat/new` or `/$projectId/models/chat/:conversationId` exactly as before the rename

#### Scenario: API Models entry is inert

- **WHEN** the user clicks the API Models entry
- **THEN** nothing happens (no navigation, no selection)
- **AND** the entry is visually muted with a "soon" tag
