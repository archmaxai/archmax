## MODIFIED Requirements

### Requirement: Automatic Repository Initialization

Each project's data directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) SHALL be a Git repository. If the `.git` directory does not exist when a Git operation is attempted, the system SHALL initialize it with `git init`, create a `.gitignore` (excluding internal/runtime entries — `large_tool_results/`, `duckdb.db` and its side files, and temp artifacts), and create an initial commit with all existing files. The `.gitignore` SHALL NOT exclude `build/` (the build step is removed and no such directory is produced); `data_models/` and the agent-scaffold directories are versioned as source.

#### Scenario: New project gets a Git repo

- **WHEN** a new project is created
- **THEN** the project directory is initialized as a Git repository
- **AND** a `.gitignore` file is created excluding `large_tool_results/`, `duckdb.db*`, and `.*tmp` patterns (and not `build/`)
- **AND** an initial commit is created if any files exist

#### Scenario: Existing project without Git repo (migration)

- **WHEN** a publish or sync is attempted on a project that lacks a `.git` directory
- **THEN** the system initializes the repository with all existing files as an initial commit
- **AND** subsequent operations proceed normally
