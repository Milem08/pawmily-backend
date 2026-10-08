import { canonicalMealTime } from '../../../src/shared/mealTime';
import { feedingSchema } from '../../../src/interfaces/http/dto/schemas';
import {
  closeActionForMeal,
  feedingClock,
  isMealDue,
  planFeedingClose,
  summarizeFeeding,
} from '../../../src/application/feeding/feedingSchedule';

const savedTz = process.env.APP_TZ;

beforeEach(() => {
  process.env.APP_TZ = 'America/El_Salvador';
});

afterAll(() => {
  if (savedTz === undefined) delete process.env.APP_TZ;
  else process.env.APP_TZ = savedTz;
});

const dinner = {
  id: 'cena',
  label: 'Cena',
  time: '19:00',
  sortOrder: 2,
};

describe('INT-03 horas de comida', () => {
  it('acepta 8 pm, 8:30 p. m. y 20:00', () => {
    expect(canonicalMealTime('8 pm')).toBe('20:00');
    expect(canonicalMealTime('8:30 p. m.')).toBe('20:30');
    expect(canonicalMealTime('20:00')).toBe('20:00');
  });

  it('8 pm cuenta como las 20:00 y una hora ilegible no vence a las 00:00', () => {
    const ref = { date: '2026-10-07', minutes: 5 };
    expect(isMealDue('8 pm', '2026-10-07', ref)).toBe(false);
    expect(isMealDue('8 pm', '2026-10-07', { date: '2026-10-07', minutes: 20 * 60 + 1 })).toBe(true);
    expect(isMealDue('xx', '2026-10-07', ref)).toBe(false);
  });

  it('xx no se puede guardar en el plan', () => {
    const parsed = feedingSchema.safeParse({
      recommendedAmount: '200 g',
      mealsPerDay: 1,
      meals: [{ label: 'Cena', time: 'xx' }],
    });
    expect(parsed.success).toBe(false);
    const ok = feedingSchema.safeParse({
      recommendedAmount: '200 g',
      mealsPerDay: 1,
      meals: [{ label: 'Cena', time: '8 pm' }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.meals?.[0].time).toBe('20:00');
  });
});

describe('cierre nocturno en hora de El Salvador', () => {
  const evening = new Date('2026-10-07T00:05:00.000Z');
  const afterMidnight = new Date('2026-10-07T06:05:00.000Z');

  it('a las 18:05 no cierra el 06/10 y la cena de las 19:00 sigue pendiente', () => {
    expect(planFeedingClose(evening, null).dates).not.toContain('2026-10-06');
    expect(
      closeActionForMeal({
        day: '2026-10-06',
        mealTime: '19:00',
        planStatus: 'ACTIVE',
        startDate: '2026-10-01',
        now: evening,
      }),
    ).toBe('skip');
  });

  it('a las 00:05 cierra el 06/10 y repetirlo no cambia el resultado', () => {
    const first = planFeedingClose(afterMidnight, null);
    const repeated = planFeedingClose(afterMidnight, null);
    expect(first.dates).toContain('2026-10-06');
    expect(first.dates).not.toContain('2026-10-07');
    expect(repeated).toEqual(first);

    expect(
      closeActionForMeal({
        day: '2026-10-06',
        mealTime: '19:00',
        planStatus: 'ACTIVE',
        startDate: '2026-10-01',
        now: afterMidnight,
      }),
    ).toBe('mark');
    expect(
      closeActionForMeal({
        day: '2026-10-06',
        mealTime: '19:00',
        planStatus: 'ACTIVE',
        startDate: '2026-10-01',
        existingStatus: 'UNLOGGED',
        now: afterMidnight,
      }),
    ).toBe('skip');

    const second = planFeedingClose(afterMidnight, first.closedThrough);
    expect(second.dates).toEqual([]);
    expect(second.closedThrough).toBe(first.closedThrough);
  });
});

describe('resumen de cumplimiento', () => {
  const meals = [dinner];

  it('FEED-07 un plan iniciado hoy no cuenta días previos', () => {
    const summary = summarizeFeeding({
      meals: [{ id: 'desayuno', label: 'Desayuno', time: '08:00', sortOrder: 0 }],
      logs: [],
      from: '2026-09-01',
      to: '2026-10-07',
      weekDays: ['2026-10-05', '2026-10-06', '2026-10-07'],
      startDate: '2026-10-07',
      now: new Date('2026-10-07T18:00:00.000Z'),
    });
    expect(summary.scheduled).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.unlogged).toBe(0);
    expect(summary.percent).toBe(0);
  });

  it('FEED-08 un rango futuro deja el porcentaje en null', () => {
    const summary = summarizeFeeding({
      meals,
      logs: [],
      from: '2026-10-20',
      to: '2026-10-26',
      weekDays: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'],
      startDate: '2026-10-01',
      now: new Date('2026-10-07T18:00:00.000Z'),
    });
    expect(summary.percent).toBeNull();
    expect(summary.unlogged).toBe(0);
    expect(summary.scheduled).toBe(0);
  });

  it('un asOf futuro no marca comidas como no registradas', () => {
    const summary = summarizeFeeding({
      meals,
      logs: [],
      from: '2026-10-07',
      to: '2026-12-01',
      weekDays: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
      startDate: '2026-10-07',
      asOf: '2026-12-01',
      now: new Date('2026-10-07T16:00:00.000Z'),
    });
    expect(summary.unlogged).toBe(0);
    expect(summary.percent).toBeNull();
    expect(summary.weekMeals[0].cells).not.toContain('UNLOGGED');
  });

  it('un asOf de otro día usa ese día y no la hora real', () => {
    const now = new Date('2026-10-07T16:00:00.000Z');
    expect(feedingClock('2026-10-06', now)).toMatchObject({
      refDate: '2026-10-06',
      refMinutes: 24 * 60,
    });
    const summary = summarizeFeeding({
      meals,
      logs: [],
      from: '2026-10-06',
      to: '2026-10-06',
      weekDays: ['2026-10-05', '2026-10-06', '2026-10-07'],
      startDate: '2026-10-01',
      asOf: '2026-10-06',
      now,
    });
    expect(summary.scheduled).toBe(1);
    expect(summary.unlogged).toBe(1);
  });
});
