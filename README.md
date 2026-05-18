# Plataforma de Gestión para Torneos de 24 Horas

Este repositorio contiene la solución completa para la automatización, gestión y visualización en tiempo real de maratones y torneos deportivos de 24 horas. La plataforma cuenta con una arquitectura moderna desacoplada en dos capas principales: frontend y backend.

---

## 🚀 Características Principales

El sistema ofrece soporte integral para todo el ciclo operativo de un maratón deportivo, proporcionando funcionalidades específicas para tres perfiles clave:

* **Público y Participantes**: Consulta en tiempo real de clasificaciones de grupos, calendarios de partidos, estadísticas individuales (goleadores, tarjetas) y participación interactiva en pronósticos deportivos (Porra 1X2).
* **Árbitros**: Panel optimizado para dispositivos móviles para el registro rápido de eventos (goles, tarjetas) y control de actas oficiales a pie de campo.
* **Administradores**: Control total sobre temporadas, registro y validación de plantillas de equipos, configuración de grupos, creación y programación de partidos y calendarios, auditoría de actividad del sistema y herramientas de mantenimiento.

---

## 🛠️ Stack Tecnológico

La arquitectura de la solución se basa en tecnologías robustas y de alto rendimiento:

* **Frontend**: [Angular (v20)](https://angular.dev) con arquitectura SPA reactiva mediante *Signals*, estilos modernos con [Bootstrap 5](https://getbootstrap.com) (diseño responsive), notificaciones interactivas con *SweetAlert2* y generación de documentos oficiales del torneo con *jsPDF*.
* **Backend**: [Node.js](https://nodejs.org) con [Express](https://expressjs.com), exponiendo una API REST robusta protegida con *JSON Web Tokens (JWT)*, encriptación mediante *Bcrypt* y control anti-abuso con *Rate Limiting*.
* **Bases de Datos**: 
  * **PostgreSQL** para la persistencia relacional íntegra de la estructura del torneo.
  * **Redis** como caché de baja latencia en memoria para el rendimiento inmediato de clasificaciones y marcadores en vivo.
* **Servicios Externos**: 
  * **Cloudinary** para el almacenamiento y distribución optimizada de escudos y fotografías.
  * **Nodemailer (SMTP)** para la comunicación transaccional (verificación de cuentas y restablecimiento de contraseña).

---

## 📂 Estructura del Repositorio

El repositorio está dividido en dos directorios principales:

* [**`backend/`**](backend): Servidor Express y API REST de la aplicación.
* [**`frontend/`**](frontend): Aplicación cliente SPA en Angular.

---

## ⏱️ Guía de Inicio Rápido (Getting Started)

Para desplegar y configurar este proyecto en tu entorno local, consulta la documentación detallada:

👉 [**Guía de Inicio Rápido (`GETTING_STARTED.md`)**](GETTING_STARTED.md)

Esta guía te proporcionará los comandos paso a paso para la instalación de dependencias, variables de entorno necesarias (`.env`), inicialización de bases de datos relacionales y la puesta en marcha de ambos entornos locales.
