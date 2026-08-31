export const SOCKET_PATH = '/socket.io' as const;
export const CHAT_NAMESPACE = '/chat' as const;
export const EVENT_TASKS_NAMESPACE = '/event-tasks' as const;
export const SYSTEM_UPDATES_NAMESPACE = '/system-updates' as const;

const configuredRealtimeOrigin = process.env.NEXT_PUBLIC_REALTIME_ORIGIN;

type SocketNamespaceResolution = {
  namespace: string;
  realtimeOrigin?: string;
};

export function resolveSocketNamespace({
  namespace,
  realtimeOrigin,
}: SocketNamespaceResolution) {
  const trimmedNamespace = namespace.trim();
  if (!trimmedNamespace) {
    throw new Error('Socket.IO namespace must not be empty.');
  }

  const normalizedNamespace = `/${trimmedNamespace.replace(/^\/+|\/+$/g, '')}`;
  if (
    normalizedNamespace === '/api/v1'
    || normalizedNamespace.startsWith('/api/v1/')
    || normalizedNamespace === SOCKET_PATH
    || normalizedNamespace.startsWith(`${SOCKET_PATH}/`)
    || normalizedNamespace.includes('?')
    || normalizedNamespace.includes('#')
  ) {
    throw new Error('Socket.IO namespace must be separate from REST and transport paths.');
  }

  const trimmedOrigin = realtimeOrigin?.trim();
  if (!trimmedOrigin) return normalizedNamespace;
  if (trimmedOrigin.startsWith('//')) {
    throw new Error('Realtime origin must be an absolute HTTP(S) origin.');
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(trimmedOrigin);
  } catch {
    throw new Error('Realtime origin must be an absolute HTTP(S) origin.');
  }

  if (
    (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:')
    || parsedOrigin.username
    || parsedOrigin.password
    || parsedOrigin.pathname !== '/'
    || parsedOrigin.search
    || parsedOrigin.hash
  ) {
    throw new Error('Realtime origin must contain only scheme, hostname, and optional port.');
  }

  return `${parsedOrigin.origin}${normalizedNamespace}`;
}

export function socketNamespaceUrl(namespace: string) {
  return resolveSocketNamespace({
    namespace,
    realtimeOrigin: configuredRealtimeOrigin,
  });
}
