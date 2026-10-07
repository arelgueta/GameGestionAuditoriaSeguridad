# CiberJunta

Plataforma web multijugador, en español, con **7 dinámicas de clase de Seguridad de Sistemas** para la carrera de Gestión de Negocios Digitales. Cada grupo es la _junta directiva_ de su startup: el juego no enseña a atacar sistemas, enseña a **decidir, priorizar, presupuestar y comunicar** riesgos como gerentes.

> ⚖ Casos y marcas ficticias con fines educativos. Verificar normativa vigente.

- El docente proyecta una pantalla general (como Kahoot) y controla el ritmo desde su notebook.
- Los grupos juegan desde un celular o notebook, sin registrarse: código de 6 caracteres o QR.
- Todo lo producido (decisiones, textos, puntajes) se exporta en **CSV y JSON** para corregir con la rúbrica.
- El contenido de cada dinámica está en archivos JSON editables en [`content/`](content/).

| Dinámica                                 | Duración | Qué trabajan                                                                         |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| **Phish or Fish**                        | ~50 min  | Reconocer ingeniería social (12 mensajes) y diseñar una campaña de concientización   |
| **Crisis Room: el lunes del ransomware** | ~60 min  | Comité de crisis con 9 noticias urgentes; confianza del mercado                      |
| **La subasta de controles**              | ~50 min  | Matriz de riesgos, subasta de controles con 100 cibercoins y dados de incidentes     |
| **Escape room: la oficina comprometida** | ~40 min  | 8 fallas cotidianas, 8 letras, 1 candado                                             |
| **El Boardroom 2.0**                     | ~45 min  | Contratar un pentest con presupuesto, traducir un hallazgo a negocio, giros de trama |
| **Shadow IT y la IA del empleado**       | ~50 min  | Inventario, due diligence de herramientas de IA y política semáforo                  |
| **El juicio de la filtración**           | ~80 min  | Soporte para un juicio simulado: expediente, oradores, preguntas, jurado y titular   |

---

## Desplegar en Render en 5 pasos

