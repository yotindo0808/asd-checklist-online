import { getDatabase } from '@netlify/database';
import app from '../../server/core.js';
import { createAdapter } from '../../server/postgres-adapter.js';

// Netlify Functions same-origin API. No secrets or student records go to the web directory.
export default async function handler(request) {
  const db = getDatabase();
  const env={DB:createAdapter(db.pool),ADMIN_PASSWORD:process.env.ADMIN_PASSWORD||'',
    SESSION_PEPPER:process.env.SESSION_PEPPER||'',FRONTEND_ORIGIN:new URL(request.url).origin};
  return app.fetch(request,env);
}
export const config={path:'/api/*'};