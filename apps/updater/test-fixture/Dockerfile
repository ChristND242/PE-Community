FROM node:22-alpine
WORKDIR /app
COPY service.mjs /app/service.mjs
COPY prisma.mjs /app/node_modules/prisma/build/index.js
CMD ["node", "/app/service.mjs"]
