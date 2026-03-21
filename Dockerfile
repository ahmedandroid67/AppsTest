# Use the official Playwright image which includes Node.js and browser dependencies
FROM mcr.microsoft.com/playwright:v1.50.1-noble

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Create reports and screenshots directory (ensuring an empty report.json exists)
RUN mkdir -p /app/reports/screenshots && echo "[]" > /app/reports/report.json && chmod -R 777 /app/reports

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HEADLESS=true

# Expose the server port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
