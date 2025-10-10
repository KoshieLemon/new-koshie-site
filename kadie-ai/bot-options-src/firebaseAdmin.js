// ESM module
import admin from 'firebase-admin';

let inited = false;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_ADMIN_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) throw new Error('FIREBASE_ADMIN_JSON not set');
  let json;
  try { json = JSON.parse(raw); } catch { throw new Error('FIREBASE_ADMIN_JSON is not valid JSON'); }
  if (json.private_key && typeof json.private_key === 'string') {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }
  return json;
}

export function initFirebaseAdmin(){
  if (inited) return admin;
  const credJson = loadServiceAccount();
  admin.initializeApp({ credential: admin.credential.cert(credJson) });
  inited = true;
  return admin;
}

export function getDb(){
  initFirebaseAdmin();
  return admin.firestore();
}
