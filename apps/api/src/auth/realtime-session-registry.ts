type RegisteredRealtimeClient = {
  userId: string;
  sessionId: string;
  disconnect: () => void;
};

class RealtimeSessionRegistry {
  private readonly clients = new Map<string, RegisteredRealtimeClient>();

  register(clientKey: string, client: RegisteredRealtimeClient) {
    this.clients.set(clientKey, client);
  }

  unregister(clientKey: string) {
    this.clients.delete(clientKey);
  }

  revokeSession(sessionId: string) {
    this.disconnectWhere((client) => client.sessionId === sessionId);
  }

  revokeUser(userId: string, exceptSessionId?: string) {
    this.disconnectWhere((client) => client.userId === userId && client.sessionId !== exceptSessionId);
  }

  private disconnectWhere(matches: (client: RegisteredRealtimeClient) => boolean) {
    for (const [key, client] of this.clients) {
      if (!matches(client)) continue;
      this.clients.delete(key);
      client.disconnect();
    }
  }
}

export const realtimeSessionRegistry = new RealtimeSessionRegistry();
