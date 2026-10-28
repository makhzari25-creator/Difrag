/**
 * Unit tests for location parsing and effective reference rules (Stage 2).
 * Run: node tests/location-parse.test.js
 */

function parseLocationCell(raw, totalQty) {
  const warnings = [];
  if (!raw || raw === '_' || String(raw).trim() === '') {
    return { locations: [], warnings, effectiveQty: totalQty };
  }
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > 2) {
    warnings.push({ type: 'too_many_parts', message: `بیش از دو قطعه مکان: ${raw}` });
  }
  const parsed = [];
  for (const part of parts) {
    const m = part.match(/^(\d{8})\s*(?:\((\d+)\))?$/);
    if (!m) {
      warnings.push({ type: 'bad_location', message: `فرمت مکان نامعتبر: ${part}` });
      continue;
    }
    parsed.push({ code: m[1], qty: m[2] != null ? parseInt(m[2], 10) : null });
  }
  if (!parsed.length) {
    return { locations: [], warnings, effectiveQty: totalQty };
  }
  const use = parsed.slice(0, 2);
  const locations = [];
  const withQty = use.filter(p => p.qty != null);

  if (use.length === 1) {
    locations.push({ code: use[0].code, expectedQty: withQty.length ? withQty[0].qty : totalQty });
    return { locations, warnings, effectiveQty: totalQty };
  }
  if (withQty.length === 0) {
    locations.push({ code: use[0].code, expectedQty: totalQty });
    locations.push({ code: use[1].code, expectedQty: 0 });
    warnings.push({ type: 'no_split', message: 'ردیف بدون تفکیک در ستون مکان' });
    return { locations, warnings, effectiveQty: totalQty };
  }
  if (withQty.length === 1) {
    const known = withQty[0];
    const other = use.find(p => p.code !== known.code);
    locations.push({ code: known.code, expectedQty: known.qty });
    locations.push({ code: other.code, expectedQty: Math.max(0, totalQty - known.qty) });
    return { locations, warnings, effectiveQty: totalQty };
  }
  let sum = 0;
  for (const p of use) {
    const q = p.qty != null ? p.qty : 0;
    locations.push({ code: p.code, expectedQty: q });
    sum += q;
  }
  if (sum !== totalQty) {
    warnings.push({ type: 'sum_mismatch', message: 'جمع تفکیک‌ها با موجودی کل برابر نیست' });
    return { locations, warnings, effectiveQty: sum };
  }
  return { locations, warnings, effectiveQty: totalQty };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('PASS:', msg);
}

{
  const r = parseLocationCell('01120101', 10);
  assert(r.locations.length === 1 && r.locations[0].expectedQty === 10, 'single location uses D');
  assert(r.effectiveQty === 10, 'single effective = D');
}
{
  const r = parseLocationCell('_', 5);
  assert(r.locations.length === 0 && r.effectiveQty === 5, 'underscore = no locations');
}
{
  const r = parseLocationCell('', 3);
  assert(r.locations.length === 0, 'empty = no locations');
}
{
  const r = parseLocationCell('01120605 , 01120505', 8);
  assert(r.locations[0].expectedQty === 8 && r.locations[1].expectedQty === 0, 'no split: all to first');
  assert(r.warnings.some(w => w.type === 'no_split'), 'no_split warning');
}
{
  const r = parseLocationCell('01120605 , 01120505(2)', 8);
  assert(r.locations.find(l => l.code === '01120505').expectedQty === 2, 'one N: known qty');
  assert(r.locations.find(l => l.code === '01120605').expectedQty === 6, 'one N: other = D-N');
  assert(r.effectiveQty === 8, 'one N effective = D');
}
{
  const r = parseLocationCell('01120102(5),01120103(7)', 12);
  assert(r.effectiveQty === 12 && !r.warnings.length, 'both N match sum');
}
{
  const r = parseLocationCell('01120102(5),01120103(3)', 12);
  assert(r.effectiveQty === 8, 'mismatch effective = sum');
  assert(r.warnings.some(w => w.type === 'sum_mismatch'), 'sum_mismatch warning');
}
{
  const r = parseLocationCell('ABC', 1);
  assert(r.warnings.some(w => w.type === 'bad_location'), 'bad location warned');
}
{
  const r = parseLocationCell(' 01120101 ', 4);
  assert(r.locations[0].code === '01120101', 'trim spaces');
}

console.log('\nAll location-parse tests passed.');
