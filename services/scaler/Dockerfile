FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json ./
# COPY package-lock.json ./
RUN npm install --prefer-offline --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3002
CMD ["npm","start"]
