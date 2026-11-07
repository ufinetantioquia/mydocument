# Cronograma de moviles y motorizados O&M — Telecomunicaciones y Horas Extras (Colombia)

Dashboard interactivo y prototipo a **costo cero** para la gestión técnica de operaciones y mantenimiento (O&M) en redes de fibra óptica y telecomunicaciones. Incluye programación visual de visitas, control de asistencia diaria de cuadrillas, inoperatividad vehicular de la flota, control de jornadas y horas extras bajo la **Normativa Laboral Colombiana (CST / Ley 2101)**, y gestión de fallas críticas con **Paradas de Reloj (Tiempos Muertos)** y generador de plantillas para **WhatsApp**.

---

## 📌 Módulos y Pestañas del Sistema

1. **1. Cronograma y Visitas:**
   - Programación de actividades en franjas AM, PM y Día Completo con horario de inicio, fin y duración calculada.
   - Seguimiento visual por estados: Pendiente, En curso, Hecha y Bloqueada.
   - Carga inicial simulada de noviembre 2026 con 339 actividades en 7 unidades operativas (5 camionetas y 2 motos).

2. **2. Asistencia de Personal:**
   - Registro de técnicos requeridos vs. presentes por cuadrilla.
   - Novedades de personal: Dotación completa, Incapacidad médica EPS, Permiso/calamidad, Vacaciones, Capacitación y Apoyo.
   - Matriz mensual y gráfico de tendencia diaria.

3. **3. Inoperatividad de Camionetas (Días que dejan de trabajar):**
   - Monitoreo de disponibilidad de la flota: Operativa, Taller mecánico, Varada en ruta, Sin cuadrilla, Pico y placa o Descanso dominical.
   - Matriz diaria de estado de vehículos y acumulado de días trabajados vs. parados.

4. **4. Estadísticas y Horas Extras (Normativa Laboral Colombia CST / Ley 2101):**
   - **Jornada Ordinaria:** Máximo 8 horas/día (42 horas semanales según Ley 2101 de 2021).
   - **Horas Extras Diurnas (HED):** 06:00 a 21:00 con recargo legal del +25%.
   - **Horas Extras Nocturnas (HEN):** 21:00 a 06:00 con recargo legal del +75%.
   - **Auditor de Topes Legales:** Alertas automáticas cuando una jornada supera el límite legal de 2 horas extras diarias o 12 horas semanales por trabajador (CST Art. 22 Ley 50/1990).
   - Métricas de duración promedio, franjas horarias y actividades bloqueadas.

5. **5. Plantilla Ticket y Paradas de Reloj (Tiempos Muertos y WhatsApp):**
   - Formulario técnico para tickets de falla crítica de fibra óptica (ej. `TIK-20322201-G8N8` Ufinet / Millicom / Jerónimo Martins en nodo `ANC - Anconsur`).
   - Registro de **Hora de Inicio de la Falla**, **Hora de Llegada a Sitio** y **Hora de Restablecimiento**.
   - **Gestión de Paradas de Reloj:** Registro de eventos justificados que detienen el cronómetro de atención (permisos de acceso a predios, lluvias/tormentas eléctricas, trámites con cliente final, cierres de vía o falta de energía comercial).
   - **Cálculo de Tiempos:** Tiempo Bruto Total vs. Sumatoria de Tiempos Muertos y **Tiempo Neto de Atención O&M**.
   - **Generador de Plantilla WhatsApp:** Vista previa en tiempo real con formato listo y botón **"📋 Copiar plantilla WhatsApp"** para reportar novedades directamente a grupos operativos de WhatsApp.

---

## 🚀 Arquitectura y Persistencia a Costo Cero en GitHub

- **Alojamiento Gratuito 24/7:** Despliegue estático en **GitHub Pages**.
- **Base de Datos del Repositorio (`datos_cronograma.json`):** Almacena la flota, las 339 actividades, 210 registros de asistencia, 210 registros de vehículos y la configuración del ticket con paradas de reloj.
- **Persistencia Local (`localStorage`):** Cada edición, cambio de estado o adición de parada de reloj se guarda de forma persistente e inmediata en el navegador.
- **Descarga y Respaldo:** El botón **"Respaldar JSON"** permite exportar la base de datos completa para guardarla en el repositorio.
- **Exportación Excel Multiuso:** Genera un archivo `.xlsx` estructurado en 5 hojas analíticas (`Cronograma_Mensual`, `Actividades_Detalladas`, `Personal_Diario`, `Inoperatividad_Flota` y `Horas_Extras_y_Estadisticas`).
- **Esquema Relacional SQL (`schema.sql`):** Código SQL listo para PostgreSQL/SQLite con tablas normalizadas (`flota`, `actividades`, `asistencia_personal`, `operatividad_vehicular`, `tickets_fallas`, `paradas_reloj`) y vista analítica de KPIs.

---

## 📁 Estructura del Proyecto

- `index.html` — Estructura principal con las 5 pestañas de navegación y modales de gestión.
- `styles.css` — Estilos visuales optimizados para escritorio y móviles con gráficas nativas.
- `app.js` — Lógica completa de negocio, cálculo de horas ordinarias/extras CST, control de paradas de reloj y generador de plantilla WhatsApp.
- `cronograma_unico_google_ai.html` — Versión autocontenida todo-en-uno que funciona sin conexión con solo hacer doble clic.
- `datos_cronograma.json` — Base de datos JSON semilla y de respaldo.
- `schema.sql` — Esquema de base de datos relacional para despliegues con backend SQL.
- `.nojekyll` — Instrucción para GitHub Pages.

---

## 🌐 Publicación en GitHub Pages (Paso a Paso)

1. En tu cuenta de GitHub, crea un nuevo repositorio público (ej. `cronograma-moviles-EGM`).
2. Sube todos los archivos del proyecto a la rama principal (`main`).
3. Ve a **Settings** → **Pages** (menú lateral).
4. En **Build and deployment** → **Source**, selecciona `Deploy from a branch`.
5. En **Branch**, selecciona `main`, carpeta `/ (root)` y haz clic en **Save**.
6. En segundos tu aplicación estará activa en:
   `https://<tu-usuario>.github.io/<tu-repositorio>/`
