# ADR-001: NestJS → Express Clean Architecture + DDD

## Status
Accepted

## Context
Pawmily needs a decoupled multiplatform API (web vet clinic + Android pet owner) with Supabase as PostgreSQL. The NestJS scaffold mixed framework concerns with domain logic and lacked validation, indexes, and tests.

## Decision
Rewrite the API in Express + TypeScript using Clean Architecture and DDD bounded contexts (Identity, Patients, Scheduling, Clinic). Auth is application JWT; Supabase is used only as the database host.

## Consequences
- Clear ports/adapters; Nest decorators removed
- Shared Patient aggregate for vet and owner roles
- Clients consume a stable `/api` contract with Bearer tokens
