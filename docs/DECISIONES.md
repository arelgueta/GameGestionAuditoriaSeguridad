# Decisiones de implementación

Registro de las decisiones tomadas donde la SPEC era ambigua o donde hubo que apartarse de ella. Regla general: elegir la opción más simple.

## Stack

- **Node.js 24 en lugar de 20.** Node 20 llegó a fin de vida (EOL) el 30/04/2026, así que ya no recibe parches de seguridad. Para un juego de seguridad no corresponde desplegar sobre un runtime sin soporte. Se usa Node 24 (LTS); `engines` acepta `>=22`. Se fija en `.node-version` y en `render.yaml` (`NODE_VERSION`).
- **TypeScript 5.9** (no 7.x): `typescript-eslint` todavía no soporta TS 7.
- **Tailwind 3.4** con `tailwind.config.ts` que lee los tokens de `apps/web/src/theme.ts` (la SPEC pide un único archivo de tokens; con Tailwind 3 es directo).
- **zod 3**, **Express 5**, **Socket.IO 4**, **React 19**, **Vite 8**.
- El servidor se empaqueta con **esbuild** en un único `dist/index.js` que incluye `@ciberjunta/shared` (el paquete compartido se consume como TypeScript fuente, sin paso de compilación propio).

## Motor de juego

- **Interfaz de módulo ampliada.** En vez de `init(config, content)` y funciones que reciben solo el estado, cada función recibe un contexto `ctx` con reloj de juego, generador aleatorio con semilla, contenido, configuración, grupos y fase actual. Se agregaron `onPhaseEnter`, `status` (estado corto por grupo para el panel docente) y `summarize` (lista `etiqueta/valor` que se usa tanto para el visor de respuestas como para el "modo presentación" proyectado). Las fases viven en `packages/shared/src/catalog.ts` para que el front y el back usen la misma definición.
- **Pureza y transacciones.** Las funciones del módulo modifican un _borrador_: el motor clona el estado (`structuredClone`) antes de cada acción y solo lo confirma si no hubo error. Así una acción inválida nunca deja el estado a medias. Las reglas de puntaje están en funciones puras exportadas (`resolveIncident`, `scoreAnswer`, `trustOf`, `evaluateBasket`, etc.) y testeadas con Vitest.
- **Reloj de juego con pausa.** Todos los plazos se guardan en "tiempo de juego" (`Date.now()` menos el tiempo acumulado en pausa). Pausar congela todos los temporizadores (fase, rondas, injects, lotes, penalidades) sin tener que recalcularlos. El cliente recibe `serverNow` y calcula el tiempo restante con su propio reloj monótono local, así no importa si el reloj del celular está desajustado.
- **Temporizador general de fase:** al llegar a cero no avanza solo; avisa y el docente decide. Los temporizadores propios de cada dinámica (rondas de phish, injects, lotes) sí se resuelven automáticamente en el servidor.
- **Exportación CSV:** columnas fijas `sesion, dinamica, grupo, startup, fase, item, respuesta, detalle, puntos` (una fila por grupo y decisión). Las celdas que empiezan con `= + - @` se prefijan con `'` para evitar inyección de fórmulas en Excel. Se agrega BOM UTF‑8 para que Excel muestre bien los acentos.
- **Copia local:** el panel docente guarda en `localStorage` el último estado recibido (incluye las filas de exportación), y permite descargar CSV/JSON desde esa copia aunque el servidor se haya reiniciado.
- **Vencimiento:** una sesión se borra cuando pasan `SESSION_TTL_MINUTES` sin actividad (no desde su creación), para no cortar una clase larga.
- **Persistencia opcional:** si existe `DATABASE_URL`, cada sesión se guarda como JSON en la tabla `ciberjunta_sessions` (escritura agrupada cada 2 s) y se restaura al arrancar.

## Seguridad

