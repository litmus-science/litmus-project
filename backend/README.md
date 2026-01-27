# Litmus Science Backend API

FastAPI implementation of the Litmus Science REST API.

## Overview

This backend implements the full OpenAPI specification (`api/openapi.yaml`) for the Litmus wet lab validation marketplace.

## Features

- **Experiment Management**: Create, list, update, cancel experiments
- **Results Handling**: Submit, approve, dispute experiment results
- **Validation**: Validate experiments and hypotheses before submission
- **Cost Estimation**: Get cost and turnaround estimates
- **Templates**: Browse and retrieve protocol templates
- **Operator Jobs**: Job listing, claiming, and result submission
- **Webhooks**: Test webhook endpoints
- **Authentication**: JWT Bearer tokens and API keys

## Installation

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

## Running the Server

```bash
# From project root
python -m backend.main

# Or with uvicorn directly
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## API Endpoints

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/register` | POST | Register new user |
| `/auth/token` | POST | Get access token |

### Experiments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/experiments` | POST | Create experiment |
| `/experiments` | GET | List experiments |
| `/experiments/{id}` | GET | Get experiment |
| `/experiments/{id}` | PATCH | Update experiment |
| `/experiments/{id}` | DELETE | Cancel experiment |

### Results

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/experiments/{id}/results` | GET | Get results |
| `/experiments/{id}/approve` | POST | Approve results |
| `/experiments/{id}/dispute` | POST | Dispute results |

### Validation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/validate` | POST | Validate experiment |
| `/validate/hypothesis` | POST | Validate hypothesis |
| `/estimate` | POST | Get cost estimate |

### Templates

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/templates` | GET | List templates |
| `/templates/{id}` | GET | Get template |

### Operators

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/operator/jobs` | GET | List available jobs |
| `/operator/jobs/{id}/claim` | POST | Claim job |
| `/operator/jobs/{id}/submit` | POST | Submit results |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/test` | POST | Test webhook |

## Authentication

The API supports two authentication methods:

### Bearer Token (JWT)

```bash
# Get token
curl -X POST "http://localhost:8000/auth/token" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'

# Use token
curl -H "Authorization: Bearer <token>" http://localhost:8000/experiments
```

### API Key

```bash
curl -H "X-API-Key: lk_your_api_key" http://localhost:8000/experiments
```

API keys are returned once at registration time. Store them securely.

## Rate Limits

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Standard | 100 | 1,000 |
| Pro | 1,000 | 10,000 |
| AI Agent | 500 | 5,000 |

## Example Usage

### Create an Experiment

```bash
curl -X POST http://localhost:8000/experiments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "experiment_type": "CELL_VIABILITY_IC50",
    "hypothesis": {
      "statement": "Compound X inhibits cell growth with IC50 < 10 μM"
    },
    "compliance": {
      "bsl": "BSL1"
    }
  }'
```

### Get Cost Estimate

```bash
curl -X POST http://localhost:8000/estimate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "experiment_type": "MIC_MBC_ASSAY"
  }'
```

### List Available Jobs (Operators)

```bash
curl http://localhost:8000/operator/jobs \
  -H "Authorization: Bearer <operator_token>"
```

## Database

The backend uses SQLite with async support for development. For production, configure PostgreSQL by updating the `DATABASE_URL` in `models.py`.

### Database Models

- **User**: User accounts (requesters and operators)
- **OperatorProfile**: Operator capabilities and verification
- **Experiment**: Experiment requests and status
- **ExperimentResult**: Submitted results
- **Dispute**: Dispute records
- **Template**: Protocol templates
- **FileUpload**: File upload records

## Development

### Project Structure

```
backend/
├── __init__.py
├── main.py          # FastAPI application and routes
├── models.py        # SQLAlchemy database models
├── schemas.py       # Pydantic request/response schemas
├── auth.py          # Authentication and authorization
├── requirements.txt # Python dependencies
└── README.md        # This file
```

### Running Tests

```bash
pytest tests/python/test_router.py -v
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | (insecure default) |
| `DATABASE_URL` | Database connection | `sqlite+aiosqlite:///./litmus.db` |

## Configuration

The backend is configured via environment variables. Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `LITMUS_SECRET_KEY` | Yes | JWT signing key (generate with `openssl rand -hex 32`) |
| `LITMUS_DATABASE_URL` | Yes | Database connection URL |
| `LITMUS_CORS_ORIGINS` | No | Comma-separated allowed origins |
| `LITMUS_DEBUG` | No | Enable debug mode (default: false) |

## Security Notes

### Production Checklist

Before deploying to production:

1. **Set `LITMUS_SECRET_KEY`** - Generate a secure random key: `openssl rand -hex 32`
2. **Never enable `LITMUS_DEBUG`** - It logs SQL queries and allows localhost CORS
3. **Configure `LITMUS_CORS_ORIGINS`** - Explicitly list your frontend domains
4. **Use PostgreSQL** - SQLite is for development only
5. **Enable HTTPS** - All API traffic must be encrypted
6. **Configure file storage** - Set up S3/GCS for uploads
7. **Set up monitoring** - Configure Sentry or similar for error tracking

### Rate Limiting

Rate limiting is enforced per API key/IP with these tiers:

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Standard | 100 | 1,000 |
| Pro | 1,000 | 10,000 |
| AI Agent | 500 | 5,000 |

For production with multiple server instances, configure Redis for distributed rate limiting.

### Webhook Security

When implementing webhook receivers, verify the signature using HMAC-SHA256:

```python
import hmac
import hashlib

def verify_webhook(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```
