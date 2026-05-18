# Guía de Inicio Rápido para Desarrolladores (Getting Started)

Este anexo explica los pasos necesarios para instalar y ejecutar el proyecto en un entorno local. Incluye tanto la configuración del backend como la del frontend para poner en marcha el sistema completo de forma rápida y sencilla.

---

## 1. Repositorio de Código Fuente

El proyecto completo está disponible en un repositorio de GitHub, donde se encuentra tanto el frontend como el backend junto con toda la estructura del sistema.

Para descargar el proyecto en local, ejecuta el siguiente comando en tu terminal:

```bash
git clone https://github.com/Danielsl4/TFG_DAM_2526.git
```

> [!NOTE]
> Una vez clonado el repositorio, dispondrás de dos carpetas principales en el proyecto:
> * `backend` (referenciado en la memoria como `backend_tfg_2526`)
> * `frontend` (referenciado en la memoria como `frontend_tfg_2526`)

---

## 2. Requisitos Previos del Sistema

Antes de comenzar, asegúrate de tener instalado y configurado lo siguiente en tu equipo:

* **Node.js** (Versión 18 o superior)
* **npm** (Incluido automáticamente con Node.js)
* **Angular CLI** (Versión 20 o superior)
* **PostgreSQL** (Versión 15 o superior)
* **Redis Server** (Versión 6 o superior)
* **Cloudinary** (Cuenta activa para la gestión de imágenes)
* **Gmail** (Cuenta de correo activa para envío SMTP; *opcional en local*)

---

## 3. Configuración y Ejecución del Servidor (Backend)

El backend está desarrollado con **Node.js** y **Express**, y se encarga de procesar la lógica de negocio, la seguridad y la persistencia de datos.

### 3.1. Instalación de Dependencias

Navega al directorio del backend e instala las dependencias necesarias:

```bash
cd backend
npm install
```

### 3.2. Configuración del Archivo de Entorno (`.env`)

Crea un archivo llamado `.env` en la raíz del directorio `backend` con la siguiente estructura y reemplaza los valores de ejemplo con tus credenciales reales:

```env
PORT=3000
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/nombre_base_datos
JWT_SECRET=una_clave_secreta_larga_y_segura
REDIS_URL=redis://127.0.0.1:6379
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
EMAIL_USER=tu_correo@gmail.com
EMAIL_PASS=tu_contraseña_de_aplicacion
FRONTEND_URL=http://localhost:4200
```

> [IMPORTANTE]
> Recuerda configurar correctamente tu conexión de **PostgreSQL** en la variable `DATABASE_URL` y tener un servidor de **Redis** en ejecución en la dirección especificada en `REDIS_URL`.

### 3.3. Inicialización de la Base de Datos

Ejecuta el script de inicialización para crear automáticamente la estructura de la base de datos (tablas, relaciones y datos iniciales requeridos):

```bash
node init_db.js
```

### 3.4. Ejecución del Servidor

Inicia el servidor de desarrollo del backend:

```bash
npm start
```

El servidor backend quedará disponible en: [http://localhost:3000](http://localhost:3000)

---

## 4. Configuración y Ejecución del Cliente (Frontend)

El frontend está desarrollado sobre **Angular (v20)** bajo una arquitectura SPA (Single Page Application) reactiva e interactiva.

### 4.1. Instalación y Ejecución del Frontend

Navega a la carpeta del cliente e instala todos los paquetes necesarios:

```bash
cd ../frontend
npm install
```

### 4.2. Configuración del Entorno de Desarrollo

Asegúrate de que la configuración del entorno apunte a la API de tu servidor local. Edita el siguiente archivo:

📂 `src/environments/environment.development.ts`

Verifica o modifica su contenido para que coincida con el siguiente código:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'
};
```

### 4.3. Ejecución del Cliente Frontend

Ejecuta el servidor de desarrollo de Angular:

```bash
npm start
```

La aplicación web estará disponible y lista en tu navegador en: [http://localhost:4200](http://localhost:4200)

### 4.4. Acceso a la Aplicación

> [!TIP]
> Una vez que ambos servidores (backend y frontend) estén corriendo en tu máquina local, podrás acceder al sistema completo desde tu navegador. Podrás interactuar con los diferentes perfiles definidos (Espectador, Árbitro y Administrador) utilizando las credenciales de prueba o registrando nuevas cuentas de usuario.