1. Hacer **fork** de este repositorio en GitHub (o usar el original si tienen acceso).
2. En [Render](https://render.com), ir a **New → Blueprint**.
3. Elegir el repositorio. Render lee el archivo [`render.yaml`](render.yaml) y propone un Web Service llamado `ciberjunta`.
4. Confirmar con **Deploy Blueprint**. Render instala, compila y genera solo la variable secreta `HOST_PIN_SALT`.
5. Abrir la URL pública (`https://ciberjunta-xxxx.onrender.com`). Si `/healthz` responde `{"ok":true}`, está listo.

Cada `push` a `main` vuelve a desplegar automáticamente.

### ⚠ Plan gratuito de Render: leer antes de la clase

Datos verificados en la [documentación de Render](https://render.com/docs/free) (octubre de 2026):

- El servicio **se duerme tras 15 minutos sin tráfico** (pedidos HTTP o mensajes WebSocket) y **tarda alrededor de un minuto en despertar**. 👉 **Abran la URL unos 5 minutos antes de la clase.** Durante la partida no se duerme porque los dispositivos mantienen la conexión activa.
- Hay **750 horas gratuitas por mes por workspace**; si se consumen, el servicio se suspende hasta el mes siguiente.
- Los WebSockets funcionan en el plan gratuito.
- Las sesiones viven **en memoria**: un reinicio o redeploy **borra las sesiones activas**. Por eso:
  - **Exporten los resultados al terminar** (botones CSV / JSON del panel docente). Se puede exportar en cualquier momento.
  - El panel docente guarda en el navegador una copia del último estado; si el servidor se reinició, al volver a abrir el panel aparece “Descargar CSV (copia local)”.
- Persistencia opcional: si configuran `DATABASE_URL` (por ejemplo, una base PostgreSQL de Render), las sesiones sobreviven a los reinicios. Ojo: **la base gratuita de Render vence a los 30 días** y tiene 1 GB; para uso continuo conviene un plan pago o una base externa.

### Variables de entorno

| Variable              | Default    | Uso                                           |
| --------------------- | ---------- | --------------------------------------------- |
| `PORT`                | 3001       | Render la define sola                         |
| `NODE_ENV`            | —          | `production` en Render                        |
| `HOST_PIN_SALT`       | (generada) | Sal secreta para el hash de los PIN docentes  |
| `SESSION_TTL_MINUTES` | 240        | Minutos sin actividad hasta borrar una sesión |
| `DATABASE_URL`        | vacío      | Opcional: PostgreSQL para persistir sesiones  |

---

## Cómo se juega (todas las dinámicas)

1. **Docente:** _Soy docente_ → elegir dinámica → PIN de 4 dígitos (no lo compartan) → ajustar duraciones → **Crear sesión**.
2. Abrir **Pantalla proyectada** (botón del panel) en el proyector: muestra el código grande y el QR.
3. **Grupos:** escanean el QR o entran a _Soy grupo_, escriben el código, el nombre del grupo y el de su startup (roles opcionales, solo apodos). Un dispositivo por grupo.
4. El docente toca **Iniciar dinámica** y avanza con **Siguiente fase**. Puede pausar, sumar o restar minutos, ver las respuestas de cada grupo en vivo, **proyectar 90 s** la respuesta de un grupo y quitar grupos duplicados.
5. Si un grupo recarga la página o se le corta la conexión, vuelve automáticamente a su estado.
6. Al final: debriefing en la pantalla proyectada y **Exportar CSV/JSON**.

Si cierran el panel docente, se puede retomar desde _Soy docente → Retomar una sesión existente_ con el código y el PIN.

### Phish or Fish (~50 min)

- **Preparación:** ninguna. Ideal como apertura de la unidad de ingeniería social.
- **Fases:** Mini OSINT (3′) → Concurso de 12 rondas (25 s para PHISH/FISH + 15 s para la señal clave; el docente lanza cada ronda) → Campaña (20′) → Galería y votación → Cierre con regla de oro.
- **Puntaje:** +100 por acierto, +50 por la señal correcta, hasta +50 por velocidad.
- **Preguntas para el debriefing:** ¿Qué datos de Lucía usó el atacante en la ronda 8? ¿Qué señal se repite en casi todos los PHISH? ¿Por qué premiar al que reporta funciona mejor que castigar al que hace clic? ¿Cómo medirían el éxito de su campaña?

### Crisis Room: el lunes del ransomware (~60 min)

- **Preparación:** decidir si usan modo manual (botón “Siguiente inject”) o automático (uno cada 5′). Por defecto el efecto de cada decisión se oculta hasta el debriefing.
- **Mecánica:** 100 puntos de confianza; 9 injects; 4′ para decidir cada uno; sin decisión = −10; las decisiones son irreversibles. Cierre: comunicado de hasta 120 palabras y 5 cosas que debían tener listas.
- **Preguntas:** ¿Quién debe hablar con la prensa y por qué uno solo? ¿Qué cambia con el aviso de 24 h del seguro? ¿Pagar o no pagar (inject 30, decisión debatible)? ¿Qué hubiera cambiado tener backups desconectados y probados?

### La subasta de controles (~50 min)

- **Preparación:** ninguna. Conviene haber visto matriz de riesgos.
- **Mecánica:** cada grupo tiene 100 cibercoins. El docente abre los lotes uno por uno (45 s; cada oferta extiende a 10 s como mínimo). Luego revela 6 incidentes: el servidor tira un dado por grupo (1–3 afecta). Puntaje = coins sin gastar + 100 − daños + bonus.
- **Preguntas:** ¿Qué riesgo dejaron sin cubrir y por qué? ¿El grupo “con suerte” tuvo una buena estrategia? ¿Qué es mitigar, transferir, aceptar y evitar? ¿Qué comprarían distinto?

### Escape room: la oficina comprometida (~40 min)

- **Mecánica:** 30′ para encontrar las 8 fallas en la oficina, elegir el control correcto (cada error bloquea la zona 30 s), juntar las 8 letras y ordenarlas para abrir el candado. Desafío final: ¿cuál es la falla más urgente?
- **Preguntas:** ¿Cuántas de las 8 fallas se resuelven comprando tecnología? ¿Qué proceso falta en la empresa? ¿Cuál priorizarían con presupuesto cero?

### El Boardroom 2.0 (~45 min)

- **Mecánica:** Elegir proveedor de pentest con USD 12.000 (pueden pedir fondos con una justificación de 200+ caracteres) → traducir un hallazgo IDOR a impacto de negocio con calculadora de pérdida esperada → giro de trama (el docente toca “Repartir giros”) → regla de oro → presentación (usar “Proyectar 90 s”).
- **Preguntas:** ¿Por qué contratar a Hackers Shadow es un delito y no un ahorro? ¿Un escáner automático reemplaza a un pentest? ¿Cómo explicarían el IDOR al inversor en una oración? ¿Qué hacen ante una extorsión?

### Shadow IT y la IA del empleado (~50 min)

- **Mecánica:** inventario de 5 herramientas (Prohibir / Reemplazar / Permitir con reglas) → due diligence de 3 opciones de IA con calculadora de costos y 3 preguntas al proveedor → política semáforo con 12 usos y regla de responsabilidad.
- **Preguntas:** ¿Por qué la gente usa herramientas no autorizadas? ¿Qué pasa si solo prohíben? ¿Qué le preguntarían a un proveedor antes de firmar?

### El juicio de la filtración (~80 min)

- **Preparación:** asignar cada grupo a un equipo (AAIP, Defensa, Proveedor, Clientes, Jurado y prensa) desde el panel. Opción “dos juicios en paralelo” al crear la sesión.
- **Funciones:** expediente con pestañas y 7 pruebas (la 7.ª la libera el docente), temporizador de oradores, cola de preguntas cruzadas (2 por grupo) que se proyectan, alegato escrito, votación del jurado y titular con estética de diario. Cierre: 3 cláusulas para el contrato con el proveedor.
- **Preguntas:** ¿Quién es el responsable de la base aunque la aloje otro? ¿Qué debería haber dicho el contrato? ¿Cuánto daño agregaron los 21 días de demora?

---

## Rúbrica común (sobre 10)

| Criterio                    | Excelente (2,5)                                            | Suficiente (1,5)                      | Insuficiente (0,5)     |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------- | ---------------------- |
| Traducción a negocio        | Explica el riesgo en dinero, clientes y reputación         | Menciona el impacto sin cuantificarlo | Se queda en lo técnico |
| Justificación de decisiones | Fundamenta con datos y alternativas                        | Justifica parcialmente                | Decide sin fundamentar |
| Marco legal y ético         | Identifica normas (Ley 25.326, AAIP, Ley 26.388) y deberes | Las menciona sin aplicarlas           | No las considera       |
| Comunicación                | Clara, veraz, adaptada al público                          | Comprensible con imprecisiones        | Confusa o engañosa     |

El CSV exportado tiene una fila por grupo y por decisión (columnas `sesion, dinamica, grupo, startup, fase, item, respuesta, detalle, puntos`), lista para filtrar en una planilla.

---

## Editar el contenido

Todo el contenido está en [`content/`](content/) (un archivo JSON por dinámica). Los cambios se aplican a las **sesiones nuevas** sin reiniciar el servidor. Ver [CONTRIBUTING.md](CONTRIBUTING.md) para ejemplos (cambiar un inject, un mensaje del concurso, los precios de la subasta, etc.). Si un JSON tiene un error, al crear la sesión aparece un mensaje que indica el campo con problemas.

---

## Para desarrolladores

Requisitos: Node.js 22 o superior (recomendado 24, ver `.node-version`).

```bash
npm install
npm run dev          # servidor en :3001 y frontend en http://localhost:5173
npm test             # tests unitarios (Vitest)
npm run lint         # ESLint + Prettier
npm run typecheck
npm run build && npm start   # build de producción en http://localhost:3001
npx playwright install chromium && npm run test:e2e   # tests end-to-end
npm run load-test -- http://localhost:3001 15          # 15 grupos simultáneos
```

Estructura:

```
apps/server     Express + Socket.IO, motor de sesiones y las 7 dinámicas (games/*.ts)
apps/web        React + Vite + Tailwind (theme.ts = colores institucionales)
packages/shared tipos, esquemas zod, catálogo de dinámicas y contrato de sockets
content         JSON editables por el docente
docs            SPEC.md (especificación) y DECISIONES.md (decisiones tomadas)
e2e             tests de Playwright
```

- Cada dinámica es un módulo con la interfaz `GameModule` ([apps/server/src/engine/types.ts](apps/server/src/engine/types.ts)). El servidor es la única fuente de verdad para puntajes, dados y temporizadores; el reloj se pausa sin perder los plazos.
- El azar usa un generador con semilla; la semilla aparece en el panel y en la exportación JSON para auditar.
- Seguridad de la app: ver la página **“Cómo protegemos esta app”** (`/seguridad`) y [docs/DECISIONES.md](docs/DECISIONES.md).

## Licencia

[MIT](LICENSE)
