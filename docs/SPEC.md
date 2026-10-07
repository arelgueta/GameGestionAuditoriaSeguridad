# SPEC: "CiberJunta" – Plataforma de juegos de seguridad para gerentes

> Documento de especificación para **Claude Code**. Construir una aplicación web multijugador, en español, que convierta 7 dinámicas de clase de Seguridad de Sistemas (carrera de Gestión de Negocios Digitales) en juegos interactivos. El repositorio va a GitHub y se despliega en **Render**.
>
> Instrucción para Claude Code: leé este documento completo antes de escribir código. Guardalo en el repo como `docs/SPEC.md`. Trabajá por fases (sección 10), con commits pequeños y un `README.md` actualizado al final de cada fase. Si algo es ambiguo, elegí la opción más simple y dejala anotada en `docs/DECISIONES.md`.

---

## 1. Contexto pedagógico

- **Público:** estudiantes universitarios de Gestión de Negocios Digitales. **No** son perfiles técnicos ni de hacking ético. El juego nunca enseña a atacar sistemas: enseña a **decidir, priorizar, presupuestar y comunicar** riesgos como gerentes.
- **Escenario común:** cada grupo representa la "junta directiva" de su startup del TP Integrador.
- **Uso en clase:** el docente proyecta una pantalla general (como Kahoot) y los grupos juegan desde un celular o notebook por grupo.
- **Marco legal mencionado:** Ley 25.326 (Protección de Datos Personales, Argentina), AAIP (autoridad de control), Ley 26.388 (delitos informáticos), GDPR como referencia. El contenido es ficticio y educativo; agregar un aviso en la pantalla inicial: "Casos y marcas ficticias con fines educativos. Verificar normativa vigente."

## 2. Objetivos del producto

1. Que el docente cree una **sesión** en segundos, elija una dinámica y comparta un **código de 6 caracteres** + QR.
2. Que los grupos se unan sin registrarse (solo nombre de grupo y, opcionalmente, roles).
3. Que el docente controle el ritmo: iniciar, pausar, enviar giros de trama, cerrar fases, proyectar resultados.
4. Que al final se pueda **descargar todo lo producido** (decisiones, textos, puntajes) en CSV y JSON para evaluar con la rúbrica.
5. Que el contenido de cada dinámica esté en **archivos JSON editables** (`/content`), para que el docente modifique casos, preguntas y puntajes sin tocar código.

## 3. Stack técnico (obligatorio salvo justificación)

| Capa | Elección | Motivo |
| --- | --- | --- |
| Lenguaje | TypeScript en todo el proyecto | Tipos compartidos front/back |
| Backend | Node.js 20 + Express + Socket.IO | Tiempo real simple; Render soporta WebSockets |
| Frontend | React + Vite + Tailwind CSS | Rápido, liviano, mobile-first |
| Estado del juego | En memoria en el servidor (un `Map` de sesiones) | Sin base de datos para el MVP |
| Persistencia opcional | PostgreSQL de Render, detrás de una interfaz `Storage` | Activable por variable de entorno en fase posterior |
| Tests | Vitest (lógica de juego) + Playwright (un flujo end-to-end) | |
| Deploy | Un solo **Web Service** en Render que sirve API + sockets + build estático | Un servicio, un dominio, sin CORS |

Estructura de monorepo sugerida:

```
/
├─ apps/
│  ├─ server/          # Express + Socket.IO, motor de juego
│  └─ web/             # React + Vite
├─ packages/
│  └─ shared/          # tipos, esquemas zod, eventos de socket
├─ content/            # JSON de cada dinámica (editable por el docente)
├─ docs/
│  ├─ SPEC.md
│  └─ DECISIONES.md
├─ render.yaml
├─ package.json        # workspaces (npm o pnpm)
└─ README.md
```

### 3.1 Render

- Crear `render.yaml` (Blueprint) con un servicio `type: web`, `runtime: node`, `plan: free` (configurable), `buildCommand` que instale y compile ambos apps, `startCommand` que levante el server, y `healthCheckPath: /healthz`.
- Variables de entorno: `NODE_ENV`, `HOST_PIN_SALT` (generado), `SESSION_TTL_MINUTES` (default 240), `DATABASE_URL` (opcional).
- El servidor debe escuchar en `process.env.PORT`.
- Documentar en el README: en el plan gratuito el servicio "se duerme" tras inactividad y tarda en despertar; recomendar abrir la URL 5 minutos antes de la clase. Como el estado está en memoria, **un reinicio borra las sesiones activas**: por eso el docente debe poder exportar resultados en cualquier momento, y el front debe guardar en `localStorage` una copia del último estado recibido para poder reexportar.
- Verificar en la documentación actual de Render los límites del plan gratuito (horas, WebSockets, bases de datos) antes de cerrar el README; no asumir de memoria.

