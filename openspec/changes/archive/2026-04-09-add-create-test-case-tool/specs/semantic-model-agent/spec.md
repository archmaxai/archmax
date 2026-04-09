## ADDED Requirements
### Requirement: Create Test Case Tool

The deep agent SHALL have access to a `create_test_case` tool that creates a test case document in MongoDB for the current project. The tool accepts `title` (string, required — short description of what is being tested), `semanticModel` (string, required — the semantic model name the test targets), `inputMessage` (string, required — the natural-language question to send to a test agent), and `expectedFacts` (array of strings, min 1 — factual assertions the agent's response must satisfy).

The tool SHALL automatically add "auto-generated" to the test case's `tags` array so that auto-generated cases are distinguishable from manually created ones. The test case SHALL be created without an assigned `testAgent` — users assign a test agent later through the UI before running a batch.

The agent's system prompt SHALL document the tool and instruct the agent to only create test cases when the user explicitly provides ground-truth facts or expected answers. The agent SHALL NOT invent expected facts from its own data exploration or query results. After completing validated queries, the agent SHALL ask the user if they want to create test cases and request user-supplied expected answers before proceeding.

#### Scenario: Agent creates a test case with user-provided facts
- **WHEN** the agent has finished writing a semantic model with datasets, relationships, and metrics
- **AND** the user provides ground-truth facts (e.g. "Total revenue for 2024 is 1.65 MEUR")
- **AND** the agent invokes `create_test_case` with `{ "title": "Total revenue 2024", "semanticModel": "ecommerce", "inputMessage": "What is the total revenue for 2024?", "expectedFacts": ["Total revenue for 2024 is 1.65 MEUR"] }`
- **THEN** a TestCase document is created in MongoDB with `project` set to the current project
- **AND** the `tags` array contains "auto-generated"
- **AND** the `testAgent` field is null (unassigned)

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
