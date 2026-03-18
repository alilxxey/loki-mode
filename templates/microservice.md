# PRD: Microservice

## Overview
A containerized microservice with health checks, structured logging, graceful shutdown, and observability. Follows twelve-factor app principles for cloud-native deployment.

## Target Users
- Backend engineers building distributed systems
- Teams decomposing monoliths into microservices
- DevOps engineers designing cloud-native architectures

## Core Features
1. **HTTP API** - RESTful endpoints with request validation, error handling, and content negotiation
2. **Health Checks** - Liveness and readiness probe endpoints for container orchestration
3. **Structured Logging** - JSON-formatted logs with correlation IDs, log levels, and context fields
4. **Graceful Shutdown** - Handle SIGTERM/SIGINT with connection draining and cleanup
5. **Configuration** - Environment-variable-based configuration with validation on startup
6. **Database Integration** - Connection pooling, migrations, and repository pattern for data access
7. **Observability** - Prometheus metrics endpoint with request duration, error rate, and custom counters

## Technical Requirements
- Node.js with Express and TypeScript
- Docker and docker-compose for local development
- Prisma ORM with PostgreSQL
- Prometheus client for metrics
- pino for structured logging
- Dockerfile with multi-stage build
- Health check middleware

## Quality Gates
- Unit tests for business logic and middleware
- Integration tests with test database
- Docker image builds and starts successfully
- Health check endpoints return correct status codes
- Graceful shutdown completes within timeout
- Metrics endpoint serves valid Prometheus format

## Success Metrics
- Service starts in Docker and responds to API requests
- Health probes return healthy status after startup
- Logs are valid JSON with correlation IDs across requests
- Graceful shutdown drains connections without dropping requests
- Prometheus can scrape metrics endpoint
- All tests pass
