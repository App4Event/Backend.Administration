FROM node:20-slim AS build

RUN npm install -g openapi-typescript@7.5.1 typescript

COPY firestore.yaml /src/openapi.yaml

RUN openapi-typescript /src/openapi.yaml -o /index.ts

FROM scratch

COPY --from=build /index.ts /firestore-schema.ts
ENTRYPOINT [ "/firestore-schema.ts" ]
