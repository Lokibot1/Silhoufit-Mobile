// Ported from the web app's Help answers (src/service/helpAnswers.ts), reworded for the app. Static: there is no help backend yet.
export type FaqLink = { label: string; to: 'body' | 'orders' | 'refund' | 'privacy' | 'sign-up' }
export type FaqItem = { id: string; question: string; answer: string; keywords: string[]; link?: FaqLink }

export const FAQ: FaqItem[] = [
  {
    id: 'what-is-silhoufit',
    question: 'What is SilhouFit?',
    answer: "SilhouFit is KRAL's AR fitting. It uses the measurements you enter to show how a piece fits you. Nothing is uploaded. In the app, AR Try-On works on shirts: it recommends a size and shows how the chest, waist, shoulders and sleeve fit.",
    keywords: ['silhoufit', 'ar', 'camera', 'try on'],
  },
  {
    id: 'how-silhoufit-works',
    question: 'How does SilhouFit work?',
    answer: 'Save your measurements, then open AR Try-On on a shirt marked AR-ready. It compares your chest, waist, shoulders and sleeve with each size and recommends one. The module is still a working prototype, and live camera try-on is coming.',
    keywords: ['ar', 'camera', 'pose', '3d', 'virtual'],
  },
  {
    id: 'enter-measurements',
    question: 'How do I enter my measurements?',
    answer: 'Sign in, then open Body Profile from the Profile tab. Enter your measurements in centimetres or inches and your weight in kilograms or pounds. Each value is checked against a sensible range, and you can edit it any time.',
    keywords: ['measurements', 'body', 'setup', 'weight', 'height'],
    link: { label: 'Open Body Profile', to: 'body' },
  },
  {
    id: 'sizing-accuracy',
    question: 'How accurate is the sizing?',
    answer: 'It is guidance, not a guarantee. A fit check compares your measurements with the size chart of the piece, and cuts vary between garments. Each product page has a size guide to check against.',
    keywords: ['size', 'fit', 'accurate', 'size chart', 'size guide'],
  },
  {
    id: 'shipping-returns',
    question: 'What about shipping and returns?',
    answer: 'Orders are delivered to the address you give at checkout. Returns and refunds follow the refund policy.',
    keywords: ['shipping', 'delivery', 'return', 'refund'],
    link: { label: 'Read the refund policy', to: 'refund' },
  },
  {
    id: 'privacy',
    question: 'Are my measurements and camera private?',
    answer: 'The camera starts only after you allow it, and frames are processed on your device, not uploaded. Saved measurements belong to your account.',
    keywords: ['privacy', 'private', 'camera', 'data', 'safe'],
    link: { label: 'Read the privacy policy', to: 'privacy' },
  },
  {
    id: 'need-account',
    question: 'Do I need an account?',
    answer: 'You can browse the shop and product pages without one. Adding to the cart or wishlist, and saving measurements, need you to sign in.',
    keywords: ['account', 'sign up', 'register', 'login', 'sign in'],
    link: { label: 'Create an account', to: 'sign-up' },
  },
  {
    id: 'track-order',
    question: 'How do I track my order?',
    answer: 'Open the Orders tab to see every order and its status. Open an order to see its items and delivery address.',
    keywords: ['track', 'tracking', 'status', 'order', 'where is my order'],
    link: { label: 'Open my orders', to: 'orders' },
  },
  {
    id: 'cancel-order',
    question: 'Can I cancel an order?',
    answer: 'Open the order from the Orders tab. If it can still be cancelled, the cancel button is shown there. Once an order is on its way it can no longer be cancelled.',
    keywords: ['cancel', 'cancellation', 'order'],
    link: { label: 'Open my orders', to: 'orders' },
  },
  {
    id: 'payment-methods',
    question: 'Which payment methods can I use?',
    answer: 'The payment options available are shown at checkout, where you pick one before you place the order.',
    keywords: ['payment', 'pay', 'card', 'checkout', 'method'],
  },
  {
    id: 'delivery-time',
    question: 'How long does delivery take?',
    answer: 'Delivery time depends on your address. The shipping fee for your address is shown at checkout before you pay.',
    keywords: ['delivery', 'shipping', 'fee', 'how long', 'courier'],
  },
  {
    id: 'ask-refund',
    question: 'How do I ask for a refund?',
    answer: 'The refund policy explains what can be returned and how long you have. After that, send us your order details with Contact Us under About KRAL on the Profile tab.',
    keywords: ['refund', 'return', 'exchange', 'money back'],
    link: { label: 'Read the refund policy', to: 'refund' },
  },
  {
    id: 'reset-password',
    question: 'How do I reset my password?',
    answer: 'On the Sign In screen choose Forgot password and enter your email. If the account exists, we send a link to set a new password. The link expires after a short time, so use it soon.',
    keywords: ['password', 'forgot', 'reset', 'login', 'sign in'],
  },
  {
    id: 'contact-store',
    question: 'How can I contact the store?',
    answer: 'Choose Contact Us under About KRAL on the Profile tab to send us an email. Signed-in customers can also message us with the Messages icon on the Shop tab.',
    keywords: ['contact', 'support', 'message', 'talk', 'human', 'email'],
  },
  {
    id: 'find-size',
    question: 'How do I find my size?',
    answer: 'Check the size guide on the product page and compare it with your measurements. Save your measurements in Body Profile so the fit check can use them.',
    keywords: ['size', 'find my size', 'size guide', 'fit', 'measure'],
    link: { label: 'Open Body Profile', to: 'body' },
  },
]

// Lower-case, accents removed, trimmed: "Café " and "cafe" are the same search.
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** The items whose question, answer or keywords contain every word of `query`; a blank query keeps them all. */
export function filterFaq(items: FaqItem[], query: string): FaqItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return items
  return items.filter((item) => {
    const text = fold([item.question, item.answer, ...item.keywords].join(' '))
    return words.every((word) => text.includes(word))
  })
}
