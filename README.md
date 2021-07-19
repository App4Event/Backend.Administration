# app4event-backend

## Usage

- TODO Backend usage
- TODO firestore rules copy


- TODO description of entities is always stripped from html

### `a4e-createAdmin`

Run `a4e-createAdmin PROJECT USERNAME PASSWORD` to create account with this username and password in the given project.

- If user with USERNAME does not exist, it is created
- If user with USERNAME exists, their admin flag is set to TRUE but password is not changed (use `a4e-setPassword` to set the password of existing user)

### `a4e-setPassword`

Run `a4e-setPassword PROJECT USERNAME PASSWORD` to set user's password in the given project.

- If user with USERNAME does not exist, nothing happens (user `a4e-createAdmin` to create non-existing admin account)
- If user with USERNAME exists, their password is updated to PASSWORD

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
