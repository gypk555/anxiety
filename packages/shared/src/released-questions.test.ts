import { describe, expect, it } from 'vitest';
import { QUESTIONS } from './questions.ts';

/**
 * Every released question, frozen: type, theme, position and a sha256 of its wording. Saved answers point at these ids,
 * and a theme decides how an answer reads (strain or support), so none of this may change once released. To reword or
 * move a question, add a new id and retire the old one; then add the new id here. Never edit an existing line.
 */
const RELEASED: Record<string, [string, string | null, number | null, string]> = {
  'GAD7-1': ['gad7', null, 1, 'a608faf93c7fe84f'],
  'GAD7-2': ['gad7', null, 2, 'f0412d630d01a77c'],
  'GAD7-3': ['gad7', null, 3, 'd3d338b468725df4'],
  'GAD7-4': ['gad7', null, 4, '8c0b7a6b0ee0f7db'],
  'GAD7-5': ['gad7', null, 5, '66cf6024e2ff522e'],
  'GAD7-6': ['gad7', null, 6, 'ec61ae10a65ecc53'],
  'GAD7-7': ['gad7', null, 7, '56e9c044eea906e9'],
  'REF-001': ['reflection', 'worry', null, '4d9a7f1b8e9bc4e7'],
  'REF-002': ['reflection', 'worry', null, '1a101ebd35924f6a'],
  'REF-003': ['reflection', 'worry', null, '884629cb3634496b'],
  'REF-004': ['reflection', 'worry', null, 'cb72f641eda3ab1b'],
  'REF-005': ['reflection', 'worry', null, 'aa407407a3a4d050'],
  'REF-006': ['reflection', 'worry', null, 'b48b594607c9c1fa'],
  'REF-007': ['reflection', 'worry', null, '819a17d8c6a18c39'],
  'REF-008': ['reflection', 'worry', null, 'c1c1597d2d08a2dc'],
  'REF-009': ['reflection', 'worry', null, '80f864d63f3703af'],
  'REF-010': ['reflection', 'worry', null, '73bc216940483ba6'],
  'REF-011': ['reflection', 'worry', null, '20de36ba8f244692'],
  'REF-012': ['reflection', 'worry', null, '591e8b0d3eaced35'],
  'REF-013': ['reflection', 'worry', null, '7302006a51480e03'],
  'REF-014': ['reflection', 'worry', null, 'a6bc49ca2cd6d173'],
  'REF-015': ['reflection', 'worry', null, '3a4a9b72e3520411'],
  'REF-016': ['reflection', 'worry', null, '882c346128a1f706'],
  'REF-017': ['reflection', 'worry', null, '96c92ad66f16318c'],
  'REF-018': ['reflection', 'worry', null, '06f867a57b166e62'],
  'REF-019': ['reflection', 'worry', null, 'ae17524f6355b748'],
  'REF-020': ['reflection', 'worry', null, '9930e87c653ec052'],
  'REF-021': ['reflection', 'body', null, '1873803ab4140104'],
  'REF-022': ['reflection', 'body', null, 'e37f56afbdcd8f31'],
  'REF-023': ['reflection', 'body', null, 'cc611166b4ec03c2'],
  'REF-024': ['reflection', 'body', null, '24bc98e166bbad1b'],
  'REF-025': ['reflection', 'body', null, '5881a1951b978e20'],
  'REF-026': ['reflection', 'body', null, '6644874e1ba1ad88'],
  'REF-027': ['reflection', 'body', null, '1fcdca0c1991d557'],
  'REF-028': ['reflection', 'body', null, 'f339b4c61c2a001f'],
  'REF-029': ['reflection', 'body', null, '1c99ff883107940a'],
  'REF-030': ['reflection', 'body', null, '08b8a90d414dbe0a'],
  'REF-031': ['reflection', 'body', null, '43c9c695301812f3'],
  'REF-032': ['reflection', 'body', null, 'ab01a0d226b6c5a3'],
  'REF-033': ['reflection', 'body', null, '6c3ff23a908ce35a'],
  'REF-034': ['reflection', 'body', null, 'd0e928b52d3f504b'],
  'REF-035': ['reflection', 'body', null, '207f2f157fcbf218'],
  'REF-036': ['reflection', 'body', null, '39b00b7aa20c2073'],
  'REF-037': ['reflection', 'body', null, 'd1d3edd7e616e945'],
  'REF-038': ['reflection', 'body', null, '6bf0e60c22c2e27b'],
  'REF-039': ['reflection', 'body', null, '148d014395e39daa'],
  'REF-040': ['reflection', 'body', null, '0191476810054748'],
  'REF-041': ['reflection', 'situations', null, '5ac55115ded441ba'],
  'REF-042': ['reflection', 'situations', null, '55ecaa8a6ee12d3c'],
  'REF-043': ['reflection', 'situations', null, '963f2b68957faa0e'],
  'REF-044': ['reflection', 'situations', null, '433a56b16c12c98d'],
  'REF-045': ['reflection', 'situations', null, '76006ea3c4229f7c'],
  'REF-046': ['reflection', 'situations', null, 'b59cf2d49544cd79'],
  'REF-047': ['reflection', 'situations', null, '46f53e7fda8a9579'],
  'REF-048': ['reflection', 'situations', null, 'eb43a147410dbac6'],
  'REF-049': ['reflection', 'situations', null, '2d0e1443e81058f5'],
  'REF-050': ['reflection', 'situations', null, '21ca481ef1a4ca19'],
  'REF-051': ['reflection', 'situations', null, '61a0abbec81b7f10'],
  'REF-052': ['reflection', 'situations', null, '9eb808c7af898be3'],
  'REF-053': ['reflection', 'situations', null, 'b14fa80ea647b94c'],
  'REF-054': ['reflection', 'situations', null, 'e129d4776d829496'],
  'REF-055': ['reflection', 'situations', null, '43a7f4ee92380314'],
  'REF-056': ['reflection', 'situations', null, 'f859ed695108057c'],
  'REF-057': ['reflection', 'situations', null, '3c08ca43262f5d0b'],
  'REF-058': ['reflection', 'situations', null, '43566b8b2e19bb3a'],
  'REF-059': ['reflection', 'situations', null, '719a1cadd20a8487'],
  'REF-060': ['reflection', 'situations', null, '6bd9946587958cf9'],
  'REF-061': ['reflection', 'coping', null, 'c2801f9c960a1f80'],
  'REF-062': ['reflection', 'coping', null, 'd84446491cf47469'],
  'REF-063': ['reflection', 'coping', null, '4e61965199a0eccd'],
  'REF-064': ['reflection', 'coping', null, 'a2365a2c9bd3b571'],
  'REF-065': ['reflection', 'coping', null, '29f0b9745914eab8'],
  'REF-066': ['reflection', 'coping', null, 'ea3ac8ac0cb8d59f'],
  'REF-067': ['reflection', 'coping', null, 'a7ce319497e9213e'],
  'REF-068': ['reflection', 'coping', null, '8962bd4b1849fe14'],
  'REF-069': ['reflection', 'coping', null, 'ba981f57e4ff0322'],
  'REF-070': ['reflection', 'coping', null, '79a4a7e6e9255349'],
  'REF-071': ['reflection', 'coping', null, 'b356cf06579e120f'],
  'REF-072': ['reflection', 'coping', null, 'e568a601df131f67'],
  'REF-073': ['reflection', 'coping', null, 'ea436a3b173debca'],
  'REF-074': ['reflection', 'coping', null, 'b2c249f297036480'],
  'REF-075': ['reflection', 'coping', null, '7111ecb24ed62199'],
  'REF-076': ['reflection', 'coping', null, '3e851dcdadadae77'],
  'REF-077': ['reflection', 'coping', null, 'f0a1f71facf564c9'],
  'REF-078': ['reflection', 'coping', null, '8e8659bb9fc1c7fd'],
  'REF-079': ['reflection', 'coping', null, 'deff896fa2201a31'],
  'REF-080': ['reflection', 'coping', null, 'acbc5ae750021bde'],
  'REF-081': ['reflection', 'connection', null, '3b330fb3bee063b6'],
  'REF-082': ['reflection', 'connection', null, '45c05c0b5d13d4db'],
  'REF-083': ['reflection', 'connection', null, '9b2ae5b651a115fb'],
  'REF-084': ['reflection', 'connection', null, 'ba934b6ccde47a6c'],
  'REF-085': ['reflection', 'connection', null, '8f7fcd2b13c499a2'],
  'REF-086': ['reflection', 'connection', null, '8026877a64543079'],
  'REF-087': ['reflection', 'connection', null, '527a816d6abe674f'],
  'REF-088': ['reflection', 'connection', null, '6726c921f5931272'],
  'REF-089': ['reflection', 'connection', null, '689b36de973fcf6b'],
  'REF-090': ['reflection', 'connection', null, '3e9ee291cb817267'],
  'REF-091': ['reflection', 'connection', null, '5ab81751d46d31f4'],
  'REF-092': ['reflection', 'connection', null, '9bf40faf33b6608b'],
  'REF-093': ['reflection', 'connection', null, '94dcf6e83b5a514c'],
  'REF-094': ['reflection', 'connection', null, 'af18e7ed83688b69'],
  'REF-095': ['reflection', 'connection', null, '92c3edd45d3f7832'],
  'REF-096': ['reflection', 'connection', null, '8b5cab7bd06c2a73'],
  'REF-097': ['reflection', 'connection', null, '3d2775d38523fd20'],
  'REF-098': ['reflection', 'connection', null, 'db7b2bbffbf11cf2'],
  'REF-099': ['reflection', 'connection', null, '91e4a4543c7b8935'],
  'REF-100': ['reflection', 'connection', null, '82820882bc9d12f1'],
};

const sha16 = async (text: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

describe('released questions', () => {
  it('keep their type, theme, position and wording, and none has gone', async () => {
    for (const [id, [type, theme, position, hash]] of Object.entries(RELEASED)) {
      const q = QUESTIONS.find((x) => x.id === id);
      expect(q, `${id} was released and must stay in the catalogue`).toBeDefined();
      expect([id, q!.type, q!.theme, q!.position, await sha16(q!.text)]).toEqual([id, type, theme, position, hash]);
    }
  });

  it('every question in the catalogue is in the snapshot', () => {
    expect(QUESTIONS.map((q) => q.id).filter((id) => !(id in RELEASED))).toEqual([]);
  });
});
