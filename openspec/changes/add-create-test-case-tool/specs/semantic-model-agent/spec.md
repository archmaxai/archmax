## ADDED Requirements
### Requirement: Create Test Case Tool

The deep agent SHALL have access to a `create_test_case` tool that creates a test case document in MongoDB for the current project. The tool accepts `title` (string, required — short description of what is being tested), `semanticModel` (string, required — the semantic model name the test targets), `inputMessage` (string, required — the natural-language question to send to a test agent), and `expectedFacts` (array of strings, min 1 — factual assertions the agent's response must satisfy).

The tool SHALL automatically add "auto-generated" to the test case's `tags` array so that auto-generated cases are distinguishable from manually created ones. The test case SHALL be created without an assigned `testAgent` — users assign a test agent later through the UI before running a batch.

The agent's system prompt SHALL document the tool and encourage the agent to generate 3–5 test cases after completing a semantic model (after validated queries), covering common question patterns: simple lookups, filtered aggregations, cross-dataset joins, and metric-based questions.

#### Scenario: Agent creates a test case after building a model
- **WHEN** the agent has finished writing a semantic model with datasets, relationships, and metrics
- **AND** the agent invokes `create_test_case` with `{ "title": "Total revenue 2024", "semanticModel": "ecommerce", "inputMessage": "What is the total revenue for 2024?", "expectedFacts": ["Revenue is calculated using SUM of orders.total_amount", "Only orders from 2024 are included"] }`
- **THEN** a TestCase document is created in MongoDB with `project` set to the current project
- **AND** the `tags` array contains "auto-generated"
- **AND** the `testAgent` field is null (unassigned)

#### Scenario: Agent creates multiple test cases covering different patterns
- **WHEN** the agent generates test cases for a model with orders, customers, and products datasets
- **THEN** the test cases cover a variety of question types: simple lookups ("How many orders exist?"), filtered aggregations ("Revenue by status for Q1 2024"), cross-dataset joins ("Top 10 customers by spend"), and metric expressions ("What is the average order value?")
- **AND** each test case has at least one expected fact

#### Scenario: Invalid input rejected
- **WHEN** the agent invokes `create_test_case` with an empty `expectedFacts` array
- **THEN** the tool returns an error indicating at least one expected fact is required
- **AND** no TestCase document is created

#### Scenario: Auto-generated tag always present
- **WHEN** the agent invokes `create_test_case` for any test case
- **THEN** the resulting TestCase always includes "auto-generated" in its `tags` array regardless of any other tags provided
