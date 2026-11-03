import { getDatabase } from '@netlify/database';
import { _test } from '../../server/core.js';
import { createAdapter } from '../../server/postgres-adapter.js';

// Daily deletion of expired records. Expires on server immediately even before cleanup.
export default async function cleanup() {
  await _test.cleanup({DB:createAdapter(getDatabase().pool)});
  return new Response('expired records purged',{status:200});
}
export const config={schedule:'0 18 * * *'}; // UTC 18:00 = Asia/Taipei 02:00