import { Typography } from '@mui/material'
import React from 'react'
import TimeAgo from 'react-timeago'

import { TimeAgoFormatter } from './TimeAgoFormatter'
import { localeTags, useI18n } from '../i18n'

export const LastUsedCell: React.FC<{ lastUsed: string | null }> = ({
  lastUsed
}) => {
  const { language, t } = useI18n()
  if (lastUsed === null) {
    return <Typography>{t('never')}</Typography>
  }

  if (+new Date(lastUsed) + 300000 > Date.now()) {
    return <Typography title={lastUsed}>{t('recently')}</Typography>
  }

  return (
    <TimeAgo
      date={lastUsed}
      formatter={TimeAgoFormatter(localeTags[language]).long}
    />
  )
}
