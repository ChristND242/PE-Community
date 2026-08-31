import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8080);
const version = process.env.PE_COMMUNITY_VERSION ?? 'v0.0.0';
createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ ok: true, version, path: request.url }));
}).listen(port, '0.0.0.0');
