# Solid Login Example

This is the original Next.js implementation of Solid Pod authentication for LinX, preserved as a learning example for new developers.

## Overview

This example demonstrates how to:
- Authenticate with Solid Pod using `@inrupt/solid-ui-react`
- Handle authentication callbacks
- Query Solid profile data using `drizzle-solid`
- Manage session state and restore previous sessions

## Key Components

- `app/page.tsx` - Main welcome page with login form
- `app/auth/callback/page.tsx` - Authentication callback handler
- `shared/auth/solid-session-provider.tsx` - Session management
- `modules/profile/profile-card.tsx` - Profile display component

## Tech Stack

- React 18
- @inrupt/solid-client-authn-browser
- @inrupt/solid-client  
- drizzle-solid for SPARQL queries
- shadcn/ui components
- Tailwind CSS

## Usage

This example is part of the LinX monorepo and uses shared dependencies. From the **root directory**:

```bash
# Install all monorepo dependencies (only needed once)
yarn install

# Start the example development server
yarn workspace solid-login-example dev

# Build the example
yarn workspace solid-login-example build
```

This is a standalone React + Vite example showing core Solid authentication patterns. The components are framework-agnostic and can be easily adapted to any React application.

### Key Components

- `WelcomePage.tsx` - Main login interface with Solid issuer selection
- `AuthCallback.tsx` - Handles authentication callback and redirects
- `App.tsx` - Simple example showing how to integrate the components

### Integration

To use these components in your own project:

1. Copy the `components/` directory
2. Install the required Solid dependencies
3. Wrap your app in `SessionProvider`
4. Use the components with your router of choice

## Learning Points

1. **Session Management**: How to handle Solid authentication lifecycle
2. **Profile Queries**: Using drizzle-solid to query WebID profile data
3. **Error Handling**: Graceful handling of authentication failures
4. **Multi-Platform Support**: Configuration for web, desktop, and mobile redirects

## Migration Notes

The new TanStack Router implementation should preserve the same authentication flow but with improved type safety and better data management through TanStack Query.