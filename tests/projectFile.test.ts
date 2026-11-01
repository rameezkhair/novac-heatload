import { describe, expect, it } from 'vitest';
import { exampleState } from '../src/engine/project';
import { decodeProject, encodeProject, projectFromFile, projectHtml, projectInHash } from '../src/projectFile';

describe('project files', () => {
  it('round-trips a project through the compressed link', async () => {
    const s = exampleState();
    const enc = await encodeProject(s);
    expect(enc.startsWith('z.')).toBe(true);
    expect(enc).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await decodeProject(enc)).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('writes a page that carries the project and opens the calculator with it', async () => {
    const s = exampleState();
    const html = await projectHtml(s, 'https://novac.ae/app.html#report', new Date('2026-11-01'));
    expect(html).toContain('<title>Example: Zarvela Business Centre');
    expect(html).toContain('Saved 1 November 2026');
    const href = html.match(/id="open" href="([^"]+)"/)![1].replace(/&amp;/g, '&');
    expect(href.startsWith('https://novac.ae/app.html#open=z.')).toBe(true);
    expect(await decodeProject(projectInHash(new URL(href).hash)!)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(projectFromFile(html)).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('keeps user text from breaking out of the page', async () => {
    const s = exampleState();
    s.project.name = '</script><script>alert(1)</script><!--';
    const html = await projectHtml(s, 'https://novac.ae/app.html');
    expect(html).not.toContain('<script>alert(1)');
    expect(html.match(/<script/g)).toHaveLength(2);
    expect((projectFromFile(html) as typeof s).project.name).toBe(s.project.name);
  });

  it('still opens the older .novac.json files', () => {
    const s = exampleState();
    expect(projectFromFile(JSON.stringify(s, null, 1))).toEqual(JSON.parse(JSON.stringify(s)));
  });
});
