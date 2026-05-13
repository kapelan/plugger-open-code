import { describe, test, expect } from 'bun:test';
import { errMsg } from '../../src/util/errors.js';

describe('errMsg', () => {
  test('extracts message from Error instance', () => {
    expect(errMsg(new Error('boom'))).toBe('boom');
  });

  test('passes string through verbatim', () => {
    expect(errMsg('plain string')).toBe('plain string');
  });

  test('JSON-stringifies objects so the user sees something useful', () => {
    expect(errMsg({ code: 'EACCES', path: '/x' })).toBe('{"code":"EACCES","path":"/x"}');
  });

  test('falls back to String() for non-serializable values (circular ref)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errMsg(circular)).toBe('[object Object]');
  });

  test('handles null and undefined with a string sentinel', () => {
    expect(errMsg(null)).toBe('null');
    expect(errMsg(undefined)).toBe('undefined');
  });
});
