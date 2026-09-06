# Comandos Principales del Proyecto

Este documento contiene la guía de los comandos más utilizados para el desarrollo, gestión de contenedores, base de datos y ejecución de pruebas del proyecto.

## 🚀 Inicio de la Aplicación

- **`npm start dev`**
  Inicia la aplicación en modo desarrollo. (El servidor se reiniciará automáticamente si hay cambios en el código).

## 🐳 Docker (Contenedores)

- **`docker-compose up -d`**
  Levanta los servicios y contenedores definidos en el archivo `docker-compose.yml` en segundo plano (*detached mode*). Normalmente se usa para levantar la base de datos y otras dependencias locales.

- **`docker-compose down -v`**
  Detiene y elimina los contenedores, redes y **volúmenes** (`-v`). *Atención: esto borrará todos los datos almacenados en los volúmenes de la base de datos local.*

## 🗄️ Base de Datos (MikroORM)

- **`npx mikro-orm migration:create`**
  Analiza las entidades de tu código y genera un nuevo archivo de migración con los cambios detectados para la base de datos.

- **`npx mikro-orm migration:up`**
  Ejecuta todas las migraciones pendientes para actualizar el esquema de la base de datos al estado más reciente.

## 🌐 Webhook de Mercado Pago (ngrok)

- **`ngrok http 3000`**
  Levanta un túnel público hacia el backend local (puerto 3000), necesario para que Mercado Pago pueda entregar las notificaciones del webhook (`/payment/webhook`) durante el desarrollo local.

  Pasos para probar pagos localmente:
  1. Iniciá la aplicación (`npm start dev`).
  2. Corré `ngrok http 3000` y copiá la URL pública `https://...ngrok-free.dev` que te muestra.
  3. Pegá esa URL en la variable `APP_BASE_URL` del archivo `.env`.
  4. Configurá `https://<tu-url-de-ngrok>/payment/webhook` como notification URL en el panel de Mercado Pago (sección **Webhooks** de tu aplicación).
  5. Reiniciá la aplicación para que tome el nuevo `APP_BASE_URL`.

## 🧪 Pruebas (Testing)

- **`npm run test`**
  Ejecuta la suite de pruebas unitarias del proyecto.

- **`npm run test:e2e`**
  Ejecuta las pruebas *End-to-End* (E2E) para simular el comportamiento real de la aplicación de principio a fin.