FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY src ./src
COPY public ./public
COPY data ./data
COPY scripts ./scripts
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
