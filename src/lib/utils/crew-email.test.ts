import { describe, it, expect } from 'vitest';
import { composeCrewEmail, type CrewEmailInput } from './crew-email';

/**
 * The shape of a fully-loaded hold input — used as the baseline for tests
 * that diff against a known-good golden string. Individual tests clone and
 * override only the fields they care about.
 */
const FULL_HOLD: CrewEmailInput = {
  mode: 'hold',
  recipientFirstName: 'Patrick',
  artists: ['Oliver Begg'],
  clientLabel: 'Peter Alexander',
  role: 'Digital operator',
  rates: {
    dayFee: 550,
    dayFeeSuperBearing: true,
    travel: null,
    overtime: null,
  },
  dates: 'Thu, 14 May',
  timing: '8:00am – 6:00pm',
  location: 'Lunar Studios / 42 Maddox St, Alexandria NSW 2015',
  agencyOwnerName: 'Jasper',
};

describe('composeCrewEmail — golden fixtures', () => {
  it('hold mode with all fields present (Jasper\'s spec example)', () => {
    const { subject, body } = composeCrewEmail(FULL_HOLD);
    expect(subject).toBe('Hold — Peter Alexander · Thu, 14 May');
    expect(body).toBe([
      'Hi Patrick,',
      '',
      "I'm putting together a crew for an upcoming shoot and would love to have you on board.",
      '',
      '🎤 Assisting: Oliver Begg',
      '🎬 Client: Peter Alexander',
      '🧑‍💻 Role: Digital operator',
      '＄ Rate: $550.00 + 12% super',
      '📅 Date: Thu, 14 May',
      '⏱️ Timing: 8:00am – 6:00pm',
      '📍 Location: Lunar Studios / 42 Maddox St, Alexandria NSW 2015',
      '',
      'Could you let me know your availability?',
      '',
      'Thanks,',
      '— Jasper',
    ].join('\n'));
  });

  it('confirm mode swaps intro/outro and subject prefix', () => {
    const { subject, body } = composeCrewEmail({ ...FULL_HOLD, mode: 'confirm' });
    expect(subject).toBe('Confirmed — Peter Alexander · Thu, 14 May');
    expect(body).toContain("You're confirmed for the following booking:");
    expect(body).toContain('Please confirm receipt of this message.');
    // The block itself is identical between modes — only the wrapper changes.
    expect(body).toContain('＄ Rate: $550.00 + 12% super');
  });
});

describe('composeCrewEmail — rate row permutations', () => {
  it('day fee only, super-bearing → "＄ Rate: ... + 12% super"', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: { dayFee: 550, dayFeeSuperBearing: true, travel: null, overtime: null },
    });
    expect(body).toContain('＄ Rate: $550.00 + 12% super');
    expect(body).not.toContain('＄ Day fee:');
    expect(body).not.toContain('＄ Travel:');
    expect(body).not.toContain('＄ Overtime:');
  });

  it('day fee only, NOT super-bearing → no super suffix', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: { dayFee: 2000, dayFeeSuperBearing: false, travel: null, overtime: null },
    });
    expect(body).toContain('＄ Rate: $2,000.00');
    expect(body).not.toContain('+ 12% super');
  });

  it('day fee + travel → splits to explicit labels, super stays on day fee only', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: { dayFee: 550, dayFeeSuperBearing: true, travel: 200, overtime: null },
    });
    expect(body).toContain('＄ Day fee: $550.00 + 12% super');
    expect(body).toContain('＄ Travel: $200.00');
    // Critical invariant: travel never carries the super suffix.
    expect(body).not.toMatch(/Travel.*super/);
    // And no "Rate:" row when we've split.
    expect(body).not.toContain('＄ Rate:');
  });

  it('day fee + overtime → labels OT with hours, super stays on day fee only', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: {
        dayFee: 550, dayFeeSuperBearing: true,
        travel: null,
        overtime: { amount: 123.75, hours: 1.5 },
      },
    });
    expect(body).toContain('＄ Day fee: $550.00 + 12% super');
    expect(body).toContain('＄ Overtime: $123.75 (1.5h)');
    expect(body).not.toMatch(/Overtime.*super/);
  });

  it('day fee + travel + overtime → all three ＄ rows, super only on day fee', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: {
        dayFee: 550, dayFeeSuperBearing: true,
        travel: 200,
        overtime: { amount: 123.75, hours: 1.5 },
      },
    });
    const idxDayFee = body.indexOf('＄ Day fee:');
    const idxTravel = body.indexOf('＄ Travel:');
    const idxOT = body.indexOf('＄ Overtime:');
    // Order is deliberate: day fee → travel → overtime.
    expect(idxDayFee).toBeGreaterThan(-1);
    expect(idxTravel).toBeGreaterThan(idxDayFee);
    expect(idxOT).toBeGreaterThan(idxTravel);
  });

  it('no day fee → rate block omitted entirely (no orphan label)', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: { dayFee: null, dayFeeSuperBearing: true, travel: null, overtime: null },
    });
    expect(body).not.toContain('＄');
    expect(body).not.toContain('Rate:');
  });
});

