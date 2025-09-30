# WhatsApp Baileys Bot (Docker + IA conmutables)

Proyecto listo para usar con:
- Baileys (@whiskeysockets/baileys)
- Cambio de proveedor IA por `.env` (Gemini, OpenAI, Anthropic, Local HTTP)
- Dockerfile + docker-compose
- Persistencia de sesión WhatsApp

## Uso rápido

```bash
cp .env.example .env
# edita AI_PROVIDER y claves

docker compose build
docker compose up -d
docker compose logs -f
# escanea el QR que aparece
```

## Desarrollo sin Docker
```bash
npm install
npm start
```

## Cambiar de IA
Edita `.env`:
```
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
```
y reinicia el proceso.

## Estructura
- `app.js`: arranque de Baileys y ruteo de mensajes hacia IA
- `ai/`: adaptadores por proveedor
- `utils/wa.js`: utilidades WhatsApp
- `utils/memory.js`: memoria corta por chat
