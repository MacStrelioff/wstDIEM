import { getKeyStatus } from '../lib/key-manager.mjs';
import { error, json, parseBody, requireMethod } from '../lib/http.mjs';

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const body = parseBody(req);
    if (!body.keyToken) {
      const err = new Error('keyToken is required');
      err.status = 400;
      throw err;
    }
    const status = await getKeyStatus({ keyToken: body.keyToken });
    return json(res, 200, status);
  } catch (err) {
    return error(res, err);
  }
}
