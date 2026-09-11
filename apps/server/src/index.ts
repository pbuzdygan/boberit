import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCipheriv, scryptSync, timingSafeEqual, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AssetFileKind, AssetOptionKind, CreateAssetInput, CreateBinderDocumentInput, TrashKind, IntervalUnit, ScheduleKind, Warranty } from '@boberit/shared';
import { addAssetFile, classifyAssetFile, deleteAssetFile, addDocumentFile, deleteDocumentFile, documentFilesForOcr, setDocumentOcr, getDocumentOcr, saveDocumentOcrText, documentsNeedingOcr, addWebhookDelivery, createHouseholdMember, updateHouseholdMemberRole, removeHouseholdMember, createSession, deleteSession, deleteOtherSessions, userById, updateUserPassword, addAuditEvent, listAuditEvents, storageUsage, createUserAccount, hasUsers, sessionUser, listUserHouseholds, createHouseholdForUser, renameHousehold, setActiveHousehold, listHouseholdMembers, userByLogin, addInboxFile, assignInboxFile, assignInboxToDocument, completeMaintenancePlan, updateMaintenancePlan, deleteMaintenancePlan, deleteInboxFile, createAsset, createDocument, createMaintenancePlan, createAssetOption, createDocumentType, deleteAssetOption, deleteDocumentType, exportBackupData, getAsset, getAssetFile, getDocumentFile, getInboxFile, listAssetOptions, listAssets, listDocuments, listDocumentTypes, listStoredFileLocations, listWebhookDeliveries, listWebhooks, createWebhook, updateWebhook, deleteWebhook, webhookTargets, listInboxFiles, listTrash, moveAssetToTrash, moveDocumentToTrash, permanentlyDeleteTrash, permanentlyDeleteHouseholdTrash, restoreBackupData, restoreTrashEntry, saveWarranty, seedDatabase, updateAsset, updateAssetOption, updateDocument, updateDocumentType } from './db.js';
import { extractDocumentText } from './ocr.js';
import { prepareUpload } from './uploads.js';
import { migrateStoredFiles, readStoredFile, readStoredFileByName, relocateStoredFile, removeStoredFiles, resolveStoredFile, writeStoredFile, type StorageArea } from './storage.js';

const app = new Hono();
const port = Number(process.env.PORT ?? 3000);
const webDist = resolve(process.env.WEB_DIST ?? '../web/dist');
const maxUploadBytes = 25 * 1024 * 1024;
const allowedUploadTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword']);
function validateUpload(file:File):void{if(file.size===0)throw new Error('Nie można dodać pustego pliku.');if(file.size>maxUploadBytes)throw new Error('Plik jest zbyt duży. Maksymalny rozmiar to 25 MB.');if(file.type&&!allowedUploadTypes.has(file.type))throw new Error('Ten typ pliku nie jest obsługiwany.');}

migrateStoredFiles(listStoredFileLocations());
if (process.env.SEED_DEMO === 'true') seedDatabase();
async function runDocumentOcr(householdId:string,documentId:string):Promise<void>{const files=documentFilesForOcr(householdId,documentId);if(!files.length){setDocumentOcr(householdId,documentId,'unsupported','','Dokument nie ma załączników.');return;}setDocumentOcr(householdId,documentId,'processing');try{const parts:string[]=[];let supported=false;const includeFileNames=files.length > 1;for(const file of files){const result=await extractDocumentText(resolveStoredFile('documents',householdId,String(file.stored_name)),String(file.mime_type));if(result.status==='completed'){supported=true;if(result.text.trim())parts.push(includeFileNames ? "[" + String(file.original_name) + "]\n" + result.text.trim() : result.text.trim());}}if(!supported){setDocumentOcr(householdId,documentId,'unsupported','','OCR obsługuje obrazy i PDF.');return;}setDocumentOcr(householdId,documentId,'completed',parts.join('\n\n'));}catch(error){setDocumentOcr(householdId,documentId,'failed','',error instanceof Error?error.message:'Nie udało się rozpoznać tekstu.');}}
function purgeExpiredTrash(): void { removeStoredFiles(permanentlyDeleteTrash(new Date(Date.now() - 30 * 86_400_000).toISOString())); }
purgeExpiredTrash();
app.use('*', logger());
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowHeaders: ['Content-Type', 'Idempotency-Key', 'Authorization'] }));
app.use('/api/v1/*', async (c,next)=>{ const path=new URL(c.req.url).pathname; if(path==='/api/v1/health'||path==='/api/v1/auth/setup'||path==='/api/v1/auth/register'||path==='/api/v1/auth/login') return next(); const token=c.req.header('Authorization')?.replace(/^Bearer\s+/,''); if(!token)return c.json(failure('Zaloguj się, aby użyć API.',401,'UNAUTHORIZED'),401); const user=sessionUser(createHmac('sha256',encryptionKey!).update(token).digest('hex')); if(!user)return c.json(failure('Sesja wygasła lub jest nieprawidłowa.',401,'UNAUTHORIZED'),401); return next(); });

