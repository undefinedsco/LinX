# LinX

Your AI secretary for user-owned memory.

**LinX is an AI-native second brain built on Solid Pods.**

It gives users a chat-first workspace where AI can understand, organize, and act on shared memory while keeping data under the user's control.

LinX is designed around one product idea:

- AI should feel like a secretary, not just a chatbot
- memory should belong to the user, not be trapped in SaaS silos
- chat should be the primary interface to personal knowledge and work
- the same experience should run across web, desktop, and mobile

## Why LinX

- **AI secretary experience**: LinX is built to help users think, organize, and act through an always-available AI companion
- **User-owned memory**: shared memory lives in Solid Pods instead of opaque app databases
- **Chat-first interaction**: users manage information and tasks through conversation rather than scattered forms and screens
- **Cross-device continuity**: one product surface across web, desktop, and mobile
- **Pod-native architecture**: data, identity, permissions, and AI workflows are designed around Solid from the start

## What LinX Feels Like

### 1. Your AI Secretary

LinX is not meant to be just another chat UI.

The core experience is closer to having an AI secretary that:

- remembers context over time
- helps organize incoming information
- can work through your data with permission
- stays aligned with your interests and boundaries

### 2. Shared Memory Between You and AI

LinX treats the Pod as shared memory between the user and AI.

That means the assistant can work with:

- profile and identity data
- conversations and notes
- files and attachments
- structured memory and retrieval data
- future app-specific resources stored in the Pod

### 3. One Interface for Humans, AI, and Data

LinX aims to reduce context switching.

Instead of spreading conversations, memory, and tools across unrelated apps, LinX brings them into one AI-native interface.

### 4. Privacy by Architecture

LinX is built on the idea that AI becomes more useful when it knows more about you, but that only works if users remain in control.

Solid Pods and Pod-native access patterns are not just implementation details. They are part of the trust model.

## Product Direction

LinX sits at the user-facing layer of the broader stack.

- **Xpod** provides the Pod runtime, identity, and service infrastructure
- **drizzle-solid** provides typed Pod data access through the models layer
- **LinX** provides the end-user product experience across devices

In practice, LinX is the front door.

It turns Pod-native storage, identity, and AI services into something users can actually use every day.

## Current Focus

The current milestone is focused on onboarding and first-use experience:

- connecting a Solid Pod
- loading profile and basic user data
- giving the user a default AI companion
- exposing controlled shared memory to that AI
- preparing the foundation for discoverable models and services

## Core Experience Areas

### Chat

A conversation-first interface for interacting with AI and, over time, other people and agents.

### Memory

Shared memory that lets the assistant understand relevant user context rather than treating every conversation as stateless.

### Files and Data

Pod-native access to the user's files, structured data, and future app resources.

### Discover

A place to connect model providers, self-hosted endpoints, and future ecosystem capabilities.

### Settings

Settings are designed to stay aligned with the Pod and platform architecture rather than becoming a disconnected app-local preference system.

## Platform Scope

LinX is intended to feel like one product across multiple form factors.

### Web

The main product surface and fastest iteration environment.

### Desktop

An Electron shell for local-first and workstation-style use.

### Mobile

A Capacitor shell for lightweight continuity without rebuilding the product separately for mobile.

## Architecture at a Glance

LinX is a product layer, not a standalone backend.

### UI Layer

- React + Vite web app
- shared UI patterns across platforms
- chat-first product flows

### Models Layer

- repository-based access through `packages/models`
- Pod reads and writes go through structured models
- UI should not reach directly into low-level Solid dataset APIs

### Pod / Service Layer

- Solid identity and session handling
- xpod-compatible APIs and Pod services
- model providers and AI backends

## Tech Stack

- **Web**: React, TypeScript, Vite
- **Desktop**: Electron
- **Mobile**: Capacitor
- **Data**: `drizzle-solid` + `drizzle-orm` through `@linx/models`
- **Solid**: `@inrupt/solid-client`, auth libraries, common vocab packages
- **AI UI**: Chat-oriented components and streaming integration

## Quick Start

### Requirements

- Node.js 22+
- Yarn 1.x

### Install

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 yarn install
```

### Start Web

```bash
yarn workspace @linx/web dev
```

### Build Web

```bash
yarn workspace @linx/web build
```

### Run Tests

```bash
yarn test:unit
yarn test:e2e
```

## Workspace Structure

- `apps/web` — main React/Vite product
- `apps/desktop` — Electron shell
- `apps/mobile` — Capacitor shell
- `packages/models` — Pod data models and repositories
- `packages/shared-ui` — reusable UI components
- `packages/utils` — shared helpers
- `tests/unit` — unit tests
- `tests/integration/playwright` — integration and parity tests

## Development Principles

- use the models layer for structured Pod access
- do not access Solid datasets directly from UI code
- keep product behavior aligned across web, desktop, and mobile
- treat AI features as part of the product workflow, not as isolated demos

## Non-Goals

LinX is not trying to be:

- a generic note app with an LLM bolted on
- a pure cloud chat client disconnected from user-owned data
- a file browser for raw Pod internals
- a developer tool first and user product second

Its goal is to make AI-native personal memory feel useful, trustworthy, and daily.

## Documentation

- `design/product-definition.md` — product positioning and vision
- `docs/linx-xpod-design.md` — LinX and Xpod layering and division of responsibilities
- `docs/local-pod-design.md` — local Pod and desktop deployment ideas
- `docs/architecture.md` — system architecture overview
- `docs/ui-pages.md` — UI page inventory
- `docs/service-layer-guide.md` — service layer conventions

## License

Private / internal workspace
