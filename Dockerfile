# Use official Node.js LTS image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy benchmark script
COPY index.js .

# Expose ports (9091 API, 9092 metrics)
EXPOSE 9091 9092

# Set default command to run the benchmark
CMD ["node", "index.js"]
