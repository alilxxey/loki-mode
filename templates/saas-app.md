# PRD: SaaS Application

## Overview
A modern SaaS web application with user authentication, subscription billing, team management, and an admin dashboard.

## Target Users
- Indie developers launching subscription-based products
- Small teams needing a billing-ready web application
- Founders validating a SaaS idea quickly

## Core Features
1. **User Authentication** - Email/password signup and login with session management and email verification
2. **OAuth Integration** - Sign in with Google and GitHub for frictionless onboarding
3. **Subscription Billing** - Stripe integration with Free, Pro, and Enterprise pricing tiers
4. **Admin Dashboard** - User management, subscription metrics, revenue analytics, and system health monitoring
5. **User Settings** - Profile editing, password changes, avatar upload, and plan management
6. **Team Management** - Invite members by email, assign roles (owner, admin, member), manage permissions
7. **API Layer** - RESTful API with authentication middleware, rate limiting, and input validation

## Technical Requirements
- Next.js 14 with App Router and TypeScript
- TailwindCSS with shadcn/ui components
- Prisma ORM with PostgreSQL
- NextAuth.js v5 for authentication
- Stripe SDK for payment processing
- Server-side rendering for authenticated pages
- Middleware-based route protection

## Quality Gates
- Unit tests for business logic and utilities (Vitest)
- API integration tests for auth flow and billing webhooks
- E2E tests for signup, subscribe, and cancellation flow (Playwright)
- All API routes validated with zod schemas
- Stripe webhook signature verification
- CSRF protection on all mutations

## Success Metrics
- User can sign up, verify email, and log in via email or OAuth
- Subscription checkout and cancellation work end-to-end
- Admin dashboard displays accurate user and revenue data
- Role-based access control enforced on all routes
- All tests pass with zero console errors
