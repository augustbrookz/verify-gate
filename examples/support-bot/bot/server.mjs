#!/usr/bin/env node
// A stand-in for the application under test: answers each question from
// prompts/answers.json, as a deployed bot would answer from its prompt and
// model. Editing that file is how the example simulates a prompt change.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return res.end('ok');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const answers = JSON.parse(readFileSync(join(here, '..', 'prompts', 'answers.json'), 'utf8'));
    let question = '';
    try {
      question = JSON.parse(body).question ?? '';
    } catch {
      res.statusCode = 400;
      return res.end('{"error":"send JSON {\\"question\\": \\"...\\"}"}');
    }
    const answer = answers[question] ?? "I don't have that information.";
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ answer }));
  });
}).listen(port, '127.0.0.1', () => console.log(`example bot on http://127.0.0.1:${port}`));
