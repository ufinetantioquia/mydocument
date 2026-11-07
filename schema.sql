-- ============================================================================
-- ESQUEMA DE BASE DE DATOS RELACIONAL: CRONOGRAMA DE MOVILES Y MOTORIZADOS
-- Compatible con PostgreSQL / SQLite / MySQL (Normativa Laboral Colombia CST)
-- ============================================================================

-- 1. TABLA: FLOTA (Moviles y Motorizados)
CREATE TABLE IF NOT EXISTS flota (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,       -- Ej: 'Movil O&M Taraza', 'Moto O&M Medellin 1'
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Camioneta', 'Moto')),
    color VARCHAR(20) DEFAULT '#2b7bff',
    zona_base VARCHAR(100) NOT NULL,            -- Ej: 'Taraza', 'Apartado', 'Medellin'
    personal_requerido INT NOT NULL DEFAULT 3,  -- Camionetas (3-4), Motos (1)
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: ACTIVIDADES / VISITAS TECNICAS CON REGULACION LABORAL COLOMBIA
CREATE TABLE IF NOT EXISTS actividades (
    id SERIAL PRIMARY KEY,
    movil_id INT NOT NULL REFERENCES flota(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    franja VARCHAR(10) NOT NULL CHECK (franja IN ('AM', 'PM', 'DIA')),
    tipo_actividad VARCHAR(10) NOT NULL CHECK (tipo_actividad IN ('P', 'C', 'E', 'M', 'R', 'A', 'D', 'O')),
    estado VARCHAR(2) NOT NULL DEFAULT 'p' CHECK (estado IN ('p', 'c', 'h', 'b')),
    -- 'p' = Pendiente, 'c' = En curso, 'h' = Hecha, 'b' = Bloqueada
    hora_inicio TIME NOT NULL DEFAULT '08:00',
    hora_fin TIME NOT NULL DEFAULT '12:00',
    duracion_horas NUMERIC(4, 2) NOT NULL DEFAULT 4.0,
    -- Desglose Normativa Laboral Colombia (CST Art. 159-168 y Ley 2101 de 2021)
    horas_ordinarias NUMERIC(4, 2) NOT NULL DEFAULT 4.0,      -- Maximo 8h/dia
    horas_extras_diurnas NUMERIC(4, 2) NOT NULL DEFAULT 0.0,   -- HED (+25%, 06:00-21:00)
    horas_extras_nocturnas NUMERIC(4, 2) NOT NULL DEFAULT 0.0, -- HEN (+75%, 21:00-06:00)
    excede_tope_diario BOOLEAN GENERATED ALWAYS AS ((horas_extras_diurnas + horas_extras_nocturnas) > 2.0) STORED,
    descripcion TEXT NOT NULL,
    zona VARCHAR(100),
    nodo_tramo VARCHAR(100),
    ticket_ot VARCHAR(50),
    prioridad VARCHAR(20) DEFAULT 'Normal' CHECK (prioridad IN ('Baja', 'Normal', 'Alta', 'Critica')),
    responsable VARCHAR(120),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_actividad_franja UNIQUE (movil_id, fecha, franja)
);

-- 3. TABLA: ASISTENCIA DE PERSONAL (Control Diario de Cuadrillas)
CREATE TABLE IF NOT EXISTS asistencia_personal (
    id SERIAL PRIMARY KEY,
    movil_id INT NOT NULL REFERENCES flota(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    personal_requerido INT NOT NULL,
    personal_presente INT NOT NULL CHECK (personal_presente >= 0),
    estado_dotacion VARCHAR(30) NOT NULL DEFAULT 'Completa' CHECK (
        estado_dotacion IN ('Completa', 'Incapacidad', 'Permiso', 'Vacaciones', 'Capacitacion', 'Apoyo', 'Vacante')
    ),
    integrantes TEXT,                           -- Nombres de los tecnicos presentes hoy
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_asistencia_diaria UNIQUE (movil_id, fecha)
);

-- 4. TABLA: OPERATIVIDAD VEHICULAR (Dias que las camionetas dejan de trabajar)
CREATE TABLE IF NOT EXISTS operatividad_vehicular (
    id SERIAL PRIMARY KEY,
    movil_id INT NOT NULL REFERENCES flota(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    estado_operativo VARCHAR(30) NOT NULL DEFAULT 'Operativa' CHECK (
        estado_operativo IN ('Operativa', 'Taller', 'Varada', 'Sin_Personal', 'Pico_Placa', 'Descanso')
    ),
    dejo_de_trabajar BOOLEAN GENERATED ALWAYS AS (estado_operativo != 'Operativa') STORED,
    causa_inactividad VARCHAR(255),            -- Ej: 'Mantenimiento preventivo 20.000 km'
    observaciones TEXT,                        -- Taller asignado, tiempo estimado
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_operatividad_diaria UNIQUE (movil_id, fecha)
);

-- 5. TABLA: TICKETS DE FALLA Y PARADAS DE RELOJ (TIEMPOS MUERTOS)
CREATE TABLE IF NOT EXISTS tickets_fallas (
    id SERIAL PRIMARY KEY,
    numero_ticket VARCHAR(50) NOT NULL UNIQUE, -- Ej: 'TIK-20322201-G8N8'
    id_ufinet VARCHAR(50),                     -- Ej: 'COCOUNE10092132C'
    cliente VARCHAR(150),                      -- Ej: 'UNE EPM TELECOMUNICACIONES S.A. (Millicom)'
    cliente_final VARCHAR(150),                -- Ej: 'JERONIMO MARTINS'
    contacto_sitio VARCHAR(120),
    telefono_contacto VARCHAR(50),
    direccion TEXT,
    coordenadas VARCHAR(60),
    nodo VARCHAR(100),                         -- Ej: 'ANC - Anconsur'
    equipo_acceso VARCHAR(100),                -- Ej: 'COANAMAGTDSCPITRC01'
    puerto_interfaz VARCHAR(80),               -- Ej: 'nni2'
    tipo_falla VARCHAR(80) DEFAULT 'Corte Fibra',
    hora_inicio_falla TIMESTAMP NOT NULL,
    hora_llegada_sitio TIMESTAMP,
    hora_fin_falla TIMESTAMP,
    movil_id INT REFERENCES flota(id) ON DELETE SET NULL,
    diagnostico TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paradas_reloj (
    id SERIAL PRIMARY KEY,
    ticket_id INT NOT NULL REFERENCES tickets_fallas(id) ON DELETE CASCADE,
    hora_inicio TIMESTAMP NOT NULL,
    hora_fin TIMESTAMP NOT NULL,
    motivo VARCHAR(100) NOT NULL,              -- Permiso acceso, Clima, Tramite cliente
    detalle TEXT,
    duracion_minutos INT GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (hora_fin - hora_inicio)) / 60
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDICES DE RENDIMIENTO PARA REPORTES Y DASHBOARD
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_actividades_fecha ON actividades(fecha);
CREATE INDEX IF NOT EXISTS idx_actividades_movil_fecha ON actividades(movil_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asistencia_fecha ON asistencia_personal(fecha);
CREATE INDEX IF NOT EXISTS idx_operatividad_fecha ON operatividad_vehicular(fecha);
CREATE INDEX IF NOT EXISTS idx_tickets_numero ON tickets_fallas(numero_ticket);

-- ============================================================================
-- VISTA ANALITICA: METRICAS MENSUALES DE FLOTA Y HORAS EXTRAS
-- ============================================================================
CREATE OR REPLACE VIEW vista_kpis_mensuales AS
SELECT 
    TO_CHAR(a.fecha, 'YYYY-MM') AS periodo,
    f.nombre AS movil,
    f.tipo AS tipo_unidad,
    COUNT(a.id) AS total_visitas,
    SUM(CASE WHEN a.estado = 'h' THEN 1 ELSE 0 END) AS visitas_hechas,
    SUM(CASE WHEN a.estado = 'b' THEN 1 ELSE 0 END) AS visitas_bloqueadas,
    ROUND(SUM(a.duracion_horas), 1) AS horas_totales,
    ROUND(SUM(a.horas_ordinarias), 1) AS total_horas_ordinarias,
    ROUND(SUM(a.horas_extras_diurnas), 1) AS total_hed_25,
    ROUND(SUM(a.horas_extras_nocturnas), 1) AS total_hen_75,
    SUM(CASE WHEN a.excede_tope_diario THEN 1 ELSE 0 END) AS dias_exceso_tope_cst
FROM flota f
LEFT JOIN actividades a ON f.id = a.movil_id
GROUP BY periodo, f.nombre, f.tipo;
