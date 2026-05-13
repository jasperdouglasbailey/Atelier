'use client';

import { useState, useTransition } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { createTaskAction, completeTaskAction, reopenTaskAction, deleteTaskAction } from '@/app/actions/tasks';
import type { TaskWithAssignee } from '@/lib/data/tasks';

type Attachment =
  | { type: 'booking'; id: string }
  | { type: 'talent'; id: string }
  | { type: 'crew'; id: string }
  | null;

type Props = {
  initial: TaskWithAssignee[];
  attachment?: Attachment;
  /** app_users available to assign tasks to */
  assignees?: Array<{ userId: string; displayName: string }>;
};

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days}d`;
}

function dueColor(due: string | null, completed: string | null): string {
  if (completed) return PALETTE.success;
  if (!due) return PALETTE.muted;
  const diff = new Date(due).getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  if (days < 0) return PALETTE.danger;
  if (days <= 2) return PALETTE.warning;
  return PALETTE.muted;
}

export default function TasksPanel({ initial, attachment, assignees = [] }: Props) {
  const [tasks, setTasks] = useState<TaskWithAssignee[]>(initial);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = tasks.filter((t) => !t.completed_at);
  const done = tasks.filter((t) => t.completed_at);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createTaskAction({
        title: title.trim(),
        description: description || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        assigned_to: assignedTo || null,
        booking_id: attachment?.type === 'booking' ? attachment.id : null,
        talent_id: attachment?.type === 'talent' ? attachment.id : null,
        crew_id: attachment?.type === 'crew' ? attachment.id : null,
      });
      if (!result.ok) { setError(result.error); return; }
      const newTask: TaskWithAssignee = {
        id: result.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: null,
        assigned_to: assignedTo || null,
        assignee_name: assignees.find((a) => a.userId === assignedTo)?.displayName ?? null,
        title: title.trim(),
        description: description || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        completed_at: null,
        booking_id: attachment?.type === 'booking' ? attachment.id : null,
        talent_id: attachment?.type === 'talent' ? attachment.id : null,
        crew_id: attachment?.type === 'crew' ? attachment.id : null,
      };
      setTasks((prev) => [newTask, ...prev]);
      setAdding(false);
      setTitle('');
      setDescription('');
      setDueAt('');
      setAssignedTo('');
    });
  }

  function handleComplete(id: string) {
    startTransition(async () => {
      await completeTaskAction(id);
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, completed_at: new Date().toISOString() } : t),
      );
    });
  }

  function handleReopen(id: string) {
    startTransition(async () => {
      await reopenTaskAction(id);
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed_at: null } : t));
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTaskAction(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    });
  }

  const inputStyle = { borderColor: PALETTE.border, color: PALETTE.text, background: PALETTE.bg };
  const inputClass = 'w-full rounded border px-2.5 py-1.5 text-xs';

  return (
    <div className="space-y-3">
      {/* Open tasks */}
      {open.length === 0 && !adding && (
        <p className="text-xs" style={{ color: PALETTE.muted }}>No open tasks.</p>
      )}
      {open.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onComplete={() => handleComplete(task.id)}
          onDelete={() => handleDelete(task.id)}
          pending={pending}
        />
      ))}

      {/* Add form */}
      {adding ? (
        <form onSubmit={handleAdd} className="rounded border p-3 space-y-2.5" style={{ borderColor: PALETTE.accent, background: `${PALETTE.accent}0a` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: PALETTE.accent }}>New task</p>
          {error && <p className="text-[11px]" style={{ color: PALETTE.danger }}>{error}</p>}
          <input
            type="text"
            required
            placeholder="Task title *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
            style={inputStyle}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Due date</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            {assignees.length > 0 && (
              <div>
                <label className="block text-[10px] mb-1 uppercase tracking-wide" style={{ color: PALETTE.muted }}>Assign to</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.userId} value={a.userId}>{a.displayName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending || !title.trim()}
              className="rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
            >
              {pending ? 'Saving…' : 'Add task'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); }}
              className="rounded px-3 py-1.5 text-xs"
              style={{ color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, background: 'transparent', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded px-3 py-1.5 text-xs font-medium"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}44`, cursor: 'pointer' }}
        >
          + Add task
        </button>
      )}

      {/* Completed tasks (collapsed) */}
      {done.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px]" style={{ color: PALETTE.muted }}>
            {done.length} completed task{done.length > 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-1.5">
            {done.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs opacity-60"
                style={{ borderColor: PALETTE.border }}
              >
                <div className="line-through" style={{ color: PALETTE.muted }}>{task.title}</div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => handleReopen(task.id)} disabled={pending} className="text-[10px]" style={{ color: PALETTE.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Reopen</button>
                  <button type="button" onClick={() => handleDelete(task.id)} disabled={pending} className="text-[10px]" style={{ color: PALETTE.danger, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TaskRow({ task, onComplete, onDelete, pending }: {
  task: TaskWithAssignee;
  onComplete: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const dueLabel = formatDue(task.due_at);
  const color = dueColor(task.due_at, task.completed_at);

  return (
    <div
      className="flex items-start gap-3 rounded border px-3 py-2.5"
      style={{ borderColor: PALETTE.border, background: PALETTE.surface }}
    >
      <button
        type="button"
        onClick={onComplete}
        disabled={pending}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border disabled:opacity-40"
        style={{ borderColor: PALETTE.border, background: PALETTE.bg, cursor: 'pointer' }}
        aria-label="Mark complete"
      />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: PALETTE.text }}>{task.title}</div>
        {task.description && (
          <div className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>{task.description}</div>
        )}
        <div className="mt-1 flex flex-wrap gap-2 items-center">
          {dueLabel && (
            <span className="text-[10px]" style={{ color }}>{dueLabel}</span>
          )}
          {task.assignee_name && (
            <span className="text-[10px]" style={{ color: PALETTE.muted }}>→ {task.assignee_name}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="text-[10px] shrink-0 disabled:opacity-40"
        style={{ color: PALETTE.danger, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        Delete
      </button>
    </div>
  );
}
