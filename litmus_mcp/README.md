# Litmus MCP Server

Model Context Protocol (MCP) server for Litmus experiment intake, validation, routing, and submission.

## Overview

This MCP server allows AI assistants (Claude, ChatGPT, etc.) to:
- Draft experiment intakes from natural language
- Validate intakes against the schema
- Route experiments to best-fit labs
- Submit experiments and manage attachments

## Installation

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r litmus_mcp/requirements.txt
```

## Running the Server

```bash
# From project root
python -m litmus_mcp.src.server
```

Or configure it in your MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "litmus": {
      "command": "python",
      "args": ["-m", "litmus_mcp.src.server"],
      "cwd": "/path/to/litmus-project"
    }
  }
}
```

## Tools

### intake.draft_from_text
Convert natural language to a structured intake JSON.

```json
{
  "text": "I want to test if my new compound kills cancer cells",
  "experiment_type_hint": "CELL_VIABILITY_IC50"
}
```

### intake.validate
Validate an intake against the schema.

```json
{
  "intake": { ... },
  "strict": false
}
```

### intake.suggest_questions
Get questions to improve intake completeness.

```json
{
  "intake": { ... },
  "target_completeness": 0.7,
  "max_questions": 3
}
```

### routing.match_labs
Route an intake to best-fit labs.

```json
{
  "intake": { ... },
  "top_k": 3,
  "strict_deliverables": false,
  "region_preference": "US"
}
```

### labs.search
Search labs with filters.

```json
{
  "experiment_type": "CELL_VIABILITY_IC50",
  "max_bsl": "BSL2",
  "region": "US"
}
```

### labs.get
Get a specific lab profile.

```json
{
  "lab_id": "lab_cellassay_pro_001"
}
```

### intake.submit
Submit a validated intake.

```json
{
  "intake": { ... },
  "selected_lab_id": "lab_cellassay_pro_001"
}
```

### files.create_upload_url
Create a signed URL for file upload.

```json
{
  "filename": "compound_sds.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 102400
}
```

### files.attach_to_intake
Attach an uploaded file to a submission.

```json
{
  "submission_id": "sub_abc123",
  "file_id": "file_xyz789",
  "attachment_type": "SDS"
}
```

## Resources

The server exposes these resources:

- `litmus://schemas/experiment_intake` - Experiment intake JSON Schema
- `litmus://schemas/lab_profile` - Lab profile JSON Schema
- `litmus://taxonomy/deliverables` - Deliverables taxonomy
- `litmus://rubric/routing_weights` - Current routing weights

## Development

The server uses in-memory storage for submissions and files. In production, these would be backed by a database and object storage (S3/GCS).

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector python -m litmus_mcp.src.server
```
