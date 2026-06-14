# N5 Flashcards · 漢字・動詞

App de flashcards para estudiar **JLPT N5** (japonés), pensada para usar desde el celular.

- **2 mazos**: Kanji N5 (101 tarjetas) y Verbos N5 (99 tarjetas).
- **Kanji**: forma, on'yomi, kun'yomi y significado.
- **Verbos**: forma diccionario, lectura, tipo (godan / ichidan / irregular), significado y formas **ます** y **て** (calculadas automáticamente).
- Marca **"Lo sé"** / **"Repasar"**, filtro *Por repasar*, mezclar, navegación con flechas o swipe.
- Progreso guardado en el dispositivo (localStorage), separado por mazo.
- **PWA**: instalable en la pantalla de inicio y funciona **offline**.

## Uso

Abre el sitio publicado en el celular y, desde el navegador, elige **"Agregar a pantalla de inicio"**. A partir de ahí se abre como una app y funciona sin internet.

### Atajos (teclado)
- `Espacio` — girar tarjeta
- `K` — Lo sé · `J` — Repasar
- `←` / `→` — navegar

## Desarrollo local

Es estático, sin build. Sírvelo con cualquier servidor:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Estructura
- `index.html` — UI y estilos
- `app.js` — lógica, conjugación de verbos, persistencia
- `data.js` — datos de kanji y verbos
- `sw.js` + `manifest.webmanifest` — soporte PWA / offline
