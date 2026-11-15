import { FAQ, filterFaq, type FaqItem } from '../faqData'

const sample: FaqItem[] = [
  { id: 'a', question: 'Where is my order?', answer: 'Open the Orders tab.', keywords: ['track'] },
  { id: 'b', question: 'Do you sell café gift cards?', answer: 'No.', keywords: ['voucher'] },
]
const ids = (query: string) => filterFaq(sample, query).map((item) => item.id)

it('keeps everything for a blank or whitespace query', () => {
  expect(ids('')).toEqual(['a', 'b'])
  expect(ids('   ')).toEqual(['a', 'b'])
})

it('matches the question, the answer and the keywords', () => {
  expect(ids('where')).toEqual(['a'])
  expect(ids('orders tab')).toEqual(['a'])
  expect(ids('voucher')).toEqual(['b'])
})

it('ignores case, accents and surrounding spaces', () => {
  expect(ids('  CAFE ')).toEqual(['b'])
  expect(ids('café')).toEqual(['b'])
  expect(ids('TRACK')).toEqual(['a'])
})

it('needs every word to match', () => {
  expect(ids('order voucher')).toEqual([])
})

it('finds nothing for gibberish', () => {
  expect(ids('zzzz')).toEqual([])
})

it('ships unique ids and answers every item', () => {
  expect(new Set(FAQ.map((item) => item.id)).size).toBe(FAQ.length)
  expect(FAQ.every((item) => item.question && item.answer)).toBe(true)
})
