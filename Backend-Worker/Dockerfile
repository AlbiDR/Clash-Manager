FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
CMD ["node", "index.js"]
