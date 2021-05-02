

compile latest spec before you do anything

1. compile yaml to json (yaml is better for human writing, json schema can be passed to ajv for validation)
`npx openapi-generator-cli generate -i src/app4event/openapi.yaml -g openapi -o src/generated/openapi`

2. compile yaml to ts interfaces
`npx openapi-typescript src/app4event/openapi.yaml --output src/generated/types/openapi.ts`