const encryptionKey = process.env.APP_ENC_KEY ? Buffer.from(process.env.APP_ENC_KEY, 'hex') : null;
if (!encryptionKey || encryptionKey.length !== 32) throw new Error('APP_ENC_KEY jest wymagany i musi mieć 64 znaki hex. Wygeneruj go: openssl rand -hex 32');
function encryptSecret(secret: string): string | null { if (!secret) return null; if (!encryptionKey || encryptionKey.length !== 32) throw new Error('Ustaw APP_ENC_KEY (openssl rand -hex 32), aby zapisać sekret webhooka.'); const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',encryptionKey,iv); const value=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]); return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${value.toString('hex')}`; }
function decryptSecret(value: string | null): string | null { if (!value) return null; if (!encryptionKey || encryptionKey.length !== 32) return null; const [iv,tag,data]=value.split(':'); if(!iv||!tag||!data)return null; const cipher=createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(iv,'hex')); cipher.setAuthTag(Buffer.from(tag,'hex')); return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8'); }
function notify(event:string,data:unknown,householdId:string): void { const body=JSON.stringify({event,occurredAt:new Date().toISOString(),data}); for(const target of webhookTargets(event, householdId)){ const secret=decryptSecret(typeof target.secret_encrypted==='string'?target.secret_encrypted:null); const headers:Record<string,string>={'Content-Type':'application/json','X-Boberit-Event':event}; if(secret)headers['X-Boberit-Signature']='sha256='+createHmac('sha256',secret).update(body).digest('hex'); const targetUrl=String(target.url); const discord=/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(targetUrl); const item=(data as {name?:string}).name ?? 'bez nazwy'; const copy:Record<string,{title:string;text:string;color:number}>={'asset.created':{title:'Dodano przedmiot',text:`**${item}** został dodany do kolekcji.`,color:0x22c55e},'asset.deleted':{title:'Przedmiot przeniesiono do Kosza',text:`**${item}** będzie dostępny do przywrócenia przez 30 dni.`,color:0xef4444},'document.created':{title:'Dodano dokument',text:`**${item}** trafił do Segregatora.`,color:0x22c55e},'document.deleted':{title:'Dokument przeniesiono do Kosza',text:`**${item}** będzie dostępny do przywrócenia przez 30 dni.`,color:0xef4444}}; const message=copy[event] ?? {title:'Zdarzenie Boberit',text:event,color:0x0068e8}; const outbound=discord ? JSON.stringify({ username:'Boberit', embeds:[{ title:message.title, description:message.text, color:message.color, footer:{text:'Boberit'}, timestamp:new Date().toISOString() }] }) : body; void fetch(targetUrl,{method:'POST',headers,body:outbound}).then((response)=>{addWebhookDelivery({webhookId:String(target.id),event,status:response.status,error:response.ok?null:`HTTP ${response.status}`});console.log(`Webhook ${String(target.name)} · ${event} · HTTP ${response.status}`)}).catch((error)=>{addWebhookDelivery({webhookId:String(target.id),event,status:null,error:String(error)});console.error(`Webhook ${String(target.name)} · ${event} · błąd wysyłki:`, error)}); } }
function failure(message: string, status = 400, code = 'VALIDATION_ERROR') {
  return { error: { code, message }, status };
}
async function json<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { throw new Error('Nieprawidłowy JSON.'); }
}

function passwordHash(password:string):string{const salt=randomBytes(16);return salt.toString('hex')+':'+scryptSync(password,salt,64).toString('hex');}
function verifyPassword(password:string,stored:string):boolean{const [salt,value]=stored.split(':');if(!salt||!value)return false;const actual=scryptSync(password,Buffer.from(salt,'hex'),64);return timingSafeEqual(actual,Buffer.from(value,'hex'));}
function currentUser(request: Request){const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/,'');return token?sessionUser(createHmac('sha256',encryptionKey!).update(token).digest('hex')):undefined;}
function householdId(request: Request): string { const user=currentUser(request); if(!user?.household_id) throw new Error('Nie wybrano aktywnego gospodarstwa.'); return String(user.household_id); }
function tokenHash(request: Request):string { const token=request.headers.get('Authorization')?.replace(/^Bearer\s+/,''); return createHmac('sha256',encryptionKey!).update(token??'').digest('hex'); }
function locatedFile(scope:string,id:string) {
  const item=getAssetFile(scope,id); if(item)return {file:item,area:'items' as StorageArea};
  const inbox=getInboxFile(scope,id); if(inbox)return {file:inbox,area:'inbox' as StorageArea};
  const document=getDocumentFile(scope,id); if(document)return {file:document,area:'documents' as StorageArea};
  return null;
}

