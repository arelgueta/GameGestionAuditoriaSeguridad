import type { CreateSessionInput } from '@ciberjunta/shared';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

export function createSession(input: CreateSessionInput) {
  return request<{ code: string; hostToken: string }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function hostLogin(code: string, pin: string) {
  return request<{ hostToken: string }>(`/api/sessions/${encodeURIComponent(code)}/host-login`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

export function sessionInfo(code: string) {
  return request<{ code: string; gameId: string; status: string }>(
    `/api/sessions/${encodeURIComponent(code)}`,
  );
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadExport(code: string, token: string, format: 'csv' | 'json') {
  const res = await fetch(`/api/sessions/${encodeURIComponent(code)}/export.${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo exportar desde el servidor.');
  downloadBlob(
    await res.blob(),
    `ciberjunta-${code}.${format}`,
    format === 'csv' ? 'text/csv' : 'application/json',
  );
}
