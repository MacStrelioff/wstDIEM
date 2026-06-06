import { decodeKeyToken, syncInferenceKeyLimit } from '../lib/key-manager.mjs';
import { resolveEffectiveWstDiemWei } from '../lib/chain.mjs';
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
    const decoded = decodeKeyToken({ token: body.keyToken });
    const effectiveWstDiemWei = await resolveEffectiveWstDiemWei({ body, address: decoded.address });
    const synced = await syncInferenceKeyLimit({ keyToken: body.keyToken, effectiveWstDiemWei });
    return json(res, 200, { ...synced, effectiveWstDiemWei });
  } catch (err) {
    return error(res, err);
  }
}
