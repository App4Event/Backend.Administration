# app4event-backend

## Usage

- TODO Backend usage
- TODO firestore rules copy
- todo make admin cli
## Development notes

### OpenAPI

Core TypeScript interfaces and runtime validation is derived from OpenAPI specification (see `src/app4event/openapi.yaml`). This is part of the build process.

### Build & compilation

Building this lib via `npm run build` consists of
1. compile yaml to json (yaml is better for human writing, json schema can be passed to ajv for validation)
`npx openapi-generator-cli generate -i src/app4event/openapi.yaml -g openapi -o src/generated/openapi`
2. compile yaml to ts interfaces
`npx openapi-typescript src/app4event/openapi.yaml --output src/generated/types/openapi.ts`
3. `tsc` compile typescript