### 3.2 GitHub

- `.github/workflows/ci.yml`: instalar, lint (ESLint + Prettier), typecheck, tests en cada push y PR.
- Licencia MIT, `CONTRIBUTING.md` breve explicando cómo editar `/content`.
- Render se conecta al repo con auto-deploy desde `main`.

## 4. Roles y flujo general

### 4.1 Actores

- **Docente (host):** crea la sesión con un PIN de 4 dígitos que elige; solo quien tiene el PIN controla la sesión. Ve el **Panel de control** (en su notebook) y puede abrir la **Pantalla proyectada** en otra pestaña (vista de solo lectura, letra grande, sin datos de control).
- **Grupo:** se une con código de sesión + nombre de grupo. Opcionalmente asigna roles a sus integrantes (CEO, CFO, Legales, CTO, Comunicación) escribiendo solo nombres de pila o apodos. Un dispositivo por grupo.

### 4.2 Flujo

1. Inicio → "Soy docente" / "Soy grupo".
2. Docente: elige dinámica → configura (duraciones, cantidad de grupos esperada, modo de puntaje) → obtiene código + QR.
3. Grupos se unen y ven una sala de espera con el nombre de su startup.
4. Docente inicia; la dinámica corre por **fases** (máquina de estados por dinámica).
5. Al cerrar, pantalla de **debriefing** con resultados comparados y preguntas de cierre.
6. Exportar CSV/JSON.

### 4.3 Requisitos transversales

- **Reconexión:** si un grupo recarga la página, vuelve a su estado (token de grupo en `localStorage`).
- **Temporizadores** controlados por el servidor (fuente única de verdad); el cliente solo muestra.
- **Accesibilidad:** contraste AA, tamaño de tipografía legible al proyectar, navegación por teclado, no depender solo del color (los puntos positivos/negativos llevan signo e ícono).
- **Mobile-first** para los grupos; el panel docente pensado para notebook.
- **Idioma:** español rioplatense neutro en toda la interfaz ("ustedes", "elijan").
- **Sonidos opcionales** (campana al llegar un inject, tic-tac final), con botón de silencio.

## 5. Seguridad de la propia aplicación

Es un juego de seguridad: la app tiene que dar el ejemplo. Requisitos mínimos:

- No pedir ni guardar datos personales de estudiantes (sin mails, sin DNI). Solo nombres de grupo y apodos.
- Sanitizar y limitar longitud de todo texto libre (máx. 1.500 caracteres); renderizar siempre como texto, nunca como HTML.
- Validar todos los eventos de socket con esquemas `zod` en el servidor; descartar los inválidos.
- Rate limiting por socket (por ejemplo, 10 eventos/segundo) y por IP en la creación de sesiones.
- El PIN docente se guarda hasheado; las acciones de host requieren el token emitido al validarlo.
- Las sesiones expiran (`SESSION_TTL_MINUTES`) y se borran de memoria.
- Cabeceras de seguridad con `helmet`; Content Security Policy estricta.
- Sin trackers ni analytics de terceros.
- Agregar una página "Cómo protegemos esta app" en lenguaje simple (sirve como material didáctico).

## 6. Motor de juego

- Cada dinámica es un **módulo** que implementa una interfaz común:

```ts
interface GameModule<State, Config> {
  id: string;                      // "boardroom", "crisis", ...
  title: string;
  phases: PhaseDef[];              // orden y duración por defecto
  init(config: Config, content: unknown): State;
  onGroupAction(state: State, groupId: string, action: unknown): State;
  onHostAction(state: State, action: unknown): State;
  onTick?(state: State, now: number): State;
  publicView(state: State): unknown;           // pantalla proyectada
  groupView(state: State, groupId: string): unknown;
  hostView(state: State): unknown;
  exportRows(state: State): Record<string, unknown>[];
}
```

- La lógica de puntaje es **pura** (sin efectos), para testearla con Vitest.
- Los números aleatorios (dados, cartas) se generan **en el servidor**, con semilla registrada en el export para poder auditar.

## 7. Las 7 dinámicas: reglas y contenido

Todo el contenido de abajo debe vivir en `/content/<id>.json`. Las tablas son la fuente de verdad para crear esos JSON.

---

### 7.1 `boardroom` – El Boardroom 2.0 (prioridad media)

**Meta:** contratar un pentest con presupuesto limitado y traducir un hallazgo técnico a impacto de negocio.