- PIN: `scrypt` con sal por sesión + `HOST_PIN_SALT`. Tras 8 intentos fallidos la sesión bloquea el ingreso por PIN 5 minutos. Además hay rate limit por IP en `/host-login`.
- Tokens de docente y grupo: 24 bytes aleatorios; el servidor guarda solo su hash SHA‑256 y compara en tiempo constante.
- Límites: 10 eventos/s por socket (ráfaga 20), 15 sesiones nuevas por IP cada 10 min, 40 ingresos de grupo por IP cada 10 min (en una red universitaria todos comparten IP: el límite está pensado para eso). En desarrollo/test los límites por IP son más altos.
- CSP sin `unsafe-inline`: `default-src 'self'`, `connect-src` solo el propio host (ws/wss), `frame-ancestors 'none'`, `img-src 'self' data:`. Los sonidos se sintetizan con Web Audio (sin archivos ni CDNs).
- Textos libres: se normalizan (NFC), se eliminan caracteres de control y de dirección bidi, se recortan y se limitan (máx. 1.500). React siempre los renderiza como texto.

## Por dinámica

### phish

- El orden de las 4 señales se baraja por ronda con la semilla de la sesión.
- La etapa "señal" solo la juegan los grupos que respondieron PHISH/FISH. Las etapas se cierran antes de tiempo si todos los grupos conectados ya respondieron.
- El bonus de velocidad solo se da si acertaron PHISH/FISH. El puntaje de una ronda cuenta recién cuando se revela.
- La galería muestra los votos recién en el cierre (durante la votación no, para no influir).

### crisis

- En modo automático, el primer inject se lanza al entrar a la fase y luego uno cada `autoIntervalSec`. El docente puede lanzar el siguiente antes.
- Un inject se cierra al vencer los 4 minutos, cuando todos los grupos conectados decidieron, o cuando el docente lo cierra. Un grupo que se une tarde recibe "Sin decisión" (−10) en los injects ya cerrados.
- El medidor de confianza muestra el valor solo si el docente activó "mostrar efecto inmediato" o en el debriefing.
- Límite de 120 palabras validado en el servidor.

### subasta

- "Se reinicia a 10 segundos con cada oferta": se interpreta como _tiempo restante = máximo(tiempo restante, 10 s)_, para que una oferta nunca acorte la subasta.
- "Suben de a 1": la oferta mínima es el mayor entre el precio base, la oferta propia + 1 y (si ya hay tantas ofertas ajenas como unidades) la N‑ésima oferta ajena + 1. Cada grupo puede ganar como máximo una unidad por lote.
- Empates: gana la oferta que llegó primero.
- El plan de respuesta suma +5 cuando el grupo fue afectado por el dado y el incidente **no** fue anulado por otro control (si fue anulado, no hubo incidente que gestionar).
- El ciberseguro y el control que "reduce a la mitad" redondean hacia arriba.
- Grupo "con suerte": el que más veces se salvó por el dado en incidentes contra los que no tenía control; desempata quien compró menos controles. Se muestra si se salvó al menos 2 veces.
- Los grupos que se unen después de revelado un incidente no tiran dado en ese incidente (se los trata como no afectados).

### escape

- Las letras se muestran al grupo en orden alfabético y las zonas se barajan por sesión, para que el orden de VERIFICA no se deduzca de la lista.
- Las 8 zonas tienen ids fijos porque la ilustración SVG ubica cada una en un lugar de la oficina. El texto, las opciones y las letras sí son editables.
- Clasificación Personas/Procesos/Tecnología: definida en `content/escape.json` (campo `category`).

### boardroom

- Se puede enviar una canasta que supera el presupuesto solo si se pide fondos al inversor (mínimo 200 caracteres).
- Combinaciones no previstas por la SPEC (por ejemplo B-full + B-web sin pedido de fondos) reciben un aviso neutral o amarillo (si se pasan del presupuesto sin justificar).
- Durante la fase "Giro" el grupo todavía puede ajustar su análisis del hallazgo.
- "Modo presentación" = función genérica "Proyectar 90 s" disponible en todas las dinámicas.

### shadowit

- La SPEC no da el costo de mantenimiento de la IA on-premise: se estimó en USD 3.000/año y quedó editable en `content/shadowit.json`.

### juicio

- Un único temporizador de oradores (en modo paralelo indica a qué juicio corresponde).
- Solo el equipo "Jurado y prensa" vota y escribe el titular.
- Las preguntas cruzadas se pueden enviar en las fases de alegatos y preguntas.
