# CodeSwarm Docker Image
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/
COPY templates/ ./templates/

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy necessary files from builder
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/templates/ ./templates/

# Create directory for configuration
RUN mkdir -p /app/.mehaisi

# Set environment variables
ENV NODE_ENV=production
ENV CODESWARM_HOME=/app

# Expose no ports (CLI tool)
# Volumes for persistent data
VOLUME ["/app/.mehaisi"]

# Entry point
ENTRYPOINT ["node", "src/codeswarm.js"]
CMD ["--help"]

# Labels
LABEL maintainer="CodeSwarm Team"
LABEL description="Multi-agent AI orchestration system using SONA architecture"
LABEL version="1.0.0"