**Fases:** Elegir proveedor (10') → Traducir hallazgo (10') → Giro de trama (5') → Regla de oro (5') → Presentación y debriefing.

**Fase 1 – Selección.** Presupuesto: **USD 12.000**. El grupo arma una "canasta" con estas opciones y la UI muestra en vivo el total y si se pasa del presupuesto:

| ID | Proveedor | Precio | Metodología | Entregables | Contrato |
| --- | --- | --- | --- | --- | --- |
| A | Hackers Shadow | USD 2.000 | "Entramos sin avisar para demostrar que podemos" | Reunión verbal, sin informe | Sin NDA ni alcance escrito |
| B-full | SecureAudit Corp (completo) | USD 15.000 | PTES, fases claras | Executive Summary + Technical Report + re-prueba a 30 días | NDA, alcance y reglas firmadas |
| B-web | SecureAudit Corp (solo app web + API) | USD 9.500 | Igual que B | Igual que B, alcance reducido | Igual que B |
| C | AutoScan AI Pro | USD 400/mes (calcular 12 meses = 4.800) | Escaneo automático | PDF genérico con muchos falsos positivos | Términos estándar |

Opción extra: botón "Pedir más fondos al inversor" que exige un texto de justificación (mín. 200 caracteres).

Campo obligatorio: memo al inversor (máx. 600 caracteres).

Retroalimentación automática al cerrar la fase (visible en el debriefing, no antes):
- Si incluye **A** → alerta roja: "Contratar a quien entra sin autorización es avalar un acceso indebido (Ley 26.388). Sin contrato no hay servicio, hay delito."
- Si eligió **solo C** → alerta amarilla: "Un escáner automático no es un pentest; difícilmente detecte fallos de lógica de negocio como el IDOR que viene en la próxima fase."
- **B-web**, **B-web + C**, o **B-full con pedido de fondos justificado** → verde.

**Fase 2 – Hallazgo.** Mostrar:

> Vulnerabilidad IDOR en `/api/v1/facturas/{id}`. Un usuario autenticado puede cambiar el número de ID en la URL y descargar facturas y datos personales de otros clientes. Verificada con 3 cuentas de prueba. La base tiene 18.000 clientes.

Con una explicación desplegable sin tecnicismos: "Es como un guardarropas donde, si cambiás el número de tu ficha, te dan el abrigo de otra persona."

Formulario: impacto en el negocio (texto), marco legal (checkboxes: Ley 25.326, AAIP, GDPR, Ley 26.388 + texto), urgencia (Crítico/Alto/Medio/Bajo + por qué), decisión gerencial (checkboxes: frenar lanzamiento, asignar horas extra, avisar al inversor, avisar a clientes, consultar a Legales + texto).

**Calculadora de pérdida esperada** interactiva con sliders:
- Clientes afectados (default 18.000)
- Costo por cliente afectado en USD (default 8)
- Probabilidad anual de explotación (default 40%)
- Horas para corregir (default 60) × costo hora (default USD 25)

Mostrar: pérdida anual esperada = clientes × costo × probabilidad (default **USD 57.600**) contra costo de corrección (default **USD 1.500**) y un gráfico de barras simple comparándolos.

**Fase 3 – Giro de trama.** El docente presiona "Repartir giros" y el servidor asigna una carta al azar a cada grupo (sin repetir mientras alcancen). El grupo responde en máx. 400 caracteres.

1. "Un usuario publicó en X que puede ver facturas ajenas. Tiene 300 retuits."
2. "El inversor pregunta por mail si el pentest encontró algo grave. Responden hoy."
3. "El CTO avisa que el dev que conoce ese código está de vacaciones 2 semanas."
4. "Hackers Shadow les escribe: 'encontramos lo de las facturas; por USD 5.000 no lo publicamos'." (En el debriefing: extorsión; no se negocia, se denuncia.)
5. "Un cliente grande exige por contrato un certificado de que sus datos están seguros."

**Fase 4 – Regla de oro** para la Política de Seguridad Aceptable: una oración (máx. 200 caracteres).

**Debriefing:** pantalla proyectada que muestra, grupo por grupo, canasta elegida, urgencia, regla de oro. El docente puede destacar un grupo ("modo presentación", 90 segundos con cuenta regresiva).

---

### 7.2 `crisis` – Crisis Room: el lunes del ransomware (prioridad ALTA, MVP)

**Meta:** comité de crisis en tiempo real. Empiezan con **100 puntos de "confianza del mercado"**.

**Mecánica:** el docente lanza los injects (botón "Siguiente inject") o activa el modo automático (uno cada 5 minutos). Cada inject llega con animación de "notificación urgente" y sonido. El grupo tiene **4 minutos** para elegir una opción y escribir una justificación breve (opcional, máx. 300 caracteres). Si no responde: "Sin decisión", **-10**. La decisión es irreversible.

