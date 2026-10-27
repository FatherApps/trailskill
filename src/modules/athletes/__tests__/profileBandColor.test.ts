import { profileBandColor } from '../profileBandColor';

describe('profileBandColor', () => {
  it('is the neutral brand colour of the profile band', () => {
    expect(profileBandColor).toBe('sky');
  });
});
