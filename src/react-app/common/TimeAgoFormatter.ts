import { Formatter } from 'react-timeago'
import { makeIntlFormatter } from 'react-timeago/defaultFormatter'

export const TimeAgoFormatter = (
  locale: string
): Record<'long' | 'narrow', Formatter> => ({
  long: makeIntlFormatter({ style: 'long', locale }),
  narrow: makeIntlFormatter({ style: 'narrow', locale })
})
