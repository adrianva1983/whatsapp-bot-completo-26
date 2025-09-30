# Dockerfile - WhatsApp Baileys Bot (with Web Dashboard)
FROM node:20-alpine

# Configurar variables de entorno
ENV NODE_ENV=production

WORKDIR /app

# Instalar dependencias del sistema en una sola capa
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    mariadb-client \
    && rm -rf /var/cache/apk/*

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias con cache limpio
RUN npm ci --only=production

# Copiar el resto de archivos
COPY . .

# Crear directorio para auth con permisos correctos
RUN mkdir -p auth logs data && chmod 777 auth logs data

# Cambiar al usuario node por seguridad
USER node

EXPOSE 3000

CMD ["node", "app.js"]
