import { createInferenceKey } from '../lib/key-manager.mjs';
import { resolveEffectiveWstDiemWei } from '../lib/chain.mjs';
import { error, json, parseBody, requireMethod } from '../lib/http.mjs';

export default async function handler(req, res) {
  try {
    requireMethod(req, ['POST']);
    const body = parseBody(req);
    const address = String(body.address || '').toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      const err = new Error('valid address is required');
      err.status = 400;
      throw err;
    }
    const effectiveWstDiemWei = await resolveEffectiveWstDiemWei({ body, address });
    const created = await createInferenceKey({ address, effectiveWstDiemWei });
    return json(res, 200, { ...created, effectiveWstDiemWei });
  } catch (err) {
    return error(res, err);
  }
}
