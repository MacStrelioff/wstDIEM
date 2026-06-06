import { createInferenceKey, revokeInferenceKey } from '../lib/key-manager.mjs';
import { decodeKeyToken } from '../lib/key-manager.mjs';
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
    await revokeInferenceKey({ keyToken: body.keyToken });
    const effectiveWstDiemWei = await resolveEffectiveWstDiemWei({ body, address: decoded.address });
    const created = await createInferenceKey({ address: decoded.address, effectiveWstDiemWei });
    return json(res, 200, { ...created, effectiveWstDiemWei, rotatedFrom: decoded.veniceKeyId });
  } catch (err) {
    return error(res, err);
  }
}
