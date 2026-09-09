import type { AssetFile, AssetFileKind, AssetSummary, BinderDocument, CreateBinderDocumentInput, InboxFile, CreateAssetInput, MaintenancePlan, TrashEntry, TrashKind, Warranty } from '@boberit/shared';

type ApiEnvelope<T> = { data: T };
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void { accessToken = token; }
function authHeaders(): HeadersInit { return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}; }

type ApiErrorEnvelope = { error: { code: string; message: string } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorEnvelope | null;
    throw new Error(body?.error.message ?? 'Nie udało się połączyć z Boberit.');
  }
  return response.json() as Promise<T>;
}

async function emptyRequest(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`/api/v1${path}`, { ...init, headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init.headers } });
  if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorEnvelope | null; throw new Error(body?.error.message ?? 'Nie udało się zapisać zmiany.'); }
}

export const api = {
  setup: () => request<ApiEnvelope<{needsSetup:boolean}>>('/auth/setup'),
  register: (input:{login:string;email:string;password:string;householdName:string}) => request<ApiEnvelope<{user:{login:string};token:string}>>('/auth/register',{method:'POST',body:JSON.stringify(input)}),
  login: (input:{login:string;password:string}) => request<ApiEnvelope<{user:{login:string};token:string}>>('/auth/login',{method:'POST',body:JSON.stringify(input)}),
  me: () => request<ApiEnvelope<{id:string;login:string;email:string;householdId:string;role:string}>>('/auth/me'),
  logout: () => emptyRequest('/auth/logout',{method:'POST'}),
  changePassword:(currentPassword:string,newPassword:string)=>request<ApiEnvelope<{changed:boolean}>>('/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
  logoutOthers:()=>request<ApiEnvelope<{revoked:number}>>('/auth/logout-others',{method:'POST'}),
  activity:()=>request<ApiEnvelope<{action:string;entity_kind:string;label:string|null;user_login:string|null;created_at:string}[]>>('/settings/activity'),
  storage:()=>request<ApiEnvelope<{bytes:number;purchaseValues:{currency:string;amountMinor:number}[]}>>("/settings/storage"),
  households: () => request<ApiEnvelope<{activeHouseholdId:string|null;households:{id:string;name:string;role:string}[]}>>('/households'),
  selectHousehold: (householdId:string) => request<ApiEnvelope<{activeHouseholdId:string}>>('/households/active',{method:'POST',body:JSON.stringify({householdId})}),
  createHousehold: (name:string) => request<ApiEnvelope<{id:string;name:string;role:string}>>('/households',{method:'POST',body:JSON.stringify({name})}),
  renameHousehold: (id:string,name:string) => request<ApiEnvelope<{renamed:boolean}>>(`/households/${id}`,{method:'PATCH',body:JSON.stringify({name})}),
  listAssets: (query = '') => request<ApiEnvelope<AssetSummary[]>>(`/assets${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  listInbox: () => request<ApiEnvelope<InboxFile[]>>('/inbox'),
  listTrash: (kind?: TrashKind) => request<ApiEnvelope<TrashEntry[]>>(`/trash${kind ? `?kind=${kind}` : ''}`),
  listDocuments: (query = '') => request<ApiEnvelope<BinderDocument[]>>(`/documents${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  getAsset: (id: string) => request<ApiEnvelope<AssetSummary>>(`/assets/${id}`),
  createAsset: (input: CreateAssetInput) => request<ApiEnvelope<AssetSummary>>('/assets', { method: 'POST', body: JSON.stringify(input) }),
  createDocument: (input: CreateBinderDocumentInput) => request<ApiEnvelope<BinderDocument>>('/documents', { method: 'POST', body: JSON.stringify(input) }),
  updateDocument: (id: string, input: Partial<CreateBinderDocumentInput>) => request<ApiEnvelope<BinderDocument>>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  runDocumentOcr: (id:string) => request<ApiEnvelope<{processed:boolean}>>(`/documents/${id}/ocr`,{method:'POST'}),
  getDocumentOcr: (id:string) => request<ApiEnvelope<{status:string;text:string;error:string|null;updated_at:string}>>(`/documents/${id}/ocr`),
  saveDocumentOcr: (id:string,text:string) => request<ApiEnvelope<{saved:boolean}>>(`/documents/${id}/ocr`,{method:'PUT',body:JSON.stringify({text})}),
  batchDocumentOcr: () => request<ApiEnvelope<{processed:number}>>('/documents/ocr/batch',{method:'POST'}),
  trashDocument: (id: string) => emptyRequest(`/documents/${id}`, { method: 'DELETE' }),
  restoreTrash: (kind: TrashKind, id: string) => emptyRequest(`/trash/${kind}/${id}/restore`, { method: 'POST' }),
  emptyTrash: () => emptyRequest('/trash', { method: 'DELETE' }),
  listMembers: () => request<ApiEnvelope<{members:{id:string;login:string;email:string;role:string}[];canManage:boolean}>>('/household/members'),
  createMember: (input:{login:string;email:string;password:string;role:'owner'|'member'}) => request<ApiEnvelope<unknown>>('/household/members',{method:'POST',body:JSON.stringify(input)}),
  updateMemberRole: (id:string,role:'owner'|'member') => request<ApiEnvelope<{updated:boolean}>>(`/household/members/${id}`,{method:'PATCH',body:JSON.stringify({role})}),
  removeMember: (id:string) => emptyRequest(`/household/members/${id}`,{method:'DELETE'}),
  listWebhookDeliveries: () => request<ApiEnvelope<{webhook_name:string;event:string;status:number|null;error:string|null;created_at:string}[]>>('/settings/webhook-deliveries'),
  listWebhooks: () => request<ApiEnvelope<{ id:string; name:string; url:string; events:string[]; scopeAll:boolean; householdIds:string[]; createdAt:string }[]>>('/settings/webhooks'),
  createWebhook: (input:{name:string;url:string;secret?:string;events:string[];householdIds?:string[]}) => request<ApiEnvelope<unknown>>('/settings/webhooks',{method:'POST',body:JSON.stringify(input)}),
  updateWebhook: (id:string,input:{name:string;url:string;secret?:string;events:string[];householdIds?:string[]}) => request<ApiEnvelope<{updated:boolean}>>("/settings/webhooks/" + id,{method:"PATCH",body:JSON.stringify(input)}),
  deleteWebhook: (id:string) => emptyRequest(`/settings/webhooks/${id}`,{method:'DELETE'}),
  downloadBackup: async () => { const response=await fetch('/api/v1/settings/export',{headers:authHeaders()}); if(!response.ok) throw new Error('Nie udało się pobrać backupu.'); return response.blob(); },
  fileBlob: async (id:string,mode:'download'|'preview') => { const response=await fetch(`/api/v1/files/${id}/${mode}`,{headers:authHeaders()}); if(!response.ok) throw new Error('Nie udało się pobrać pliku.'); return response.blob(); },
  importBackup: async (file: File) => { const form = new FormData(); form.set('file', file); form.set('confirmation', 'ZASTĄP'); const response = await fetch('/api/v1/settings/import', { method: 'POST', headers: authHeaders(), body: form }); if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorEnvelope | null; throw new Error(body?.error.message ?? 'Nie udało się odtworzyć backupu.'); } return response.json() as Promise<ApiEnvelope<{ restored: boolean; attachments: number }>>; },
  updateAsset: (id: string, input: Partial<CreateAssetInput>) => request<ApiEnvelope<AssetSummary>>(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  trashAsset: (id: string) => emptyRequest(`/assets/${id}`, { method: 'DELETE' }),
  saveWarranty: (id: string, warranty: Warranty) => request<ApiEnvelope<Warranty>>(`/assets/${id}/warranty`, { method: 'PUT', body: JSON.stringify(warranty) }),
  createPlan: (id: string, input: Pick<MaintenancePlan, 'title' | 'scheduleKind' | 'intervalValue' | 'intervalUnit' | 'nextDueOn' | 'notes'>) => request<ApiEnvelope<MaintenancePlan>>(`/assets/${id}/maintenance-plans`, { method: 'POST', body: JSON.stringify(input) }),
  updatePlan: (id: string, input: Pick<MaintenancePlan, "title" | "scheduleKind" | "intervalValue" | "intervalUnit" | "nextDueOn" | "notes">) => request<ApiEnvelope<MaintenancePlan>>("/maintenance-plans/" + id, { method: "PATCH", body: JSON.stringify(input) }),
  deletePlan: (id: string) => emptyRequest("/maintenance-plans/" + id, { method: "DELETE" }),
  deleteAssetFile: (assetId: string, fileId: string) => emptyRequest("/assets/" + assetId + "/files/" + fileId, { method: "DELETE" }),
  completePlan: (id: string, input: { performedOn?: string; notes?: string } = {}) => request<ApiEnvelope<MaintenancePlan>>(`/maintenance-plans/${id}/complete`, { method: 'POST', body: JSON.stringify(input) }),
  uploadInboxFile: async (file: File) => {
    const form = new FormData(); form.set('file', file);
    const response = await fetch('/api/v1/inbox/files', { method: 'POST', headers: authHeaders(), body: form });
    if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorEnvelope | null; throw new Error(body?.error.message ?? 'Nie udało się dodać pliku do Skrzynki.'); }
    return response.json() as Promise<ApiEnvelope<InboxFile>>;
  },
  assignInboxFile: (id: string, assetId: string, kind: AssetFileKind) => request<ApiEnvelope<AssetFile>>(`/inbox/${id}/assign`, { method: 'POST', body: JSON.stringify({ assetId, kind }) }),
  inboxToDocument: (id: string, input: CreateBinderDocumentInput) => request<ApiEnvelope<BinderDocument>>(`/inbox/${id}/to-document`, { method: 'POST', body: JSON.stringify(input) }),
  deleteInboxFile: (id: string) => emptyRequest("/inbox/" + id, { method: "DELETE" }),
  deleteDocumentFile: (documentId: string, fileId: string) => emptyRequest("/documents/" + documentId + "/files/" + fileId, { method: "DELETE" }),
  uploadDocumentFile: async (id: string, file: File) => {
    const form = new FormData(); form.set('file', file);
    const response = await fetch(`/api/v1/documents/${id}/files`, { method: 'POST', headers: authHeaders(), body: form });
    if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorEnvelope | null; throw new Error(body?.error.message ?? 'Nie udało się dodać pliku do dokumentu.'); }
    return response.json() as Promise<ApiEnvelope<AssetFile>>;
  },
  uploadFile: async (id: string, file: File, kind: AssetFileKind) => {
    const form = new FormData(); form.set('file', file); form.set('kind', kind);
    const response = await fetch(`/api/v1/assets/${id}/files`, { method: 'POST', headers: authHeaders(), body: form });
    if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorEnvelope | null; throw new Error(body?.error.message ?? 'Nie udało się dodać pliku.'); }
    return response.json() as Promise<ApiEnvelope<AssetFile>>;
  },
};