app.get('/api/v1/households',(c)=>{const user=currentUser(c.req.raw);return c.json({data:{activeHouseholdId:user?.household_id ?? null,households:user?listUserHouseholds(String(user.id)):[]}});});
app.post('/api/v1/households',async(c)=>{const user=currentUser(c.req.raw)!;const input=await json<{name:string}>(c.req.raw);if(!input.name?.trim()||input.name.trim().length>80)return c.json(failure('Podaj nazwę gospodarstwa (maks. 80 znaków).'),400);return c.json({data:createHouseholdForUser(String(user.id),input.name)},201);});
app.patch('/api/v1/households/:id',async(c)=>{const user=currentUser(c.req.raw)!;const input=await json<{name:string}>(c.req.raw);if(!input.name?.trim()||input.name.trim().length>80)return c.json(failure('Podaj nazwę gospodarstwa (maks. 80 znaków).'),400);return renameHousehold(String(user.id),c.req.param('id'),input.name)?c.json({data:{renamed:true}}):c.json(failure('Tylko właściciel może zmienić nazwę gospodarstwa.',403,'FORBIDDEN'),403);});
app.post('/api/v1/households/active',async(c)=>{const user=currentUser(c.req.raw);const input=await json<{householdId:string}>(c.req.raw);if(!user||!input.householdId||!setActiveHousehold(tokenHash(c.req.raw),String(user.id),input.householdId))return c.json(failure('Nie możesz wybrać tego gospodarstwa.',403,'FORBIDDEN'),403);return c.json({data:{activeHouseholdId:input.householdId}});});
app.get('/api/v1/household/asset-options',(c)=>c.json({data:listAssetOptions(householdId(c.req.raw))}));
app.post('/api/v1/household/asset-options',async(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może dodawać kategorie i lokalizacje.',403,'FORBIDDEN'),403);const input=await json<{kind:AssetOptionKind;name:string}>(c.req.raw);if(input.kind!=='category'&&input.kind!=='location')return c.json(failure('Nieprawidłowy typ słownika.'),400);try{return c.json({data:createAssetOption(String(user.household_id),input.kind,input.name??'')},201)}catch(error){return c.json(failure(error instanceof Error&&error.message.includes('UNIQUE')?'Taka pozycja już istnieje.':error instanceof Error?error.message:'Nie udało się dodać pozycji.'),400)}});
app.patch('/api/v1/household/asset-options/:id',async(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może zmieniać kategorie i lokalizacje.',403,'FORBIDDEN'),403);const input=await json<{name:string}>(c.req.raw);try{const option=updateAssetOption(String(user.household_id),c.req.param('id'),input.name??'');return option?c.json({data:option}):c.json(failure('Nie znaleziono pozycji.',404,'NOT_FOUND'),404)}catch(error){return c.json(failure(error instanceof Error&&error.message.includes('UNIQUE')?'Taka pozycja już istnieje.':error instanceof Error?error.message:'Nie udało się zmienić pozycji.'),400)}});
app.delete('/api/v1/household/asset-options/:id',(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może usuwać kategorie i lokalizacje.',403,'FORBIDDEN'),403);return deleteAssetOption(String(user.household_id),c.req.param('id'))?c.body(null,204):c.json(failure('Nie znaleziono pozycji.',404,'NOT_FOUND'),404)});
app.get('/api/v1/household/document-types',(c)=>c.json({data:listDocumentTypes(householdId(c.req.raw))}));
app.post('/api/v1/household/document-types',async(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może dodawać typy dokumentów.',403,'FORBIDDEN'),403);const input=await json<{name:string}>(c.req.raw);try{return c.json({data:createDocumentType(String(user.household_id),input.name??'')},201)}catch(error){return c.json(failure(error instanceof Error&&error.message.includes('UNIQUE')?'Taki typ dokumentu już istnieje.':error instanceof Error?error.message:'Nie udało się dodać typu.'),400)}});
app.patch('/api/v1/household/document-types/:id',async(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może zmieniać typy dokumentów.',403,'FORBIDDEN'),403);const input=await json<{name:string}>(c.req.raw);try{const type=updateDocumentType(String(user.household_id),c.req.param('id'),input.name??'');return type?c.json({data:type}):c.json(failure('Nie znaleziono typu.',404,'NOT_FOUND'),404)}catch(error){return c.json(failure(error instanceof Error&&error.message.includes('UNIQUE')?'Taki typ dokumentu już istnieje.':error instanceof Error?error.message:'Nie udało się zmienić typu.'),400)}});
app.delete('/api/v1/household/document-types/:id',(c)=>{const user=currentUser(c.req.raw);if(!user||user.role!=='owner')return c.json(failure('Tylko właściciel może usuwać typy dokumentów.',403,'FORBIDDEN'),403);return deleteDocumentType(String(user.household_id),c.req.param('id'))?c.body(null,204):c.json(failure('Nie znaleziono typu.',404,'NOT_FOUND'),404)});
app.get('/api/v1/household/members',(c)=>{const user=currentUser(c.req.raw);if(!user)return c.json(failure('Brak sesji.',401,'UNAUTHORIZED'),401);return c.json({data:{members:listHouseholdMembers(String(user.household_id)),canManage:user.role==='owner'}});});
app.post('/api/v1/household/members',async(c)=>{const admin=currentUser(c.req.raw);if(!admin||admin.role!=='owner')return c.json(failure('Tylko właściciel może tworzyć konta.',403,'FORBIDDEN'),403);const input=await json<{login:string;email:string;password:string;role:'owner'|'member'}>(c.req.raw);if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(input.login)||!/^\S+@\S+\.\S+$/.test(input.email)||input.password.length<12)return c.json(failure('Podaj poprawny login, e-mail i hasło mające co najmniej 12 znaków.'));const member=createHouseholdMember({householdId:String(admin.household_id),login:input.login,email:input.email,passwordHash:passwordHash(input.password),role:input.role==='owner'?'owner':'member'});return c.json({data:member},201);});
app.patch('/api/v1/household/members/:id',async(c)=>{const admin=currentUser(c.req.raw);if(!admin||admin.role!=='owner')return c.json(failure('Tylko właściciel może zmieniać role.',403,'FORBIDDEN'),403);const input=await json<{role:'owner'|'member'}>(c.req.raw);if(input.role!=='owner'&&input.role!=='member')return c.json(failure('Wybierz poprawną rolę.'),400);try{return updateHouseholdMemberRole(String(admin.household_id),c.req.param('id'),input.role)?c.json({data:{updated:true}}):c.json(failure('Nie znaleziono członka.',404,'NOT_FOUND'),404)}catch(error){return c.json(failure(error instanceof Error?error.message:'Nie udało się zmienić roli.'),400)}});
app.delete('/api/v1/household/members/:id',(c)=>{const admin=currentUser(c.req.raw);if(!admin||admin.role!=='owner')return c.json(failure('Tylko właściciel może usuwać członków.',403,'FORBIDDEN'),403);try{return removeHouseholdMember(String(admin.household_id),c.req.param('id'))?c.body(null,204):c.json(failure('Nie znaleziono członka.',404,'NOT_FOUND'),404)}catch(error){return c.json(failure(error instanceof Error?error.message:'Nie udało się usunąć członka.'),400)}});
app.get('/api/v1/auth/me',(c)=>{const user=currentUser(c.req.raw);return user?c.json({data:{id:user.id,login:user.login,email:user.email,householdId:user.household_id,role:user.role}}):c.json(failure('Brak sesji.',401,'UNAUTHORIZED'),401);});
app.post('/api/v1/auth/logout',(c)=>{deleteSession(tokenHash(c.req.raw));return c.body(null,204);});
app.post('/api/v1/auth/password',async(c)=>{const user=currentUser(c.req.raw)!;const input=await json<{currentPassword:string;newPassword:string}>(c.req.raw);const record=userById(String(user.id));if(!record||!verifyPassword(input.currentPassword,String(record.password_hash)))return c.json(failure('Obecne hasło jest nieprawidłowe.',401,'INVALID_CREDENTIALS'),401);if(input.newPassword.length<12)return c.json(failure('Nowe hasło musi mieć co najmniej 12 znaków.'),400);updateUserPassword(String(user.id),passwordHash(input.newPassword));deleteOtherSessions(String(user.id),tokenHash(c.req.raw));addAuditEvent({householdId:String(user.household_id),userId:String(user.id),action:'password.changed',entityKind:'account',entityId:String(user.id),label:String(user.login)});return c.json({data:{changed:true}});});
app.post('/api/v1/auth/logout-others',(c)=>{const user=currentUser(c.req.raw)!;const count=deleteOtherSessions(String(user.id),tokenHash(c.req.raw));addAuditEvent({householdId:String(user.household_id),userId:String(user.id),action:'sessions.revoked',entityKind:'account',entityId:String(user.id),label:String(user.login)});return c.json({data:{revoked:count}});});
app.get('/api/v1/settings/activity',(c)=>c.json({data:listAuditEvents(householdId(c.req.raw))}));
app.get('/api/v1/settings/storage',(c)=>c.json({data:storageUsage(householdId(c.req.raw))}));
app.get('/api/v1/auth/setup', (c)=>c.json({data:{needsSetup:!hasUsers()}}));
app.post('/api/v1/auth/register', async(c)=>{if(hasUsers())return c.json(failure('Konfiguracja pierwszego konta została już zakończona.',409,'ALREADY_CONFIGURED'),409);const input=await json<{login:string;email:string;password:string;householdName:string}>(c.req.raw);if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(input.login)||!/^\S+@\S+\.\S+$/.test(input.email)||input.password.length<12||!input.householdName.trim())return c.json(failure('Podaj login, poprawny e-mail, nazwę gospodarstwa i hasło mające co najmniej 12 znaków.'));const user=createUserAccount({login:input.login,email:input.email,passwordHash:passwordHash(input.password),householdName:input.householdName.trim()});const token=randomBytes(32).toString('hex');createSession(user.id,createHmac('sha256',encryptionKey!).update(token).digest('hex'));return c.json({data:{user,token}},201);});
app.post('/api/v1/auth/login',async(c)=>{const input=await json<{login:string;password:string}>(c.req.raw);const user=userByLogin(input.login);if(!user||!verifyPassword(input.password,String(user.password_hash)))return c.json(failure('Nieprawidłowy login lub hasło.',401,'INVALID_CREDENTIALS'),401);const token=randomBytes(32).toString('hex');createSession(String(user.id),createHmac('sha256',encryptionKey!).update(token).digest('hex'));return c.json({data:{user:{id:user.id,login:user.login,email:user.email},token}});});
app.get('/api/v1/health', (c) => c.json({ status: 'ok', service: 'boberit-api', time: new Date().toISOString() }));
app.get('/api/v1/settings/webhook-deliveries', (c) => {const user=currentUser(c.req.raw)!;return c.json({data:listWebhookDeliveries(String(user.id))});});
app.get('/api/v1/settings/webhooks', (c) => {const user=currentUser(c.req.raw)!;return c.json({ data: listWebhooks(String(user.id)).map((row) => ({ id:row.id,name:row.name,url:row.url,events:JSON.parse(String(row.events_json)),scopeAll:Number(row.scope_all)===1,householdIds:JSON.parse(String(row.household_ids_json??'[]')),createdAt:row.created_at })) });});
app.post('/api/v1/settings/webhooks', async (c) => { const input=await json<{name:string;url:string;secret?:string;events:string[];householdIds?:string[]}>(c.req.raw); if(!input.name?.trim()||!/^https?:\/\//.test(input.url)||!Array.isArray(input.events)||!input.events.length)return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'),400); const user=currentUser(c.req.raw)!; const allowed=new Set(listUserHouseholds(String(user.id)).map(row=>String(row.id))); const householdIds=(input.householdIds??[]).filter(id=>allowed.has(id)); const hook=createWebhook({userId:String(user.id),name:input.name.trim(),url:input.url.trim(),secretEncrypted:encryptSecret(input.secret?.trim()??''),events:input.events,householdIds}); return c.json({data:hook},201); });
app.patch('/api/v1/settings/webhooks/:id', async (c) => { const input=await json<{name:string;url:string;secret?:string;events:string[];householdIds?:string[]}>(c.req.raw); if(!input.name?.trim()||!/^https?:\/\//.test(input.url)||!Array.isArray(input.events)||!input.events.length)return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'),400); const user=currentUser(c.req.raw)!; const allowed=new Set(listUserHouseholds(String(user.id)).map(row=>String(row.id))); const householdIds=(input.householdIds??[]).filter(id=>allowed.has(id)); const secretEncrypted=input.secret?.trim()?encryptSecret(input.secret.trim()):undefined; return updateWebhook(String(user.id),c.req.param('id'),{name:input.name.trim(),url:input.url.trim(),secretEncrypted,events:input.events,householdIds})?c.json({data:{updated:true}}):c.json(failure('Nie znaleziono webhooka.',404,'NOT_FOUND'),404); });
app.delete('/api/v1/settings/webhooks/:id',(c)=>deleteWebhook(String(currentUser(c.req.raw)!.id),c.req.param('id'))?c.body(null,204):c.json(failure('Nie znaleziono webhooka.',404,'NOT_FOUND'),404));
app.get('/api/v1/settings/export', (c) => {
  const backup = exportBackupData(householdId(c.req.raw));
  const files = backup.storedNames.flatMap((storedName) => {
    try { return [{ storedName, base64: readStoredFileByName(storedName).toString('base64') }]; }
    catch { return []; }
  });
  const filename = `boberit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  notify('backup.exported',{},householdId(c.req.raw)); return new Response(JSON.stringify({ format: 'boberit-backup', version: 1, exportedAt: new Date().toISOString(), tables: backup.tables, files }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'X-Content-Type-Options': 'nosniff' } });
});
app.post('/api/v1/settings/import', async (c) => {
  const form = await c.req.raw.formData(); const raw = form.get('file'); const confirmation = String(form.get('confirmation') ?? '');
  if (!raw || typeof raw === 'string') return c.json(failure('Wybierz pakiet Boberit.'), 400);
  if (confirmation !== 'ZASTĄP') return c.json(failure('Wpisz ZASTĄP, aby potwierdzić odtworzenie.'), 400);
  if (raw.size > 100 * 1024 * 1024) return c.json(failure('Pakiet jest zbyt duży. Maksymalny rozmiar to 100 MB.'), 400);
  let backup: { format?: string; version?: number; tables?: Record<string, Record<string, unknown>[]>; files?: { storedName?: string; base64?: string }[] };
  try { backup = JSON.parse(await raw.text()) as typeof backup; } catch { return c.json(failure('Plik nie jest poprawnym JSON-em backupu.'), 400); }
  const required = ['assets','warranties','maintenance_plans','maintenance_records','asset_files','inbox_files','documents','document_files','document_ocr'];
  if (backup.format !== 'boberit-backup' || backup.version !== 1 || !backup.tables || !required.every((key) => Array.isArray(backup.tables![key])) || !Array.isArray(backup.files)) return c.json(failure('To nie jest obsługiwany pakiet Boberit v1.'), 400);
  const expected = [
    ...backup.tables.asset_files!.map((row) => ({ storedName: String(row.stored_name), area: 'items' as StorageArea })),
    ...backup.tables.inbox_files!.map((row) => ({ storedName: String(row.stored_name), area: 'inbox' as StorageArea })),
    ...backup.tables.document_files!.map((row) => ({ storedName: String(row.stored_name), area: 'documents' as StorageArea })),
  ];
  const fileMap = new Map(backup.files.map((file) => [file.storedName, file.base64]));
  if (!expected.every((file) => fileMap.has(file.storedName) && typeof fileMap.get(file.storedName) === 'string')) return c.json(failure('Pakiet nie zawiera wszystkich załączników.'), 400);
  const decoded = expected.map((file) => ({ ...file, data: Buffer.from(fileMap.get(file.storedName)!, 'base64') }));
  if (decoded.some((file) => !file.data.length)) return c.json(failure('Pakiet zawiera uszkodzony załącznik.'), 400);
  const scope = householdId(c.req.raw);
  const oldFiles = restoreBackupData(scope, backup.tables as Record<string, Record<string, unknown>[]>);
  removeStoredFiles(oldFiles);
  for (const file of decoded) writeStoredFile(file.area, scope, file.storedName, file.data);
  notify('backup.restored',{attachments:decoded.length},scope); return c.json({ data: { restored: true, attachments: decoded.length } });
});
app.get('/api/v1/assets', (c) => c.json({ data: listAssets(householdId(c.req.raw), c.req.query('q') ?? '') }));
app.get('/api/v1/inbox', (c) => c.json({ data: listInboxFiles(householdId(c.req.raw)) }));
app.get('/api/v1/trash', (c) => { purgeExpiredTrash(); const requestedKind = c.req.query('kind'); const kind: TrashKind | undefined = requestedKind === 'asset' || requestedKind === 'document' ? requestedKind : undefined; return c.json({ data: listTrash(householdId(c.req.raw), kind) }); });
app.get('/api/v1/documents', (c) => c.json({ data: listDocuments(householdId(c.req.raw), c.req.query('q') ?? '') }));
app.get('/api/v1/assets/:id', (c) => {
  const asset = getAsset(householdId(c.req.raw), c.req.param('id'));
  return asset ? c.json({ data: asset }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
app.post('/api/v1/assets', async (c) => {
  const input = await json<CreateAssetInput>(c.req.raw);
  const asset = createAsset(householdId(c.req.raw), input);
  addAuditEvent({householdId:householdId(c.req.raw),userId:String(currentUser(c.req.raw)!.id),action:'created',entityKind:'asset',entityId:asset.id,label:asset.name});notify('asset.created',{id:asset.id,name:asset.name},householdId(c.req.raw)); return c.json({ data: asset }, 201);
});
app.post('/api/v1/documents', async (c) => {
  const document = createDocument(householdId(c.req.raw), await json<CreateBinderDocumentInput>(c.req.raw));
  addAuditEvent({householdId:householdId(c.req.raw),userId:String(currentUser(c.req.raw)!.id),action:'created',entityKind:'document',entityId:document.id,label:document.name});notify('document.created',{id:document.id,name:document.name},householdId(c.req.raw)); return c.json({ data: document }, 201);
});
app.get('/api/v1/documents/:id/ocr',(c)=>{const data=getDocumentOcr(householdId(c.req.raw),c.req.param('id'));return data?c.json({data}):c.json(failure('OCR nie został jeszcze uruchomiony.',404,'NOT_FOUND'),404);});
app.put('/api/v1/documents/:id/ocr',async(c)=>{const input=await json<{text:string}>(c.req.raw);return saveDocumentOcrText(householdId(c.req.raw),c.req.param('id'),String(input.text??''))?c.json({data:{saved:true}}):c.json(failure('Nie znaleziono dokumentu.',404,'NOT_FOUND'),404);});
app.post('/api/v1/documents/ocr/batch',async(c)=>{const scope=householdId(c.req.raw);const docs=documentsNeedingOcr(scope);for(const doc of docs)await runDocumentOcr(scope,String(doc.id));return c.json({data:{processed:docs.length}});});
app.post('/api/v1/documents/:id/ocr',async(c)=>{const scope=householdId(c.req.raw);await runDocumentOcr(scope,c.req.param('id'));return c.json({data:{processed:true}});});
app.patch('/api/v1/documents/:id', async (c) => {
  const document = updateDocument(householdId(c.req.raw), c.req.param('id'), await json<Partial<CreateBinderDocumentInput>>(c.req.raw));
  return document ? c.json({ data: document }) : c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
});
app.delete('/api/v1/documents/:id',(c)=>{const scope=householdId(c.req.raw);const document=listDocuments(scope).find(entry=>entry.id===c.req.param('id'));if(!moveDocumentToTrash(scope,c.req.param('id')))return c.json(failure('Nie znaleziono dokumentu.',404,'NOT_FOUND'),404);addAuditEvent({householdId:scope,userId:String(currentUser(c.req.raw)!.id),action:'trashed',entityKind:'document',entityId:c.req.param('id'),label:document?.name??''});notify('document.deleted',{id:c.req.param('id'),name:document?.name},scope);return c.body(null,204);});
app.post('/api/v1/documents/:id/files', async (c) => {
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new Error('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope=householdId(c.req.raw); writeStoredFile('documents',scope,storedName,upload.data);
  const file = addDocumentFile(scope, c.req.param('id'), { originalName: upload.originalName, storedName, mimeType: upload.mimeType, byteSize: upload.byteSize });
  if(file){setDocumentOcr(scope,c.req.param('id'),'pending');return c.json({ data: file }, 201);} return c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
});
app.delete('/api/v1/documents/:id/files/:fileId', async (c) => {
  const scope = householdId(c.req.raw);
  const documentId = c.req.param('id');
  const removed = deleteDocumentFile(scope, documentId, c.req.param('fileId'));
  if (!removed) return c.json(failure('Nie znaleziono załącznika dokumentu.', 404, 'NOT_FOUND'), 404);
  setDocumentOcr(scope, documentId, 'pending');
  removeStoredFiles([removed.storedName]);
  if (removed.remainingFiles > 0) await runDocumentOcr(scope, documentId);
  else setDocumentOcr(scope, documentId, 'unsupported', '', 'Dokument nie ma załączników.');
  return c.body(null, 204);
});
app.patch('/api/v1/assets/:id', async (c) => {
  const asset = updateAsset(householdId(c.req.raw), c.req.param('id'), await json<Partial<CreateAssetInput>>(c.req.raw));
  return asset ? c.json({ data: asset }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
app.delete('/api/v1/assets/:id',(c)=>{const scope=householdId(c.req.raw);const asset=getAsset(scope,c.req.param('id'));if(!moveAssetToTrash(scope,c.req.param('id')))return c.json(failure('Nie znaleziono przedmiotu.',404,'NOT_FOUND'),404);addAuditEvent({householdId:scope,userId:String(currentUser(c.req.raw)!.id),action:'trashed',entityKind:'asset',entityId:c.req.param('id'),label:asset?.name??''});notify('asset.deleted',{id:c.req.param('id'),name:asset?.name},scope);return c.body(null,204);});
app.put('/api/v1/assets/:id/warranty', async (c) => {
  const warranty = saveWarranty(householdId(c.req.raw), c.req.param('id'), await json<Warranty>(c.req.raw));
  return warranty ? c.json({ data: warranty }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
app.post('/api/v1/assets/:id/files', async (c) => {
  const assetId = c.req.param('id');
  if (!getAsset(householdId(c.req.raw), assetId)) return c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new Error('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const requestedKind = String(form.get('kind') ?? 'other');
  const kind: AssetFileKind = ['photo', 'receipt', 'manual', 'other'].includes(requestedKind) ? requestedKind as AssetFileKind : 'other';
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope=householdId(c.req.raw);
  writeStoredFile('items',scope,storedName,upload.data);
  const file = addAssetFile(scope, assetId, { kind, kindLocked: String(form.get('provisional') ?? '') !== 'true', originalName: upload.originalName, storedName, mimeType: upload.mimeType, byteSize: upload.byteSize });
  return c.json({ data: file }, 201);
});
app.patch('/api/v1/assets/:id/files/:fileId',async(c)=>{const input=await json<{kind:AssetFileKind}>(c.req.raw);if(!['photo','receipt','manual','other'].includes(input.kind))return c.json(failure('Wybierz poprawny typ pliku.'),400);const file=classifyAssetFile(householdId(c.req.raw),c.req.param('id'),c.req.param('fileId'),input.kind);return file?c.json({data:file}):c.json(failure('Typ tego pliku został już określony lub plik nie istnieje.',409,'ALREADY_CLASSIFIED'),409)});
app.delete('/api/v1/assets/:id/files/:fileId', (c) => {
  const storedName = deleteAssetFile(householdId(c.req.raw), c.req.param('id'), c.req.param('fileId'));
  if (!storedName) return c.json(failure('Nie znaleziono załącznika przedmiotu.', 404, 'NOT_FOUND'), 404);
  removeStoredFiles([storedName]);
  return c.body(null, 204);
});
app.get('/api/v1/files/:id/download', (c) => {
  const scope=householdId(c.req.raw);
  const located=locatedFile(scope,c.req.param('id'));
  if (!located) return c.json(failure('Nie znaleziono pliku.', 404, 'NOT_FOUND'), 404);
  const {file}=located;
  return new Response(new Uint8Array(readStoredFile(located.area,scope,file.storedName)), { headers: {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.byteSize),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    'X-Content-Type-Options': 'nosniff',
  } });
});
app.get('/api/v1/files/:id/preview', (c) => {
  const scope=householdId(c.req.raw);
  const located=locatedFile(scope,c.req.param('id'));
  if (!located) return c.json(failure('Nie znaleziono pliku.', 404, 'NOT_FOUND'), 404);
  const {file}=located;
  return new Response(new Uint8Array(readStoredFile(located.area,scope,file.storedName)), { headers: {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.byteSize),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    'X-Content-Type-Options': 'nosniff',
  } });
});
app.post('/api/v1/inbox/files', async (c) => {
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new Error('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope=householdId(c.req.raw);
  writeStoredFile('inbox',scope,storedName,upload.data);
  const file = addInboxFile(scope, { originalName: upload.originalName, storedName, mimeType: upload.mimeType, byteSize: upload.byteSize });
  return c.json({ data: file }, 201);
});
app.delete('/api/v1/inbox/:id', (c) => {
  const storedName = deleteInboxFile(householdId(c.req.raw), c.req.param('id'));
  if (!storedName) return c.json(failure('Nie znaleziono pliku w Skrzynce.', 404, 'NOT_FOUND'), 404);
  removeStoredFiles([storedName]);
  return c.body(null, 204);
});
app.post('/api/v1/inbox/:id/assign', async (c) => {
  const input = await json<{ assetId: string; kind: AssetFileKind }>(c.req.raw);
  const kind: AssetFileKind = ['photo', 'receipt', 'manual', 'other'].includes(input.kind) ? input.kind : 'other';
  const scope=householdId(c.req.raw);
  const source=getInboxFile(scope,c.req.param('id'));
  const file = assignInboxFile(scope, c.req.param('id'), input.assetId, kind);
  if(file&&source)relocateStoredFile('items',scope,source.storedName);
  return file ? c.json({ data: file }) : c.json(failure('Nie znaleziono pliku lub przedmiotu.', 404, 'NOT_FOUND'), 404);
});
app.post('/api/v1/inbox/:id/to-document', async (c) => {
  const scope=householdId(c.req.raw);
  const source=getInboxFile(scope,c.req.param('id'));
  const document = assignInboxToDocument(scope, c.req.param('id'), await json<CreateBinderDocumentInput>(c.req.raw));
  if(document&&source){relocateStoredFile('documents',scope,source.storedName);await runDocumentOcr(scope,document.id);}
  return document ? c.json({ data: document }) : c.json(failure('Nie znaleziono pliku w Skrzynce.', 404, 'NOT_FOUND'), 404);
});
app.post('/api/v1/assets/:id/maintenance-plans', async (c) => {
  const plan = createMaintenancePlan(householdId(c.req.raw), c.req.param('id'), await json<{ title: string; scheduleKind: ScheduleKind; intervalValue?: number; intervalUnit?: IntervalUnit; nextDueOn?: string; notes?: string }>(c.req.raw));
  if(plan)notify('maintenance.created',{id:plan.id,title:plan.title},householdId(c.req.raw)); return plan ? c.json({ data: plan }, 201) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
app.patch('/api/v1/maintenance-plans/:id', async (c) => {
  const plan = updateMaintenancePlan(householdId(c.req.raw), c.req.param('id'), await json<{ title: string; scheduleKind: ScheduleKind; intervalValue?: number | null; intervalUnit?: IntervalUnit | null; nextDueOn?: string | null; notes?: string | null }>(c.req.raw));
  return plan ? c.json({ data: plan }) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404);
});
app.delete('/api/v1/maintenance-plans/:id', (c) => deleteMaintenancePlan(householdId(c.req.raw), c.req.param('id')) ? c.body(null, 204) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404));
app.post('/api/v1/trash/:kind/:id/restore', (c) => {
  const kind = c.req.param('kind');
  if (kind !== 'asset' && kind !== 'document') return c.json(failure('Nieprawidłowy rodzaj elementu.'), 400);
  return restoreTrashEntry(householdId(c.req.raw), kind, c.req.param('id')) ? c.body(null, 204) : c.json(failure('Nie znaleziono elementu w Koszu.', 404, 'NOT_FOUND'), 404);
});
app.delete('/api/v1/trash', (c) => { removeStoredFiles(permanentlyDeleteHouseholdTrash(householdId(c.req.raw))); return c.body(null, 204); });
app.post('/api/v1/maintenance-plans/:id/complete', async (c) => {
  const plan = completeMaintenancePlan(householdId(c.req.raw), c.req.param('id'), await json<{ performedOn?: string; notes?: string }>(c.req.raw));
  if(plan)notify('maintenance.completed',{id:plan.id,title:plan.title},householdId(c.req.raw)); return plan ? c.json({ data: plan }) : c.json(failure('Nie znaleziono planu.', 404, 'NOT_FOUND'), 404);
});

app.onError((error, c) => {
  console.error(error);
  return c.json(failure(error instanceof Error ? error.message : 'Nieoczekiwany błąd serwera.', 400), 400);
});

app.use('/*', serveStatic({ root: webDist }));
app.get('*', () => new Response(readFileSync(resolve(webDist, 'index.html')), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Boberit działa na http://localhost:${info.port}`);
});