Mostrar un **medidor de confianza** grande y una **bitácora** cronológica de decisiones. El puntaje de cada opción **no se muestra** hasta el debriefing (configurable: el docente puede activar "mostrar efecto inmediato").

| Min | Inject | Opciones (puntos) |
| --- | --- | --- |
| 0 | Atención al cliente no puede abrir ningún archivo. Aparece una nota que pide 3 BTC en 72 h. | A) Aislar equipos de la red y convocar al comité de crisis (+10) · B) Reiniciar todos los equipos (-20) · C) Esperar a ver si se resuelve solo (-15) · D) Pagar ya para terminar rápido (-25) |
| 5 | El CTO confirma: los backups del mismo servidor también están cifrados. Hay uno en la nube de hace 9 días. | A) Evaluar restaurar desde la nube y estimar qué se pierde en esos 9 días (+10) · B) Restaurar ya sin verificar que el backup esté limpio (-5) · C) Descartar el backup por viejo (-10) |
| 10 | Llama un periodista: "Me dicen que están hackeados, ¿confirman?" | A) Vocero único con mensaje breve y veraz (+10) · B) Negar todo (-15) · C) Explicar los detalles técnicos (-10) · D) "Sin comentarios" y cortar (-5) |
| 15 | Los atacantes publican una muestra con 50 DNI de clientes. | A) Asumir robo de datos, sumar a Legales, evaluar aviso a la AAIP y avisar a los afectados (+15) · B) Esperar a confirmar todo antes de avisar (-10) · C) No decir nada para no alarmar (-25) |
| 20 | El ciberseguro cubre hasta USD 50.000 pero exige aviso dentro de las 24 h. | A) Notificar a la aseguradora ahora (+10) · B) Avisar cuando esté resuelto (-20) |
| 25 | Un empleado admite que abrió el viernes un adjunto "factura pendiente". | A) Agradecer que lo cuente, sin culpa pública; analizar la causa y planificar capacitación (+10) · B) Despedirlo en el acto (-10) · C) Ignorarlo, no es prioridad (-5) |
| 30 | Los atacantes bajan el precio a 1,5 BTC "por 6 horas". | A) No pagar y seguir con la restauración (0) · B) Pagar (-10) · C) Consultar a Legales, aseguradora y especialistas antes de decidir (+5). **Marcar en el debriefing como "decisión debatible"**. |
| 35 | Un cliente grande amenaza con rescindir si no recibe un informe hoy. | A) Llamada del CEO con hechos confirmados (+10) · B) Mail genérico (-5) · C) Prometer que no se filtró nada (-15) |
| 40 | Restauración desde la nube: el 70% de los sistemas vuelve en 48 h. | A) Comunicado de avance con plan de retorno (+10) · B) Silencio hasta tener el 100% (-5) |

**Cierre del juego:** cada grupo escribe un **comunicado público** (máx. 120 palabras, contador visible) y una lista de **5 cosas que deberían haber tenido listas antes del lunes**.

**Debriefing proyectado:** ranking de confianza; línea de tiempo comparada de todos los grupos (una fila por grupo, color por efecto de la decisión); para el inject 30, gráfico de cuántos grupos eligieron cada opción y tarjetas con argumentos a favor y en contra del pago:
- En contra: no garantiza recuperar datos ni que no los publiquen; financia al crimen; marca a la empresa como "pagadora"; posibles problemas legales si el grupo atacante está sancionado.
- A favor (según quienes pagan): sin backup válido la empresa puede quebrar; el costo de estar parados puede superar al rescate.
- Lección: la decisión de pagar se gana o se pierde meses antes, al invertir (o no) en backups desconectados y probados.

Pregunta final proyectada: "¿Qué tendrían que haber tenido listo antes del lunes?" con nube de respuestas de los grupos.

---

### 7.3 `subasta` – La subasta de controles (prioridad ALTA, MVP)

**Meta:** asignar presupuesto escaso a controles de seguridad y ver qué pasa cuando llegan los incidentes.

