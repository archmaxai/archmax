## ADDED Requirements

### Requirement: List Test Agents Tool

The deep agent SHALL have access to a `list_test_agents` tool that returns all non-deleted test agents for the current project. The tool accepts no parameters. It SHALL return a JSON array of objects, each containing `id` (string), `name` (string), `semanticModels` (array of strings), and `llmModel` (string). The API key and system prompt SHALL NOT be included in the response.

The agent's system prompt SHALL document the tool and instruct the agent to call `list_test_agents` before creating test cases so it can offer the user the option to assign an existing agent. If no agents exist, the agent SHALL inform the user that test cases will be created without an assigned agent and suggest creating one through the Testing UI.

#### Scenario: Agent lists test agents for the project

- **WHEN** the agent invokes `list_test_agents`
- **AND** the project has two non-deleted test agents
- **THEN** the tool returns a JSON array with two entries, each containing `id`, `name`, `semanticModels`, and `llmModel`
- **AND** no API key or system prompt data is included

#### Scenario: No test agents exist

- **WHEN** the agent invokes `list_test_agents`
- **AND** the project has no test agents
- **THEN** the tool returns an empty JSON array
- **AND** the agent informs the user that test cases will be created without an assigned agent

### Requirement: List Test Cases Tool

The deep agent SHALL have access to a `list_test_cases` tool that returns existing test cases for the current project. The tool accepts an optional `semanticModel` parameter to filter results by model name. It SHALL return a JSON array of objects, each containing `id` (string), `title` (string), `semanticModel` (string), `inputMessage` (string), `expectedFactsCount` (number), `tags` (array of strings), and `testAgent` (object with `id` and `name`, or null). The agent's system prompt SHALL instruct the agent to call `list_test_cases` before creating new test cases to review existing coverage and avoid duplicates.

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

### Requirement: Delete Test Case Tool

The deep agent SHALL have access to a `delete_test_case` tool that soft-deletes a test case by ID. The tool accepts `testCaseId` (string, required). It SHALL validate that the test case exists and belongs to the current project before deleting. If the test case does not exist or belongs to a different project, the tool SHALL return an error. On success, the tool SHALL return the deleted test case's ID and title. The agent's system prompt SHALL instruct the agent to use `list_test_cases` first to find the ID before deleting.

#### Scenario: Agent deletes a test case

- **WHEN** the agent invokes `delete_test_case` with a valid `testCaseId` belonging to the current project
- **THEN** the test case is soft-deleted
- **AND** the tool returns the deleted test case's ID and title

#### Scenario: Test case not found

- **WHEN** the agent invokes `delete_test_case` with a `testCaseId` that does not exist or belongs to a different project
- **THEN** the tool returns an error indicating the test case was not found
- **AND** no test case is deleted

## MODIFIED Requirements

### Requirement: Create Test Case Tool

The deep agent SHALL have access to a `create_test_case` tool that creates a test case document in MongoDB for the current project. The tool accepts `title` (string, required), `semanticModel` (string, required), `inputMessage` (string, required), `expectedFacts` (array of strings, min 1), and `testAgentId` (string, optional). When `testAgentId` is provided, the tool SHALL validate that the referenced test agent exists and belongs to the current project before creating the test case. If the agent does not exist or belongs to a different project, the tool SHALL return an error. When `testAgentId` is omitted, the test case SHALL be created without an assigned agent (existing behavior).

The tool SHALL automatically add "auto-generated" to the test case's `tags` array so that auto-generated cases are distinguishable from manually created ones.

The agent's system prompt SHALL document the tool and instruct the agent to only create test cases when the user explicitly provides ground-truth facts or expected answers. The agent SHALL NOT invent expected facts from its own data exploration or query results. Before creating test cases, the agent SHALL call `list_test_agents` to check for available agents and present the options to the user. If agents exist, the agent SHALL ask the user which agent to assign. If no agents exist, the agent SHALL proceed without assignment and inform the user.

#### Scenario: Agent creates a test case with an assigned agent

- **WHEN** the agent has called `list_test_agents` and the user selects agent "GPT-4o Agent" (id: "abc123")
- **AND** the user provides ground-truth facts
- **AND** the agent invokes `create_test_case` with `{ "title": "Total revenue 2024", "semanticModel": "ecommerce", "inputMessage": "What is the total revenue for 2024?", "expectedFacts": ["Total revenue for 2024 is 1.65 MEUR"], "testAgentId": "abc123" }`
- **THEN** a TestCase document is created with `testAgent` set to the referenced agent
- **AND** the `tags` array contains "auto-generated"

#### Scenario: Agent creates a test case without an agent when none exist

- **WHEN** the agent has called `list_test_agents` and the result is empty
- **AND** the user provides ground-truth facts
- **AND** the agent invokes `create_test_case` without `testAgentId`
- **THEN** a TestCase document is created with `testAgent` set to null
- **AND** the agent informs the user that a test agent can be assigned later through the Testing UI

#### Scenario: Invalid test agent ID rejected

- **WHEN** the agent invokes `create_test_case` with a `testAgentId` that does not exist or belongs to a different project
- **THEN** the tool returns an error indicating the test agent was not found
- **AND** no TestCase document is created

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
