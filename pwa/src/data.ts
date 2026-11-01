import type { Book } from './types'

export const books: Book[] = [
  {
    id: 'secret-garden',
    title: 'The Secret Garden',
    author: 'Frances Hodgson Burnett',
    color: '#849887',
    mark: '✦',
    progress: 38,
    subtitle: 'A story of quiet beginnings',
  },
  {
    id: 'little-women',
    title: 'Little Women',
    author: 'Louisa May Alcott',
    color: '#a9857d',
    mark: '❋',
    progress: 12,
    subtitle: 'A tale in four parts',
  },
  {
    id: 'pride-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    color: '#9386a3',
    mark: '◈',
    progress: 0,
    subtitle: 'An old-fashioned romance',
  },
  {
    id: 'anne-green-gables',
    title: 'Anne of Green Gables',
    author: 'L. M. Montgomery',
    color: '#8799a8',
    mark: '❦',
    progress: 64,
    subtitle: 'A girl with a wild imagination',
  },
  {
    id: 'room-with-a-view',
    title: 'A Room with a View',
    author: 'E. M. Forster',
    color: '#aa966d',
    mark: '✿',
    progress: 0,
    subtitle: 'A summer in Florence',
  },
]

export const chapters = [
  'The House at the Edge',
  'A Key in the Garden',
  'The Secret Room',
  'A Change in the Air',
  'The First Green Shoot',
]

export const pageText = [
  'When Mary Lennox was sent to the old house, the quiet felt larger than the rooms. The clocks ticked softly in the hall, and the wind moved through the trees as though it had somewhere important to be.',
  'She had never been fond of gardens. Yet something about the locked door at the end of the path made her wonder what the world had been keeping from her.',
  'The next morning brought a small sound at the window. A bird, bright-eyed and unhurried, waited on the sill before darting toward the far wall.',
]

export const waveform = [
  18, 30, 16, 38, 24, 48, 29, 19, 40, 26, 52, 22, 36, 16, 44, 28, 54, 24, 38,
  20, 32, 48, 26, 42, 21, 36, 16, 46, 28, 39, 20, 52, 30, 17, 38, 25, 45, 19,
  34, 50, 23, 41, 18, 31, 47, 27, 38, 21, 54, 29, 17, 43, 24, 36, 20, 49, 30,
]
