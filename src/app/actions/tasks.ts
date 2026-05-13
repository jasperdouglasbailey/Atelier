'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { getCurrentAppUser } from '@/lib/data/app-users';

type TaskInput = {
  title: string;
  description?: string | null;
  due_at?: string | null;
  assigned_to?: string | null;
  booking_id?: string | null;
  talent_id?: string | null;
  crew_id?: string | null;
};

function err(message: string) {
  return { ok: false as const, error: message };
}

async function requireOwnerOrPartner() {
  const user = await getCurrentAppUser();
  if (!user || (user.role !== 'owner' && user.role !== 'partner')) return null;
  return user;
}

export async function createTaskAction(
  input: TaskInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('atelier_tasks')
    .insert({
      title: input.title.trim(),
      description: input.description || null,
      due_at: input.due_at || null,
      assigned_to: input.assigned_to || null,
      created_by: user.user_id,
      booking_id: input.booking_id || null,
      talent_id: input.talent_id || null,
      crew_id: input.crew_id || null,
    })
    .select('id')
    .single();

  if (error) return err(error.message);

  if (input.booking_id) {
    revalidatePath(`/bookings/${input.booking_id}`);
    revalidateTag('bookings');
  }
  if (input.talent_id) revalidatePath(`/talent/${input.talent_id}`);
  if (input.crew_id) revalidatePath(`/crew/${input.crew_id}`);
  return { ok: true, id: data.id as string };
}

export async function completeTaskAction(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { data: task } = await supabase
    .from('atelier_tasks')
    .select('booking_id, talent_id, crew_id')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('atelier_tasks')
    .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) return err(error.message);

  if (task?.booking_id) { revalidatePath(`/bookings/${task.booking_id}`); revalidateTag('bookings'); }
  if (task?.talent_id) revalidatePath(`/talent/${task.talent_id}`);
  if (task?.crew_id) revalidatePath(`/crew/${task.crew_id}`);
  return { ok: true };
}

export async function reopenTaskAction(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { data: task } = await supabase
    .from('atelier_tasks')
    .select('booking_id, talent_id, crew_id')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('atelier_tasks')
    .update({ completed_at: null, updated_at: new Date().toISOString() })
    .eq('id', taskId);

  if (error) return err(error.message);

  if (task?.booking_id) { revalidatePath(`/bookings/${task.booking_id}`); revalidateTag('bookings'); }
  if (task?.talent_id) revalidatePath(`/talent/${task.talent_id}`);
  if (task?.crew_id) revalidatePath(`/crew/${task.crew_id}`);
  return { ok: true };
}

export async function deleteTaskAction(
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireOwnerOrPartner();
  if (!user) return err('Not authorised');

  const supabase = createServiceClient();
  const { data: task } = await supabase
    .from('atelier_tasks')
    .select('booking_id, talent_id, crew_id')
    .eq('id', taskId)
    .maybeSingle();

  const { error } = await supabase
    .from('atelier_tasks')
    .delete()
    .eq('id', taskId);

  if (error) return err(error.message);

  if (task?.booking_id) { revalidatePath(`/bookings/${task.booking_id}`); revalidateTag('bookings'); }
  if (task?.talent_id) revalidatePath(`/talent/${task.talent_id}`);
  if (task?.crew_id) revalidatePath(`/crew/${task.crew_id}`);
  return { ok: true };
}
