export const SCENARIOS = [
  {
    id: 'food-reviewer',
    title: 'The Food Reviewer',
    setup: 'The world\'s greatest food reviewer is here! Your top special tonight is',
    maxWords: 3,
  },
  {
    id: 'caught-cheating',
    title: 'The Affair',
    setup: 'Your spouse is about to walk in on you with your lover! You quickly whisper',
    maxWords: 3,
  },
  {
    id: 'state-of-the-union',
    title: 'State of the Union',
    setup: 'It\'s time for the State of the Union! "My Fellow Americans,',
    closingQuote: '"',
    maxWords: 3,
  },
  {
    id: 'wedding-toast',
    title: 'The Wedding Toast',
    setup: 'It\'s time for the toast! I wish the happy couple many years of',
    maxWords: 3,
  },
  {
    id: 'jury-verdict',
    title: 'The Verdict',
    setup: 'The Jury has returned with a verdict! They find the defendant',
    maxWords: 3,
  },
  {
    id: 'job-interview',
    title: 'The Job Interview',
    setup: 'The interviewer has asked for your greatest strength! You confidently reply',
    maxWords: 3,
  },
  {
    id: 'eulogy',
    title: 'The Eulogy',
    setup: 'It\'s time to eulogize Grandma! We always remember her',
    maxWords: 3,
  },
  {
    id: 'blind-tattoo',
    title: 'The Blind Tattoo',
    setup: 'You got a blind tattoo! You look down to see',
    closingQuote: ' for the first time.',
    maxWords: 3,
  },
  {
    id: 'genie-wish',
    title: 'The Genie',
    setup: 'A genie has granted you one wish! You ask for',
    maxWords: 3,
  },
  {
    id: 'alien-judgment',
    title: 'The Alien',
    setup: 'An alien is judging all of humanity based on you! Your first words are',
    maxWords: 3,
  },
]

export function pickScenarios(count = 3) {
  const shuffled = [...SCENARIOS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}
