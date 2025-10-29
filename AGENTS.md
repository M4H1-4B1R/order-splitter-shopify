# AGENTS.md

## Build/Lint/Test Commands

- `npm run lint` - Run ESLint (fix lint errors first)
- `npm run typecheck` - Run TypeScript checks
- `npm run build` - Build production bundle
- `npm run dev` - Start development server (use `--use-localhost` if tunnel fails)

## Code Style Guidelines

- Use React Router v6 patterns for routing
- Prefer ESM imports over CommonJS
- Follow Shopify Polaris design system
- Use TypeScript for type safety
- Keep component logic minimal, move complex logic to hooks/utils
- Use consistent naming: camelCase for variables, PascalCase for components
- Handle errors gracefully with proper error boundaries
- Avoid console.log in production code
