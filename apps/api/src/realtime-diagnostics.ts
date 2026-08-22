import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

type DiagnosticDetail = string | number | boolean | null;

export function attachRealtimeTransportDiagnostics(logger: Logger, namespace: string, client: Socket) {
  if (!realtimeDiagnosticsEnabled()) return;
  const auditId = realtimeAuditId(client);

  client.conn.once('upgrade', (transport) => {
    realtimeDiagnostic(logger, namespace, client, 'engine-upgrade', { auditId, transport: transport.name });
  });
  client.conn.once('upgradeError', (error) => {
    realtimeDiagnostic(logger, namespace, client, 'engine-upgrade-error', { auditId, message: error.message });
  });
  client.conn.once('close', (reason) => {
    realtimeDiagnostic(logger, namespace, client, 'engine-close', { auditId, reason });
  });
}

export function realtimeDiagnostic(
  logger: Logger,
  namespace: string,
  client: Socket,
  event: string,
  details: Record<string, DiagnosticDetail> = {},
) {
  if (!realtimeDiagnosticsEnabled()) return;
  logger.log(JSON.stringify({
    scope: 'realtime',
    namespace,
    event,
    auditId: details.auditId ?? realtimeAuditId(client),
    ...details,
  }));
}

function realtimeDiagnosticsEnabled() {
  return process.env.REALTIME_DIAGNOSTICS === 'true';
}

function realtimeAuditId(client: Socket) {
  const value = client.handshake.query.realtimeAuditId;
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value) ? value : null;
}
