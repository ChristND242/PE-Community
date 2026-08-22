import { ChatWorkspace } from '../../../components/chat-workspace';
import { AppShell } from '../../../components/shell';

export default function AdminChatPage() {
  return (
    <AppShell admin>
      <ChatWorkspace admin />
    </AppShell>
  );
}