**Fases:** Matriz de riesgos (10') → Subasta (15') → Incidentes (15') → Cierre.

**Fase 1 – Matriz:** el grupo carga 5 amenazas y las arrastra a una matriz 2×2 (probabilidad alta/baja × impacto alto/bajo).

**Fase 2 – Subasta en tiempo real.** Cada grupo tiene **100 cibercoins**. El docente abre un lote; hay un temporizador de 45 segundos que se reinicia a 10 segundos con cada nueva oferta (estilo subasta). Las ofertas suben de a 1 como mínimo. Si hay varias unidades, ganan las N ofertas más altas y cada ganador paga su propia oferta. No se puede ofertar más de lo que queda. Pantalla proyectada: lote actual, ofertas en vivo (nombre de grupo + monto), cuenta regresiva.

| Control | Unidades | Precio base | Protege contra |
| --- | --- | --- | --- |
| Backups desconectados y probados | 3 | 15 | Ransomware, borrado accidental |
| Doble factor de autenticación (MFA) | 3 | 10 | Robo de contraseñas, phishing de credenciales |
| Capacitación anual en phishing | 4 | 8 | Ingeniería social |
| Pentest anual | 2 | 20 | Fallos en la app (como el IDOR) |
| Ciberseguro | 2 | 15 | Reduce a la mitad la pérdida de cualquier incidente |
| Actualizaciones automáticas | 4 | 8 | Vulnerabilidades conocidas |
| Plan de respuesta a incidentes | 3 | 10 | +5 de reputación por cada incidente sufrido |
| Cifrado de notebooks | 3 | 6 | Robo o pérdida de equipos |
| Control de proveedores | 2 | 12 | Fallas de un SaaS o proveedor |

**Fase 3 – Incidentes.** El docente revela 6 cartas (al azar entre las 8, o elegidas manualmente). Para cada carta y cada grupo el servidor tira un dado de 6 caras: **1–3 el incidente los afecta**, 4–6 se salvan. Animación de dado en la pantalla proyectada (todos los grupos a la vez). Aplicar en este orden: control que anula → control que reduce a la mitad → ciberseguro (mitad del daño restante, redondeo hacia arriba del daño) → plan de respuesta (+5).

| Incidente | Daño | Anula | Reduce a la mitad |
| --- | --- | --- | --- |
| Ransomware por mail falso | -40 | Backups | Capacitación |
| Contraseña del CEO filtrada en otra web | -30 | MFA | — |
| Un cliente descubre que ve facturas ajenas | -35 | Pentest | — |
| Robo de notebook en un bar | -20 | Cifrado | — |
| Vulnerabilidad conocida en el servidor | -25 | Actualizaciones | — |
| Brecha en el proveedor de pagos | -30 | — | Control de proveedores |
| Transferencia de USD 10.000 a un "proveedor" falso | -25 | Capacitación | — |
| Caída de 3 días por incendio en el datacenter | -30 | — | Backups |

**Puntaje final** = cibercoins no gastados + 100 − daños + bonus de reputación.

**Debriefing:** ranking; tabla de qué compró cada grupo; destacar automáticamente al grupo "con suerte" (menos controles y poco daño por los dados) para hablar del sesgo "a nosotros no nos va a pasar"; tarjetas con las 4 respuestas al riesgo (mitigar, transferir, aceptar, evitar) y qué controles corresponden a cada una. Campo de reflexión: "¿Qué comprarían distinto?" (máx. 500 caracteres).

---

### 7.4 `juicio` – El juicio de la filtración (prioridad baja)

Esta dinámica es mayormente oral; la app es un **soporte**, no un juego automático.

**Caso "ModaYa SRL"** (mostrar como expediente digital con pestañas): tienda online mendocina con 40.000 clientes; guardaba nombres, DNI, direcciones y últimos 4 dígitos de tarjetas en un proveedor cloud económico. Un empleado del proveedor dejó un backup accesible públicamente 3 meses; un investigador lo reportó cuando ya circulaba en un foro. ModaYa avisó a sus clientes 21 días después, tras una nota periodística.

**Pruebas (una tarjeta cada una):**
1. Contrato con el proveedor: no menciona seguridad ni confidencialidad; limita la responsabilidad del proveedor a un mes de abono.
2. Base de datos no inscripta ante la AAIP.
3. Mail interno del gerente: "no gastemos en seguridad hasta tener más ventas".
4. Política de privacidad copiada de otra web, que menciona otro país.
5. Captura del foro donde se vendía la base (ilustración genérica, sin datos reales).
6. Testimonio de una clienta que recibió llamadas de estafa con sus datos reales.
7. (Prueba sorpresa, la libera el docente) Mail en el que el proveedor avisó del problema y nadie de ModaYa respondió.

**Equipos:** AAIP (acusa), Defensa de ModaYa, Proveedor cloud, Clientes afectados, Jurado y prensa. El docente asigna cada grupo a un equipo.

**Funciones de la app:** temporizador de oradores (alegato 3', preguntas, alegato final 2'), cola de preguntas cruzadas (cada equipo envía hasta 2 preguntas dirigidas a otro equipo; aparecen en pantalla), formulario de alegato escrito, **votación del jurado** (responsable principal, grado de responsabilidad 0–100% por parte, sanción o reparación sugerida), titular de prensa (máx. 100 caracteres) que se proyecta con estética de portada de diario. Modo "dos juicios en paralelo" para comparar veredictos.

**Cierre proyectado:** puntos clave (responsable de la base es quien decide recolectar los datos aunque los aloje otro; contratos con requisitos de seguridad y aviso de incidentes; inscribir la base e informar a titulares son deberes; demorar el aviso multiplica el daño reputacional). Campo final: 3 cláusulas para el contrato con el proveedor.

---

### 7.5 `phish` – Phish or Fish (prioridad ALTA, MVP)

**Meta:** concurso tipo Kahoot para reconocer ingeniería social y luego diseñar una campaña de concientización.

**Fase 0 – Mini OSINT (3'):** mostrar un perfil profesional **ficticio** de "Lucía Ferraro, Analista de Compras en TecnoAndes SA" (foto de avatar ilustrado, publicaciones sobre un viaje a Bariloche, nombre de su jefa, evento de la empresa). Cada grupo anota qué datos usaría un atacante.

**Fase 1 – Concurso (12 rondas).** Cada mensaje se renderiza con un **mockup realista** según su canal (SMS, mail, WhatsApp, LinkedIn, llamada como transcripción, QR en una foto de menú, audio como reproductor con transcripción). Usar **marcas inventadas**, nunca logos reales. Por ronda: 25 segundos para elegir PHISH o FISH, luego 15 segundos para elegir la señal clave entre 4 opciones.

Puntaje: +100 por acierto PHISH/FISH, +50 si además eligen la señal correcta, +0 a +50 de bonus por velocidad (lineal). Tras cada ronda, la pantalla proyectada muestra el reparto de respuestas y explica la señal.

| # | Canal | Mensaje | Respuesta | Señal correcta |
| --- | --- | --- | --- | --- |
| 1 | SMS | "Tu paquete de CorreoExpress no pudo entregarse, pagá $1.200 acá: bit.ly/…" | PHISH | Urgencia + pago pequeño + link acortado |
| 2 | Mail | Banco: "Recordá: nunca te vamos a pedir tu clave por mail." | FISH | No pide ninguna acción ni dato |
| 3 | WhatsApp | Número nuevo con foto del CEO: "Estoy en reunión, necesito que compres gift cards, después te explico." | PHISH | Autoridad + secreto + canal inusual |
| 4 | Mail | RRHH: "Tu recibo de sueldo ya está en el portal habitual." (sin adjuntos, dominio de siempre) | FISH | Canal y dominio habituales |
| 5 | Mail | Proveedor: "Cambiamos de cuenta bancaria, transferí a este nuevo CBU." | PHISH | Cambio de datos de pago (fraude BEC) |
| 6 | LinkedIn | Reclutador con oferta irresistible y "test técnico" en un .zip | PHISH | Adjunto ejecutable + halago |
| 7 | Mail | "Detectamos un inicio de sesión nuevo. Si no fuiste vos, revisá tu cuenta desde la app." (sin links) | FISH | Te pide verificar por tu cuenta |
| 8 | Mail | Menciona el viaje a Bariloche y a la jefa de Lucía, con link a "fotos del evento" | PHISH | Phishing dirigido con datos de OSINT |
| 9 | Llamada | "Soporte técnico" pide el código que llegó por SMS | PHISH | Nadie legítimo pide ese código |
| 10 | Mail | Factura de un servicio que la empresa sí usa, desde su dominio real, monto esperado | FISH | Coincide con algo esperado |
| 11 | QR | QR pegado sobre el menú de un bar que pide iniciar sesión con tu cuenta de mail | PHISH | Nadie pide login para ver un menú (quishing) |
| 12 | Audio | Audio de WhatsApp con la "voz" de un familiar pidiendo plata urgente | PHISH | Posible clonación de voz con IA: verificar por otro canal |

Para cada ronda definir en el JSON 3 señales distractoras plausibles.

**Fase 2 – Campaña (20').** Formulario guiado: mensaje central (máx. 60 caracteres), pieza (afiche / sticker / guion de video de 30"), acción (simulacro interno / botón reportar / premio al que reporta / otra), indicador de éxito (selección + meta numérica). Al enviar, generar una **vista previa de afiche** con el mensaje central (plantilla simple con tipografía grande). Galería proyectada de todos los afiches con votación de los grupos (no pueden votarse a sí mismos).

**Cierre:** mensaje proyectado: "Castigar al que hace clic genera miedo y menos reportes; premiar al que reporta mejora los indicadores." + regla de oro para la PSA (máx. 200 caracteres).

---

### 7.6 `shadowit` – Shadow IT y la IA del empleado (prioridad media)

**Situación inicial:** "Ventas pega la base de clientes en una IA gratuita para redactar mails. Nadie lo autorizó, pero las ventas subieron 30%."

**Fase 1 – Inventario (10').** Tarjetas arrastrables a tres columnas: **Prohibir / Reemplazar por alternativa aprobada / Permitir con reglas**, más un campo "¿por qué la gente la usa?":
1. Chatbot de IA gratuito usado por ventas con datos de clientes.
2. Drive personal donde el contador guarda los balances.
3. Extensión de navegador de capturas con permiso para leer todas las páginas.
4. Grupo de WhatsApp con proveedores donde se comparten facturas y DNI.
5. App de transcripción que graba las reuniones de directorio.

**Fase 2 – Due diligence (20').** Tabla comparativa interactiva (con tooltips que explican cada criterio en lenguaje simple):

| Criterio | IA Gratis Chat | IA Empresas Pro | IA On-Premise |
| --- | --- | --- | --- |
| Precio | USD 0 | USD 30/usuario/mes | USD 18.000 instalación + mantenimiento |
| ¿Usa los datos para entrenar? | Sí, por defecto | No, por contrato | No, no salen de la empresa |
| Dónde se guardan | No informa | Informa país y retención | Servidores propios |
| Login corporativo y MFA | No | Sí | Depende de la implementación |
| Acuerdo de tratamiento de datos | Términos estándar | Sí, firmable | No aplica |
| Certificaciones | No informa | ISO 27001, SOC 2 | No aplica |
| Facilidad para el equipo | Muy alta | Alta | Media |

Incluir una calculadora: cantidad de usuarios × precio × 12 meses para comparar costos a 1 y 3 años. El grupo elige una opción y escribe **3 preguntas al proveedor**.

**Fase 3 – Política semáforo (15').** Arrastrar 12 tarjetas de usos a Verde / Amarillo / Rojo. Respuestas de referencia (se muestran en el debriefing, no se puntúa como correcto/incorrecto sino como "coincide con la referencia"):
- Verde: borradores de textos genéricos; ideas para una campaña; resumir una noticia pública; traducir un texto público.
- Amarillo: resumir una minuta interna sin datos personales; analizar ventas agregadas sin nombres; revisar la redacción de una propuesta comercial.
- Rojo: pegar la base de clientes; pegar contraseñas o claves de API; balances no publicados; código propietario en una herramienta no aprobada; DNI o datos de salud de cualquier persona.

Más una regla de responsabilidad editable (default: "Lo que la IA escribe y vos enviás, lo firmás vos").

**Debriefing:** comparativa de las decisiones de todos los grupos y mensaje: "Prohibir sin ofrecer alternativa no funciona: la gente lo sigue haciendo a escondidas."

---

### 7.7 `escape` – Escape room: la oficina comprometida (prioridad media-alta)

**Versión digital:** una **ilustración de oficina en SVG original** (dibujada en código, estilo plano, sin marcas reales) con 8 zonas clicables. Al hacer clic en una zona aparece el objeto ampliado y el grupo debe elegir el **control** correcto entre 4 opciones. Si acierta, obtiene una **letra**; si falla, penalidad de 30 segundos sin poder volver a intentar esa zona. Las 8 letras forman **VERIFICA**; el grupo debe ordenarlas para abrir el candado final (animación).

| # | Objeto | Falla | Control correcto | Letra |
| --- | --- | --- | --- | --- |
| 1 | Monitor con post-it | Contraseña pegada en la pantalla | Gestor de contraseñas + MFA | V |
| 2 | Pendrive "Sueldos 2026" en el estacionamiento | Cebo para conectarlo | No conectar dispositivos desconocidos; entregarlo a sistemas | E |
| 3 | Organigrama publicado en la web con mails y cargos | Material para OSINT y phishing dirigido | Revisar qué se publica + capacitación | R |
| 4 | Factura con CBU cambiado y nota "urgente, pagar hoy" | Fraude de pago | Verificar cambios bancarios por un segundo canal | I |
| 5 | Lista de accesos con un ex-empleado que renunció hace 6 meses | Cuenta activa de ex-empleado | Proceso de baja (offboarding) | F |
| 6 | Drive compartido "con cualquiera que tenga el enlace" con datos de clientes | Exposición de datos personales | Permisos mínimos + revisión periódica | I |
| 7 | Calendario de backups: "última prueba de restauración: nunca" | Backups no probados | Pruebas de restauración periódicas | C |
| 8 | Contrato de hosting sin cláusula de confidencialidad | Riesgo de terceros | NDA y requisitos de seguridad en contratos | A |

Cada objeto, además de la respuesta correcta, tiene 3 distractores plausibles definidos en el JSON. Tiempo total: 30 minutos, cuenta regresiva visible. Ranking por tiempo de escape.

**Desafío final** (se desbloquea al abrir el candado): "¿Cuál de las 8 fallas es la más urgente para el negocio y por qué?" (máx. 300 caracteres).

**Debriefing:** mapa de calor de qué zonas costaron más (más errores); clasificación de las 8 fallas en Personas / Procesos / Tecnología con animación que muestra que la mayoría no son tecnología.

## 8. Pantallas mínimas

1. **Inicio** con dos botones grandes y el aviso educativo.
2. **Crear sesión** (docente): selector de dinámica con tarjeta descriptiva (duración, objetivo), PIN, configuración.
3. **Unirse** (grupo): código + nombre de grupo + nombre de la startup + roles opcionales.
4. **Sala de espera** (ambos).
5. **Panel de control docente:** fase actual, botones de control, temporizador, estado de cada grupo (conectado, respondió/no respondió), visor de respuestas en vivo, botón "proyectar respuesta de este grupo", exportar.
6. **Pantalla proyectada:** solo lectura, tipografía grande, código y QR visibles en la sala de espera.
7. **Vista de grupo** específica de cada dinámica.
8. **Debriefing** específico de cada dinámica.
9. **Exportación:** CSV (una fila por grupo y por decisión) y JSON completo de la sesión.
10. **"Cómo protegemos esta app"** (sección 5 en lenguaje simple).

## 9. Diseño visual

- Estética de "sala de crisis corporativa" sobria y moderna: fondo oscuro opcional para la pantalla proyectada, claro para los dispositivos de grupo.
- Paleta configurable en un único archivo de tokens (`theme.ts`) para poder adaptar los colores institucionales de la universidad.
- Componentes grandes y táctiles; nada de texto menor a 16 px en móvil ni a 28 px en la pantalla proyectada.
- Animaciones breves y funcionales (llegada de inject, dado, apertura del candado); respetar `prefers-reduced-motion`.
- Todas las ilustraciones son originales en SVG; no usar logos, marcas ni personajes reales.

## 10. Plan de fases

| Fase | Alcance | Criterio de terminado |
| --- | --- | --- |
| 0 | Monorepo, CI, `render.yaml`, `/healthz`, deploy "hola mundo" en Render | URL pública funcionando y CI en verde |
| 1 | Motor de sesiones: crear, unirse, reconexión, PIN docente, pantalla proyectada, temporizador, exportación genérica | Test e2e: docente crea sesión y 3 grupos se unen desde 3 navegadores |
| 2 | `phish` completo | Partida completa de 12 rondas + campaña + export |
| 3 | `crisis` completo | 9 injects, modo manual y automático, debriefing con línea de tiempo |
| 4 | `subasta` completo | Subasta con varias unidades, dados en servidor, puntaje testeado |
| 5 | `escape` y `boardroom` | Ilustración con 8 zonas; calculadora y giros de trama |
| 6 | `shadowit` y `juicio` | Drag and drop accesible por teclado; votación del jurado |
| 7 | Pulido: sonidos, accesibilidad, página de seguridad, README para docentes, persistencia opcional en Postgres | Checklist de accesibilidad y README con capturas |

## 11. Pruebas

- Unitarias para cada función de puntaje (casos de la sección 7, por ejemplo: grupo con Backups y Ciberseguro afectado por "Incendio": 30 → 15 por backups → 8 por ciberseguro).
- Unitarias para la subasta (empates: gana la oferta que llegó primero; ofertas mayores al saldo rechazadas).
- E2E con Playwright: una partida corta de `phish` con un docente y dos grupos.
- Prueba de carga simple (script) con 15 grupos simultáneos en una sesión.

## 12. README para docentes (contenido mínimo)

- Cómo desplegar en Render en 5 pasos (fork del repo, "New Blueprint", elegir repo, deploy, abrir URL).
- Cómo jugar cada dinámica: duración, preparación, preguntas para el debriefing.
- Cómo editar el contenido en `/content` (ejemplo de cambiar un inject o un mensaje del concurso).
- Advertencia sobre el plan gratuito: despertar el servicio antes de la clase y exportar resultados al terminar.
- Rúbrica común (sobre 10): traducción a negocio, justificación de decisiones, marco legal y ético, comunicación (2,5 puntos cada una; niveles Excelente 2,5 / Suficiente 1,5 / Insuficiente 0,5).
