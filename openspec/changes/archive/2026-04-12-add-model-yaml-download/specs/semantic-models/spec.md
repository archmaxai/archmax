## ADDED Requirements

### Requirement: Model YAML Download

The admin UI SHALL provide a download button on the model visualization page that downloads the full assembled YAML for the currently viewed semantic model. The button SHALL be placed to the right of the pill tabs (Graph / Tree / YAML). The pill tabs SHALL be horizontally centered in the toolbar. The downloaded file SHALL be named `<modelName>.yaml` and contain the output of the existing assembled YAML endpoint.

#### Scenario: User downloads assembled YAML

- **WHEN** a user clicks the download button on a semantic model's visualization page
- **THEN** the browser downloads a file named `<modelName>.yaml`
- **AND** the file contains the full assembled YAML (merged root + dataset files) as returned by `GET /api/projects/:projectId/semantic-models/:name/yaml`

#### Scenario: Pill tabs are centered with download button on the right

- **WHEN** a user views the model visualization page
- **THEN** the pill tabs (Graph, Tree, YAML) are horizontally centered in the toolbar
- **AND** the download button is positioned to the right of the centered pills
