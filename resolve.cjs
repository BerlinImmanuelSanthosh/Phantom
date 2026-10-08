const fs = require('fs');
let content = fs.readFileSync('src/routes/api/chat.ts', 'utf-8');

const headMarker = '<<<<<<< HEAD';
const incomingMarker = '>>>>>>>';

const headStart = content.indexOf(headMarker);
const incomingEnd = content.indexOf('\n', content.indexOf(incomingMarker, headStart)) + 1;

if (headStart !== -1 && incomingEnd !== 0) {
  const replacement = `
          for (const baseUrl of backendUrls) {
            try {
              const res = await fetch(\`\${baseUrl.replace(/\\/+$/, "")}/api/chat/stream\`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mode,
                  messages,
                  ingredients: ingredients ?? [],
                  profile_context: ctx,
                  language,
                  prescription_context,
                }),
                signal: request.signal,
              });
              if (res.ok && res.body) {
                return new Response(res.body, {
                  headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "X-Accel-Buffering": "no",
                    "Cache-Control": "no-cache",
                    "Transfer-Encoding": "chunked",
                  },
                });
              }
              console.error(\`[/api/chat] Groq backend returned \${res.status} from \${baseUrl}\`);
            } catch (error) {
              if (request.signal.aborted) throw error;
              console.warn(\`[/api/chat] Groq backend unavailable at \${baseUrl}:\`, error);
            }
          }`;
  content = content.slice(0, headStart) + replacement + content.slice(incomingEnd);
  fs.writeFileSync('src/routes/api/chat.ts', content);
  console.log('Conflict resolved!');
} else {
  console.log('Markers not found.');
}
