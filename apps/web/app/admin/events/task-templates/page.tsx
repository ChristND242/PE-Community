import { redirect } from 'next/navigation';

export default function EventTaskTemplatesPage() {
  redirect('/admin/task-boards?tab=automations-templates');
}
