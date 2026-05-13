import { createServiceClient } from '@/lib/supabase/service';
import { reportDataError } from '@/lib/utils/data-errors';
import type { Task } from '@/lib/types/database';

const TABLE = 'atelier_tasks';

export type TaskWithAssignee = Task & {
  assignee_name: string | null;
};

export async function listTasksForBooking(bookingId: string): Promise<TaskWithAssignee[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, assignee:assigned_to(display_name)')
    .eq('booking_id', bookingId)
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) { reportDataError('[tasks] listForBooking', error); return []; }
  return (data ?? []).map(toTaskWithAssignee);
}

export async function listTasksForTalent(talentId: string): Promise<TaskWithAssignee[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, assignee:assigned_to(display_name)')
    .eq('talent_id', talentId)
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) { reportDataError('[tasks] listForTalent', error); return []; }
  return (data ?? []).map(toTaskWithAssignee);
}

export async function listTasksForCrew(crewId: string): Promise<TaskWithAssignee[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, assignee:assigned_to(display_name)')
    .eq('crew_id', crewId)
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error) { reportDataError('[tasks] listForCrew', error); return []; }
  return (data ?? []).map(toTaskWithAssignee);
}

export async function listOpenTasks(): Promise<TaskWithAssignee[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, assignee:assigned_to(display_name)')
    .is('completed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) { reportDataError('[tasks] listOpen', error); return []; }
  return (data ?? []).map(toTaskWithAssignee);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTaskWithAssignee(row: any): TaskWithAssignee {
  const { assignee, ...rest } = row;
  return {
    ...rest,
    assignee_name: assignee?.display_name ?? null,
  } as TaskWithAssignee;
}
