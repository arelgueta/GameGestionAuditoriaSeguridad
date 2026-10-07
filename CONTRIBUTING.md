# Cómo contribuir

¡Gracias por mejorar CiberJunta! La contribución más común es **editar el contenido** de las dinámicas, y no requiere saber programar.

## Editar el contenido (`/content`)

Cada dinámica tiene un archivo JSON en [`content/`](content/): `phish.json`, `crisis.json`, `subasta.json`, `escape.json`, `boardroom.json`, `shadowit.json` y `juicio.json`.

- Se pueden editar desde GitHub (botón ✏️ del archivo) o con cualquier editor de texto.
- Respeten la estructura: comillas dobles, comas entre elementos y **no** dejen una coma después del último elemento de una lista.
- Para usar comillas dentro de un texto, escríbanlas como `\"`.
- Los cambios aplican a las **sesiones nuevas**. Si el servidor está en Render, el push a `main` redeploya solo.
- Si algo quedó mal, al crear una sesión aparece un error que dice qué campo revisar (por ejemplo, `rounds.3.distractors: Array must contain exactly 3 element(s)`).
- Mantengan los casos **ficticios**: sin marcas, personas ni logos reales.

### Ejemplo 1: cambiar un inject de la Crisis Room

En `content/crisis.json`, cada inject tiene minuto, título, texto y opciones con puntos:

```json
{
  "minute": 10,
  "title": "Llama un periodista",
  "text": "Llama un periodista: \"Me dicen que están hackeados, ¿confirman?\"",
  "options": [
    { "id": "A", "text": "Vocero único con mensaje breve y veraz", "points": 10 },
    { "id": "B", "text": "Negar todo", "points": -15 }
  ]
}
```

Cambien `text` o los `points`, o agreguen una opción `{ "id": "C", ... }`. Marquen con `"debatable": true` el inject que quieran discutir como “decisión debatible” en el debriefing.

### Ejemplo 2: cambiar un mensaje del concurso Phish or Fish

En `content/phish.json`, cada ronda tiene el mensaje (con su canal), la respuesta, la señal correcta y exactamente **3** señales distractoras:

```json
{
  "message": {
    "channel": "sms",
    "sender": "CorreoExpress",
    "senderDetail": "+54 9 11 5555-0192",
    "time": "09:14",
    "body": "Tu paquete no pudo entregarse…"
  },
  "answer": "PHISH",
  "signal": "Urgencia + pago pequeño + link acortado",
  "distractors": ["…", "…", "…"],
  "explanation": "Texto que se muestra al revelar la respuesta."
}
```

Canales válidos: `sms`, `mail`, `whatsapp`, `linkedin`, `llamada`, `qr`, `audio`. Para mails se puede agregar `"subject"`; para LinkedIn, `"attachment"`; para QR, `"link"`.

### Otros ajustes frecuentes

- **Subasta:** precios base y unidades en `controls`; daños y qué control los anula o reduce en `incidents` (los ids deben existir en `controls`).
- **Boardroom:** presupuesto (`budget`), proveedores, giros de trama (`twists`) y valores iniciales de la calculadora (`calcDefaults`).
- **Escape room:** textos, opciones y letras de cada zona. Las letras deben formar la palabra de `word`. Los `id` de las zonas no se cambian (ubican el objeto en la ilustración).
- **Shadow IT:** tarjetas del semáforo con su `reference` (`verde`, `amarillo`, `rojo`) y precios de las opciones de IA.
- **Juicio:** expediente, pruebas (`"surprise": true` para la que libera el docente), partes y tiempos de los oradores.

## Contribuir con código

1. `npm install`, luego `npm run dev`.
2. Antes de abrir un PR: `npm run lint && npm run typecheck && npm test`.
3. La lógica de puntaje va en funciones puras con su test en `apps/server/src/games/*.test.ts`.
4. Toda la interfaz en español rioplatense neutro (“ustedes”, “elijan”).
5. Las decisiones de diseño no obvias se anotan en [`docs/DECISIONES.md`](docs/DECISIONES.md).
