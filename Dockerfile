# --- Stage 1: Build the React frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

# Copy frontend packages and lock file
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source files
COPY frontend/ ./

# Build the React frontend
RUN npm run build

# --- Stage 2: Final runner image ---
FROM python:3.11-slim AS runner
WORKDIR /app

# Set environment variables
ENV PORT=8080
ENV FLASK_DEBUG=0
ENV PYTHONUNBUFFERED=1

# Copy requirements and install python packages
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files and pre-computed data
COPY app.py ./
COPY data/ ./data/

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 8080

# Run Flask application using Gunicorn
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT} --timeout 120 --workers 2"]
