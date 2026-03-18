# PRD: REST API Service

## Overview
A production-ready RESTful API backend with authentication, CRUD operations, pagination, filtering, rate limiting, and comprehensive documentation.

## Target Users
- Backend developers building API-first applications
- Teams needing a structured API for frontend or mobile clients
- Developers learning REST API best practices

## Core Features
1. **Authentication** - JWT-based auth with access and refresh tokens, password hashing with bcrypt
2. **Resource CRUD** - Full create, read, update, delete operations with proper HTTP methods and status codes
3. **Pagination and Filtering** - Cursor-based pagination, field filtering, sorting, and search across resources
4. **Rate Limiting** - Per-endpoint and per-user rate limits with configurable windows and limits
5. **Input Validation** - Request body and query parameter validation with detailed error messages
6. **API Documentation** - Auto-generated OpenAPI/Swagger documentation with interactive testing
7. **Error Handling** - Consistent error response format with appropriate HTTP status codes

## Technical Requirements
- Node.js with Express and TypeScript
- Prisma ORM with SQLite (dev) / PostgreSQL (prod)
- JSON Web Tokens for stateless authentication
- Express middleware architecture
- Environment-based configuration
- Structured logging with request correlation IDs
- Database migrations and seed data

## Quality Gates
- Unit tests for middleware, validators, and business logic
- Integration tests for all API endpoints
- Authentication flow tested end-to-end
- Rate limiter tested under concurrent requests
- OpenAPI spec validates against schema
- No N+1 query issues in list endpoints

## Success Metrics
- All CRUD endpoints return correct status codes and response shapes
- JWT auth flow works: register, login, refresh, logout
- Pagination returns correct pages with proper metadata
- Rate limiter blocks excessive requests with 429 responses
- Swagger UI serves interactive documentation
- All tests pass
