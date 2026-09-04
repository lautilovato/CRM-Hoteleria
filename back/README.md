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

## 🧪 Pruebas (Testing)

- **`npm run test`**
  Ejecuta la suite de pruebas unitarias del proyecto.

- **`npm run test:e2e`**
  Ejecuta las pruebas *End-to-End* (E2E) para simular el comportamiento real de la aplicación de principio a fin.