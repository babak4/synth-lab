import { describe } from 'vitest';
import { engineContract } from '../engine-contract';
import { MockEngine } from './mock-engine';

describe('MockEngine satisfies the engine contract', () => engineContract(() => new MockEngine()));