describe('composeCrewEmail — skip-missing-fields', () => {
  it('minimum viable hold (just first name + dates) still renders cleanly', () => {
    const { subject, body } = composeCrewEmail({
      mode: 'hold',
      recipientFirstName: 'Patrick',
      artists: [],
      clientLabel: null,
      role: null,
      rates: { dayFee: null, dayFeeSuperBearing: true, travel: null, overtime: null },
      dates: 'Thu, 14 May',
      timing: null,
      location: null,
      agencyOwnerName: 'Jasper',
    });
    expect(subject).toBe('Hold — Thu, 14 May');
    expect(body).toContain('Hi Patrick,');
    expect(body).toContain('📅 Date: Thu, 14 May');
    expect(body).not.toContain('🎤'); // no artists → no artist row
    expect(body).not.toContain('🎬'); // no client → no client row
    expect(body).not.toContain('🧑‍💻'); // no role
    expect(body).not.toContain('＄');  // no rate
    expect(body).not.toContain('⏱️');  // no timing
    expect(body).not.toContain('📍'); // no location
    expect(body).toContain('— Jasper');
  });

  it('multi-artist: joins with " + "', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      artists: ['Oliver Begg', 'Maria Singh'],
    });
    expect(body).toContain('🎤 Assisting: Oliver Begg + Maria Singh');
  });

  it('blank first name falls back to "there"', () => {
    const { body } = composeCrewEmail({ ...FULL_HOLD, recipientFirstName: '   ' });
    expect(body).toContain('Hi there,');
  });

  it('no dates AND no client → subject falls back to "TBD"', () => {
    const { subject } = composeCrewEmail({
      ...FULL_HOLD,
      clientLabel: null,
      dates: null,
    });
    expect(subject).toBe('Hold — TBD');
  });
});

describe('composeCrewEmail — super-suffix invariant', () => {
  // This is the canonical doctrine being enforced: super accrues only on
  // the labour day-fee. Travel and overtime, even on super-bearing crew,
  // must never display the "+ 12% super" suffix.
  it('travel row never shows super, even with super-bearing crew', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: { dayFee: 550, dayFeeSuperBearing: true, travel: 200, overtime: null },
    });
    const travelLine = body.split('\n').find((l) => l.startsWith('＄ Travel:'));
    expect(travelLine).toBeDefined();
    expect(travelLine).not.toContain('super');
  });

  it('overtime row never shows super, even with super-bearing crew', () => {
    const { body } = composeCrewEmail({
      ...FULL_HOLD,
      rates: {
        dayFee: 550, dayFeeSuperBearing: true,
        travel: null,
        overtime: { amount: 123.75, hours: 1.5 },
      },
    });
    const otLine = body.split('\n').find((l) => l.startsWith('＄ Overtime:'));
    expect(otLine).toBeDefined();
    expect(otLine).not.toContain('super');
  });
});
