FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
RUN npm ci --omit=optional --no-audit --no-fund \
  && npm --prefix client ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
