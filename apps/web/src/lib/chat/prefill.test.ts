// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { questionFromSearch } from './prefill';
import { MAX_QUESTION_CHARS } from './state';

describe('questionFromSearch', () => {
  it('reads the question from ?q=', () => {
    expect(questionFromSearch('?q=What%20did%20Ivan%20do%20at%20BrainRocket%3F')).toBe(
      'What did Ivan do at BrainRocket?',
    );
  });

  it.each(['', '?view=brief', '?q=', '?q=%20%20'])('returns null for %j', (search) => {
    expect(questionFromSearch(search)).toBeNull();
  });

  it('drops control characters but keeps line breaks', () => {
    expect(questionFromSearch('?q=Hi%00there%1B%0Anext')).toBe('Hithere\nnext');
  });

  it('cuts the text to the input limit', () => {
    const long = 'a'.repeat(MAX_QUESTION_CHARS + 50);

    expect(questionFromSearch(`?q=${long}`)).toHaveLength(MAX_QUESTION_CHARS);
  });
});
