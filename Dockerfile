# Multi-stage build for Litmus (Python backend + TypeScript router)
FROM node:18-slim AS builder

WORKDIR /app

# Install Node dependencies and build TypeScript
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY router/ ./router/
RUN npm run build

# Production image
FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ ./backend/
COPY api/ ./api/
COPY schemas/ ./schemas/

# Copy built TypeScript (if needed at runtime)
COPY --from=builder /app/router/ ./router/

# Set environment
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Start the server (Railway provides PORT env var)
CMD python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
