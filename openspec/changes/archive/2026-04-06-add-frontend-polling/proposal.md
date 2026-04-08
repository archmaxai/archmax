# Change: Add periodic polling for dynamic frontend data

## Why
Several data sources in the frontend can change without user-initiated mutations — conversation titles are generated asynchronously, semantic models are written by the AI agent, and projects/connections may be modified in other tabs or sessions. Without polling, the UI shows stale data until a hard refresh or window re-focus.

## What Changes
- Add `refetchInterval` directly to TanStack Query hooks for projects, connections, semantic models, and conversation lists
- Each query defines its own interval inline — no shared config module, keeping polling behavior colocated with the data it governs

## Impact
- Affected specs: `spa-architecture`
- Affected code: `apps/frontend/src/` — query hooks in route components and shared components
