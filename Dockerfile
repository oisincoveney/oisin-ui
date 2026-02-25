FROM node:22-bookworm

WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    tini \
    tmux && \
  npm install -g bun && \
  rm -rf /var/lib/apt/lists/*

COPY . .

RUN bun install

RUN chmod +x scripts/start.sh

ENV PASEO_HOME=/config
ENV PASEO_LISTEN=0.0.0.0:6767
ENV PASEO_CORS_ORIGINS=http://localhost:44285,http://127.0.0.1:44285,http://0.0.0.0:44285

EXPOSE 6767
EXPOSE 44285

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "./scripts/start.sh"]
