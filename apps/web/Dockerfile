FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/tokens/package.json packages/tokens/package.json

RUN npm install

COPY apps/web apps/web
COPY packages packages

WORKDIR /app/apps/web
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]

