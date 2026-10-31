import { describe, expect, it } from 'vitest';
import { computeAll } from '../src/engine/calc';
import { exampleState, migrate } from '../src/engine/project';

describe('floors', () => {
  it('counts every room on a typical floor once per repeat', () => {
    const s = exampleState(), one = computeAll(s.project, s.rooms);
    const t = structuredClone(s); t.project.floors![0].n = 3;
    const three = computeAll(t.project, t.rooms);
    expect(three.T.u).toBeCloseTo(one.T.u * 3, 6);
    expect(three.T.plant).toBeCloseTo(one.T.plant * 3, 6);
    expect(three.T.a).toBeCloseTo(one.T.a * 3, 6);
    /* room quantity and floor repeats multiply: two manager offices on three floors */
    const mgr = t.rooms.find(r => r.name === 'Manager office')!;
    expect(three.res[mgr.id].qty).toBe(6);
  });

  it('keeps floors and room levels through a save and reopen', () => {
    const s = exampleState(); s.project.floors!.push({ id: 'f2', name: 'Second floor', n: 4 }); s.rooms[1].level = 'f2';
    const back = migrate(JSON.parse(JSON.stringify(s)));
    expect(back.project.floors).toEqual([{ id: 'f1', name: 'First floor', n: 1 }, { id: 'f2', name: 'Second floor', n: 4 }]);
    expect(back.rooms.map(r => r.level)).toEqual(['f1', 'f2', 'f1', 'f1', 'f1']);
  });

  it('opens older projects with no floors as before', () => {
    const s = exampleState(); delete s.project.floors; s.rooms.forEach(r => { delete r.level; });
    const back = migrate(JSON.parse(JSON.stringify(s))), d = computeAll(back.project, back.rooms);
    expect(back.project.floors).toBeUndefined();
    expect(d.T.u).toBeCloseTo(computeAll(exampleState().project, exampleState().rooms).T.u, 6);
  });
});
