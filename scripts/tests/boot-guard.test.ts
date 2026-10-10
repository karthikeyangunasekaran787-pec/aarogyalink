/**
 * The entry frame's failure guard (the inline classic <script> in index.html)
 * — run with: bun test
 *
 * roleselect-render.test.tsx only asserts that the guard's MARKUP is present.
 * That is not evidence it works: the guard is the only thing standing between
 * a failed module graph and a permanently blank page, and it is the first
 * thing a visitor meets when Vite cannot serve a module — for example a dev
 * server answering `/index.html?html-proxy&index=N.js` with
 * "No matching HTML proxy module found".
 *
 * So this file executes the REAL script out of index.html and drives the
 * events that failure produces. It uses its own happy-dom window rather than
 * the shared global registration, so it cannot interfere with the other spec.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';

const html = readFileSync(resolve(import.meta.dir, '../../index.html'), 'utf8');

/** The classic inline script — the first `<script>` with no attributes. */
function guardSource(): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('index.html no longer carries the inline boot guard');
  expect(match[1]).toContain('boot-splash');
  expect(match[1]).not.toContain('src=');
  return match[1];
}

type Listener = (event: { target: unknown; message?: string }) => void;

interface Harness {
  doc: Window['document'];
  /** Fire a window event the way the browser would during a failed startup. */
  fire(type: string, event: { target: unknown; message?: string }): void;
  /** How many times the Retry button asked for a reload. */
  reloads(): number;
}

/** Run the guard against a private document root and a stubbed `location`. */
function loadGuard(): Harness {
  const dom = new Window();
  const doc = dom.document;
  doc.body.innerHTML = '<div id="root"><div id="boot-splash"></div></div>';

  const listeners: Record<string, Listener[]> = {};
  const fakeWindow = {
    addEventListener(type: string, listener: Listener) {
      (listeners[type] ||= []).push(listener);
    },
  };
  let reloads = 0;

  // Classic script semantics: bare `window` / `document` / `location` resolve
  // to the surrounding scope, so they can be injected here.
  new Function('window', 'document', 'location', guardSource())(
    fakeWindow,
    doc,
    { reload: () => { reloads += 1; } },
  );

  return {
    doc,
    fire: (type, event) => (listeners[type] || []).forEach(listener => listener(event)),
    reloads: () => reloads,
  };
}

/** A stand-in for the `<script>` element whose module graph failed to load. */
function failedScriptElement(doc: Window['document']): Element {
  const script = doc.createElement('script');
  doc.body.appendChild(script);
  return script;
}

describe('entry failure guard', () => {
  test('a failed module load replaces the empty frame with a readable message', () => {
    const { doc, fire, reloads } = loadGuard();

    // Before any failure the frame is the deliberately empty container.
    expect(doc.getElementById('boot-splash')?.textContent).toBe('');

    // This is what the browser reports when a module script's dependency
    // 500s: an `error` event whose target is the script element.
    fire('error', { target: failedScriptElement(doc) });

    const splash = doc.getElementById('boot-splash');
    expect(splash?.textContent).toContain('AarogyaLink');
    expect(splash?.textContent).toContain('The app could not finish starting.');
    expect(splash?.textContent).toContain('A required file failed to load.');
    expect(splash?.querySelector('.boot-name')).not.toBeNull();
    expect(splash?.querySelector('.boot-error')).not.toBeNull();
    expect(splash?.querySelector('.boot-hint')).not.toBeNull();

    // The way out is offered, not just described.
    const retry = splash?.querySelector('.boot-retry');
    expect(retry?.textContent).toBe('Retry');
    (retry as unknown as { click(): void }).click();
    expect(reloads()).toBe(1);
  });

  test('an unexpected runtime error is reported too', () => {
    const { doc, fire } = loadGuard();

    // No element target and a message: the branch that catches an exception
    // during module evaluation.
    fire('error', { target: null, message: 'Import failed: /index.html?html-proxy&index=0.js' });

    expect(doc.getElementById('boot-splash')?.textContent).toContain(
      'Import failed: /index.html?html-proxy&index=0.js',
    );

    // And an unhandled rejection never leaves the frame blank either.
    const second = loadGuard();
    second.fire('unhandledrejection', { target: null });
    expect(second.doc.getElementById('boot-splash')?.textContent).toContain(
      'An unexpected error interrupted startup.',
    );
  });

  test('a repeated failure keeps the first message instead of stacking', () => {
    const { doc, fire } = loadGuard();

    fire('error', { target: failedScriptElement(doc) });
    fire('error', { target: failedScriptElement(doc) });
    fire('unhandledrejection', { target: null });

    const splash = doc.getElementById('boot-splash');
    expect(splash?.querySelectorAll('.boot-name').length).toBe(1);
    expect(splash?.querySelectorAll('.boot-error').length).toBe(1);
    expect(splash?.querySelectorAll('.boot-retry').length).toBe(1);
    // The first failure's wording wins — later ones neither append nor replace.
    expect(splash?.textContent).toContain('A required file failed to load.');
    expect(splash?.textContent).not.toContain('An unexpected error interrupted startup.');
  });

  test('once React has mounted the guard never paints over the live app', () => {
    const { doc, fire } = loadGuard();

    // React clears #root's children on mount.
    const root = doc.getElementById('root');
    if (!root) throw new Error('test harness did not build the entry frame');
    root.textContent = '';

    fire('error', { target: failedScriptElement(doc) });
    fire('unhandledrejection', { target: null });

    expect(doc.getElementById('boot-splash')).toBeNull();
    expect(root.textContent).toBe('');
  });
});
